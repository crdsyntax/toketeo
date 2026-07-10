use crate::error::{AppError, AppResult};
use crate::infrastructure::crypto;
use crate::state::AppState;
use crate::storage::Storage;
use std::sync::Arc;

pub const SESSION_KEY: &str = "master_key";
pub const SESSION_SALT: &str = "master_salt";
pub const SESSION_PASSWORD_HASH: &str = "master_password_hash";

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
    let new_key = create_master_password(new_password, storage).await?;

    let connections = storage.get_all_connections().await?;
    for mut conn in connections {
        if let Some(enc) = &conn.password_enc {
            if let Some(nonce_vec) = &conn.password_nonce {
                let old_key = unlock_master_password(old_password, storage).await?;
                let nonce: [u8; 12] = nonce_vec.clone().try_into().map_err(|_| AppError::Auth("Invalid nonce".into()))?;
                let plaintext = crypto::decrypt(enc, &nonce, &old_key)
                    .map_err(|e| AppError::Auth(e))?;
                let (new_enc, new_nonce) = crypto::encrypt(&plaintext, &new_key)
                    .map_err(|e| AppError::Auth(e))?;
                conn.password_enc = Some(new_enc);
                conn.password_nonce = Some(new_nonce.to_vec());
            }
        }
        if let Some(enc) = &conn.ssh_enc {
            if let Some(nonce_vec) = &conn.ssh_nonce {
                let old_key = unlock_master_password(old_password, storage).await?;
                let nonce: [u8; 12] = nonce_vec.clone().try_into().map_err(|_| AppError::Auth("Invalid nonce".into()))?;
                let plaintext = crypto::decrypt(enc, &nonce, &old_key)
                    .map_err(|e| AppError::Auth(e))?;
                let (new_enc, new_nonce) = crypto::encrypt(&plaintext, &new_key)
                    .map_err(|e| AppError::Auth(e))?;
                conn.ssh_enc = Some(new_enc);
                conn.ssh_nonce = Some(new_nonce.to_vec());
            }
        }
        storage.update_connection_encrypted(&conn).await?;
    }

    let salt = crypto::generate_salt();
    let new_key_derived = crypto::derive_key(new_password, &salt)
        .map_err(|e| AppError::Auth(e))?;
    storage.set_app_secret(SESSION_SALT, &salt).await?;

    Ok(new_key_derived)
}
