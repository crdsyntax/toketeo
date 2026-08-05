use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "toketeo";
const MASTER_KEY_ENTRY: &str = "master_password";

#[cfg(windows)]
async fn is_user_consent_verifier_available() -> bool {
    use windows::Security::Credentials::UI::{UserConsentVerifier, UserConsentVerifierAvailability};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::StationsAndDesktops::{
        OpenInputDesktop, SetThreadDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_READOBJECTS,
    };

    let async_op = match UserConsentVerifier::CheckAvailabilityAsync() {
        Ok(op) => op,
        Err(_) => return false,
    };

    tokio::task::spawn_blocking(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            if let Ok(desktop) = OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS) {
                let _ = SetThreadDesktop(desktop);
            }
        }

        let result = async_op.get();

        unsafe { CoUninitialize(); }

        match result {
            Ok(availability) => availability == UserConsentVerifierAvailability::Available,
            Err(_) => false,
        }
    })
    .await
    .unwrap_or(false)
}

#[cfg(not(windows))]
async fn is_user_consent_verifier_available() -> bool {
    false
}

pub async fn is_available() -> bool {
    cfg!(target_os = "windows") && is_user_consent_verifier_available().await
}

#[cfg(windows)]
async fn request_verification_inner(hwnd: isize) -> AppResult<bool> {
    use windows::Security::Credentials::UI::{UserConsentVerifier, UserConsentVerificationResult};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::StationsAndDesktops::{
        OpenInputDesktop, SetThreadDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_READOBJECTS,
    };
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

    let message = windows::core::HSTRING::from("Unlock Toketeo session with Windows Hello");
    let async_op = UserConsentVerifier::RequestVerificationAsync(&message)
        .map_err(|e| AppError::Internal(format!("Windows Hello prompt failed: {}", e)))?;

    let result = tokio::task::spawn_blocking(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            if let Ok(desktop) = OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS) {
                let _ = SetThreadDesktop(desktop);
            }
            if hwnd != 0 {
                let _ = SetForegroundWindow(HWND(hwnd as *mut std::ffi::c_void));
            }
        }

        let r = async_op.get();

        unsafe { CoUninitialize(); }
        r
    })
    .await
    .map_err(|e| AppError::Internal(format!("Task join failed: {}", e)))?
    .map_err(|e| AppError::Internal(format!("Windows Hello verification failed: {}", e)))?;

    Ok(result == UserConsentVerificationResult::Verified)
}

#[cfg(not(windows))]
async fn request_verification_inner(_hwnd: isize) -> AppResult<bool> {
    Err(AppError::Internal("Windows Hello is not available on this platform".into()))
}

pub async fn request_verification(hwnd: isize) -> AppResult<bool> {
    request_verification_inner(hwnd).await
}

pub fn store_password(password: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, MASTER_KEY_ENTRY)
        .map_err(|e| AppError::Internal(format!("Keyring init: {}", e)))?;
    entry
        .set_password(password)
        .map_err(|e| AppError::Internal(format!("Keyring set: {}", e)))?;
    Ok(())
}

pub fn get_password() -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(SERVICE_NAME, MASTER_KEY_ENTRY)
        .map_err(|e| AppError::Internal(format!("Keyring init: {}", e)))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Internal(format!("Keyring get: {}", e))),
    }
}

/// Returns whether a master password is stored in the OS keyring, WITHOUT
/// retrieving the secret. Never expose the actual password to the frontend.
pub fn has_password() -> AppResult<bool> {
    get_password().map(|p| p.is_some())
}

pub fn delete_password() -> AppResult<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, MASTER_KEY_ENTRY)
        .map_err(|e| AppError::Internal(format!("Keyring init: {}", e)))?;
    entry
        .delete_credential()
        .map_err(|e| AppError::Internal(format!("Keyring delete: {}", e)))?;
    Ok(())
}
