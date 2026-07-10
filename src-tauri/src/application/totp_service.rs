use crate::error::{AppError, AppResult};
use crate::infrastructure::crypto;
use crate::state::AppState;
use crate::storage::Storage;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
use sha2::{Sha256, Digest};
use std::sync::Arc;
use serde::Serialize;

const TOTP_SECRET_KEY: &str = "totp_secret";
const TOTP_ENCRYPTED_MASTER_KEY: &str = "totp_encrypted_master_key";
const DOMAIN_SALT: &str = "toketeo-totp-key-derivation-v1";

#[derive(Serialize)]
pub struct TotpSetupResult {
    pub secret: String,
    pub uri: String,
    pub qr_code_svg: String,
}

fn derive_totp_encryption_key(totp_secret: &str) -> Result<[u8; 32], String> {
    let mut hasher = Sha256::new();
    hasher.update(DOMAIN_SALT.as_bytes());
    hasher.update(totp_secret.as_bytes());
    let hash = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash);
    Ok(key)
}

pub async fn generate_totp_setup(state: &AppState, _storage: &Arc<Storage>) -> AppResult<TotpSetupResult> {
    state.require_unlock().await?;

    let secret_vec = totp_rs::Secret::generate_secret().to_bytes()
        .map_err(|e| AppError::Internal(format!("Secret generation failed: {}", e)))?;
    let secret_base32 = base32_encode(&secret_vec);

    let totp = totp_rs::TOTP::new(
        totp_rs::Algorithm::SHA1,
        6,
        1,
        30,
        secret_vec,
        Some("Toketeo".to_string()),
        "Toketeo".to_string(),
    ).map_err(|e| AppError::Internal(format!("TOTP creation failed: {}", e)))?;

    let uri = totp.get_url();

    let qr_code = qrcode::QrCode::new(uri.as_bytes())
        .map_err(|e| AppError::Internal(format!("QR generation failed: {}", e)))?;

    let qr_code_svg = qr_code.render()
        .min_dimensions(200, 200)
        .dark_color(qrcode::render::svg::Color("#000000"))
        .light_color(qrcode::render::svg::Color("#ffffff"))
        .build();

    Ok(TotpSetupResult {
        secret: secret_base32,
        uri,
        qr_code_svg,
    })
}

fn base32_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut result = Vec::new();
    let mut buffer = 0u64;
    let mut bits = 0;

    for &byte in bytes {
        buffer = (buffer << 8) | byte as u64;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            let index = ((buffer >> bits) & 0x1F) as usize;
            result.push(ALPHABET[index]);
        }
    }
    if bits > 0 {
        let index = ((buffer << (5 - bits)) & 0x1F) as usize;
        result.push(ALPHABET[index]);
    }

    String::from_utf8(result).unwrap_or_default()
}

pub async fn verify_and_enable_totp(
    secret_base32: &str,
    code: &str,
    state: &AppState,
    storage: &Arc<Storage>,
) -> AppResult<bool> {
    let secret_bytes = base32_decode(secret_base32)
        .ok_or_else(|| AppError::Validation("Invalid TOTP secret".into()))?;

    if !verify_totp_code(&secret_bytes, code)? {
        return Ok(false);
    }

    let master_key = state.require_unlock().await?;

    let enc_key = derive_totp_encryption_key(secret_base32)
        .map_err(|e| AppError::Auth(e))?;

    let nonce = crypto::generate_nonce();

    let plaintext_master_key: &[u8; 32] = &master_key;
    let cipher = Aes256Gcm::new_from_slice(&enc_key)
        .map_err(|e| AppError::Auth(format!("Cipher init: {}", e)))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext_master_key.as_ref())
        .map_err(|e| AppError::Auth(format!("Encryption failed: {}", e)))?;

    let mut payload = Vec::new();
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&ciphertext);

    storage.set_app_secret(TOTP_SECRET_KEY, secret_base32.as_bytes()).await?;
    storage.set_app_secret(TOTP_ENCRYPTED_MASTER_KEY, &payload).await?;

    Ok(true)
}

pub async fn unlock_with_totp(
    code: &str,
    state: &AppState,
    storage: &Arc<Storage>,
) -> AppResult<bool> {
    let secret_bytes = storage.get_app_secret(TOTP_SECRET_KEY).await?
        .ok_or_else(|| AppError::Auth("TOTP not configured".into()))?;
    let secret_str = String::from_utf8(secret_bytes)
        .map_err(|_| AppError::Auth("Invalid secret".into()))?;

    let secret_raw = base32_decode(&secret_str)
        .ok_or_else(|| AppError::Auth("Invalid secret encoding".into()))?;

    if !verify_totp_code(&secret_raw, code)? {
        return Ok(false);
    }

    let payload = storage.get_app_secret(TOTP_ENCRYPTED_MASTER_KEY).await?
        .ok_or_else(|| AppError::Auth("TOTP encrypted key not found".into()))?;

    if payload.len() <= 12 {
        return Err(AppError::Auth("Invalid encrypted payload".into()));
    }

    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(nonce_bytes);

    let enc_key = derive_totp_encryption_key(&secret_str)
        .map_err(|e| AppError::Auth(e))?;

    let cipher = Aes256Gcm::new_from_slice(&enc_key)
        .map_err(|e| AppError::Auth(format!("Cipher init: {}", e)))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext)
        .map_err(|e| AppError::Auth(format!("Decryption failed: {}", e)))?;

    if plaintext.len() != 32 {
        return Err(AppError::Auth("Invalid decrypted key length".into()));
    }

    let mut master_key = [0u8; 32];
    master_key.copy_from_slice(&plaintext);

    state.set_master_key(master_key, 3600).await;

    Ok(true)
}

fn verify_totp_code(secret: &[u8], code: &str) -> AppResult<bool> {
    let totp = totp_rs::TOTP::new(
        totp_rs::Algorithm::SHA1,
        6,
        1,
        30,
        secret.to_vec(),
        Some("Toketeo".to_string()),
        "Toketeo".to_string(),
    ).map_err(|e| AppError::Internal(format!("TOTP creation failed: {}", e)))?;

    let current_code = totp.generate_current()
        .map_err(|e| AppError::Internal(format!("TOTP generation failed: {}", e)))?;

    Ok(current_code == code)
}

fn base32_decode(input: &str) -> Option<Vec<u8>> {
    const DECODE: [i8; 256] = {
        let mut table = [-1i8; 256];
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let mut i = 0;
        while i < 32 {
            table[alphabet[i] as usize] = i as i8;
            i += 1;
        }
        let lowercase = b"abcdefghijklmnopqrstuvwxyz234567";
        let mut i = 0;
        while i < 32 {
            if lowercase[i] != alphabet[i] {
                table[lowercase[i] as usize] = i as i8;
            }
            i += 1;
        }
        table
    };

    let input = input.trim().replace('=', "");
    let mut result = Vec::new();
    let mut buffer = 0u64;
    let mut bits = 0;

    for &byte in input.as_bytes() {
        let idx = DECODE.get(byte as usize).copied().unwrap_or(-1);
        if idx < 0 {
            return None;
        }
        buffer = (buffer << 5) | idx as u64;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            result.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    Some(result)
}

pub async fn is_totp_enabled(storage: &Arc<Storage>) -> AppResult<bool> {
    storage.get_app_secret(TOTP_SECRET_KEY).await.map(|v| v.is_some())
}

pub async fn disable_totp(storage: &Arc<Storage>) -> AppResult<()> {
    storage.set_app_secret(TOTP_SECRET_KEY, b"").await?;
    storage.set_app_secret(TOTP_ENCRYPTED_MASTER_KEY, b"").await?;
    Ok(())
}
