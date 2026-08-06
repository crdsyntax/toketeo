use crate::application::totp_service;
use crate::error::{AppError, AppResult};
use crate::infrastructure::crypto;
use crate::state::AppState;
use crate::storage::Storage;
use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::sync::Arc;

pub const SESSION_KEY: &str = "master_key";
pub const SESSION_SALT: &str = "master_salt";
pub const SESSION_PASSWORD_HASH: &str = "master_password_hash";

const RECOVERY_CODE_HASH: &str = "recovery_code_hash";
const RECOVERY_ENCRYPTED_MASTER_KEY: &str = "recovery_encrypted_master_key";
const RECOVERY_DOMAIN_SALT: &str = "toketeo-recovery-key-derivation-v1";
const RECOVERY_CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

fn derive_recovery_key(recovery_code: &str) -> Result<[u8; 32], String> {
    let mut hasher = Sha256::new();
    hasher.update(RECOVERY_DOMAIN_SALT.as_bytes());
    hasher.update(recovery_code.as_bytes());
    let hash = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash);
    Ok(key)
}

fn random_recovery_code() -> String {
    let mut bytes = [0u8; 20];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut chars = Vec::with_capacity(23);
    for (i, &b) in bytes.iter().enumerate() {
        if i > 0 && i % 5 == 0 {
            chars.push(b'-');
        }
        chars.push(RECOVERY_CODE_ALPHABET[(b as usize) % RECOVERY_CODE_ALPHABET.len()]);
    }
    String::from_utf8(chars).unwrap_or_default()
}

fn encrypt_master_key_payload(master_key: &[u8; 32], enc_key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(enc_key).map_err(|e| format!("Cipher init: {}", e))?;
    let nonce = crypto::generate_nonce();
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), master_key.as_ref())
        .map_err(|e| format!("Encryption failed: {}", e))?;
    let mut payload = Vec::with_capacity(crypto::NONCE_LEN + ciphertext.len());
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&ciphertext);
    Ok(payload)
}

fn decrypt_master_key_payload(payload: &[u8], enc_key: &[u8; 32]) -> Result<[u8; 32], String> {
    if payload.len() <= crypto::NONCE_LEN {
        return Err("Invalid encrypted payload".into());
    }
    let (nonce_bytes, ciphertext) = payload.split_at(crypto::NONCE_LEN);
    let mut nonce = [0u8; crypto::NONCE_LEN];
    nonce.copy_from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(enc_key).map_err(|e| format!("Cipher init: {}", e))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;
    if plaintext.len() != 32 {
        return Err("Invalid decrypted key length".into());
    }
    let mut master_key = [0u8; 32];
    master_key.copy_from_slice(&plaintext);
    Ok(master_key)
}

pub async fn check_master_password_exists(storage: &Arc<Storage>) -> AppResult<bool> {
    storage.get_app_secret(SESSION_PASSWORD_HASH).await.map(|v| v.is_some())
}

pub async fn create_master_password(
    password: &str,
    storage: &Arc<Storage>,
) -> AppResult<[u8; 32]> {
    let (hash, _) = crypto::hash_password(password).map_err(|e| AppError::Auth(e))?;
    let salt = crypto::generate_salt();
    let key = crypto::derive_key(password, &salt).map_err(|e| AppError::Auth(e))?;

    storage.set_app_secret(SESSION_PASSWORD_HASH, hash.as_bytes()).await?;
    storage.set_app_secret(SESSION_SALT, &salt).await?;

    Ok(key)
}

pub async fn unlock_master_password(
    password: &str,
    storage: &Arc<Storage>,
) -> AppResult<[u8; 32]> {
    let hash_bytes = storage
        .get_app_secret(SESSION_PASSWORD_HASH)
        .await?
        .ok_or_else(|| AppError::Auth("No master password set".into()))?;
    let hash = String::from_utf8(hash_bytes).map_err(|_| AppError::Auth("Invalid hash".into()))?;

    let valid = crypto::verify_password(password, &hash).map_err(|e| AppError::Auth(e))?;
    if !valid {
        return Err(AppError::Auth("Incorrect master password".into()));
    }

    let salt = storage
        .get_app_secret(SESSION_SALT)
        .await?
        .ok_or_else(|| AppError::Auth("No salt found".into()))?;

    let key = crypto::derive_key(password, &salt).map_err(|e| AppError::Auth(e))?;
    Ok(key)
}

pub async fn change_master_password(
    old_password: &str,
    new_password: &str,
    _state: &AppState,
    storage: &Arc<Storage>,
) -> AppResult<[u8; 32]> {
    let old_key = unlock_master_password(old_password, storage).await?;
    let new_key = create_master_password(new_password, storage).await?;
    reencrypt_all_connections(storage, &old_key, &new_key).await?;
    totp_service::update_encrypted_master_key(storage, &new_key).await?;
    invalidate_recovery_code(storage).await?;

    let salt = crypto::generate_salt();
    let new_key_derived = crypto::derive_key(new_password, &salt)
        .map_err(|e| AppError::Auth(e))?;
    storage.set_app_secret(SESSION_SALT, &salt).await?;

    Ok(new_key_derived)
}

pub async fn generate_recovery_code(
    state: &AppState,
    storage: &Arc<Storage>,
) -> AppResult<String> {
    let master_key = state.require_unlock().await?;

    let code = random_recovery_code();
    let enc_key = derive_recovery_key(&code).map_err(|e| AppError::Auth(e))?;
    let payload = encrypt_master_key_payload(&master_key, &enc_key)
        .map_err(|e| AppError::Auth(e))?;
    let (hash, _) = crypto::hash_password(&code).map_err(|e| AppError::Auth(e))?;

    storage.set_app_secret(RECOVERY_CODE_HASH, hash.as_bytes()).await?;
    storage.set_app_secret(RECOVERY_ENCRYPTED_MASTER_KEY, &payload).await?;

    Ok(code)
}

pub async fn is_recovery_code_set(storage: &Arc<Storage>) -> AppResult<bool> {
    storage
        .get_app_secret(RECOVERY_CODE_HASH)
        .await
        .map(|v| v.is_some_and(|bytes| !bytes.is_empty()))
}

async fn invalidate_recovery_code(storage: &Arc<Storage>) -> AppResult<()> {
    storage.set_app_secret(RECOVERY_CODE_HASH, b"").await?;
    storage.set_app_secret(RECOVERY_ENCRYPTED_MASTER_KEY, b"").await?;
    Ok(())
}

pub async fn recover_master_password(
    recovery_code: &str,
    new_password: &str,
    storage: &Arc<Storage>,
) -> AppResult<[u8; 32]> {
    let hash_bytes = storage
        .get_app_secret(RECOVERY_CODE_HASH)
        .await?
        .filter(|b| !b.is_empty())
        .ok_or_else(|| AppError::Auth("No recovery code configured".into()))?;
    let hash = String::from_utf8(hash_bytes)
        .map_err(|_| AppError::Auth("Invalid recovery hash".into()))?;

    let valid = crypto::verify_password(recovery_code, &hash)
        .map_err(|e| AppError::Auth(e))?;
    if !valid {
        return Err(AppError::Auth("Invalid recovery code".into()));
    }

    let payload = storage
        .get_app_secret(RECOVERY_ENCRYPTED_MASTER_KEY)
        .await?
        .ok_or_else(|| AppError::Auth("Recovery key not found".into()))?;
    let enc_key = derive_recovery_key(recovery_code).map_err(|e| AppError::Auth(e))?;
    let old_key = decrypt_master_key_payload(&payload, &enc_key)
        .map_err(|e| AppError::Auth(e))?;

    let new_key = create_master_password(new_password, storage).await?;
    reencrypt_all_connections(storage, &old_key, &new_key).await?;
    totp_service::update_encrypted_master_key(storage, &new_key).await?;

    let payload = encrypt_master_key_payload(&new_key, &enc_key)
        .map_err(|e| AppError::Auth(e))?;
    storage.set_app_secret(RECOVERY_ENCRYPTED_MASTER_KEY, &payload).await?;

    let salt = crypto::generate_salt();
    let new_key_derived = crypto::derive_key(new_password, &salt)
        .map_err(|e| AppError::Auth(e))?;
    storage.set_app_secret(SESSION_SALT, &salt).await?;

    Ok(new_key_derived)
}

async fn reencrypt_all_connections(
    storage: &Arc<Storage>,
    old_key: &[u8; 32],
    new_key: &[u8; 32],
) -> AppResult<()> {
    let connections = storage.get_all_connections().await?;
    for mut conn in connections {
        if let Some(enc) = &conn.password_enc {
            if let Some(nonce_vec) = &conn.password_nonce {
                let nonce: [u8; 12] = nonce_vec.clone().try_into().map_err(|_| AppError::Auth("Invalid nonce".into()))?;
                let plaintext = crypto::decrypt(enc, &nonce, old_key)
                    .map_err(|e| AppError::Auth(e))?;
                let (new_enc, new_nonce) = crypto::encrypt(&plaintext, new_key)
                    .map_err(|e| AppError::Auth(e))?;
                conn.password_enc = Some(new_enc);
                conn.password_nonce = Some(new_nonce.to_vec());
            }
        }
        if let Some(enc) = &conn.ssh_enc {
            if let Some(nonce_vec) = &conn.ssh_nonce {
                let nonce: [u8; 12] = nonce_vec.clone().try_into().map_err(|_| AppError::Auth("Invalid nonce".into()))?;
                let plaintext = crypto::decrypt(enc, &nonce, old_key)
                    .map_err(|e| AppError::Auth(e))?;
                let (new_enc, new_nonce) = crypto::encrypt(&plaintext, new_key)
                    .map_err(|e| AppError::Auth(e))?;
                conn.ssh_enc = Some(new_enc);
                conn.ssh_nonce = Some(new_nonce.to_vec());
            }
        }
        storage.update_connection_encrypted(&conn).await?;
    }
    Ok(())
}
