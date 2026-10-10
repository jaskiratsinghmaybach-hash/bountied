//! Pure, dependency-light helpers for the device-pairing flow. No Tauri, no
//! network: everything here is unit-tested (`cargo test pkce`).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};

pub struct PkcePair {
    /// Secret. Lives only in this process's memory for the life of one pairing attempt.
    pub verifier: String,
    /// base64url(SHA-256(verifier)). Safe to send to the server.
    pub challenge: String,
}

/// RFC 7636 S256 with a 256-bit random verifier from the OS CSPRNG.
pub fn new_pkce() -> PkcePair {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = challenge_for(&verifier);
    PkcePair { verifier, challenge }
}

pub fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

const CODE_ALPHABET: &str = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
pub const CODE_LEN: usize = 16;

/// Accepts what a human pastes ("abcd-efgh 1234 ..."), returns the canonical
/// 16-char code, or None. Mirrors the server's normalization (O->0, I/L->1).
pub fn clean_code(input: &str) -> Option<String> {
    if input.len() > 64 {
        return None;
    }
    let cleaned: String = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| match c.to_ascii_uppercase() {
            'O' => '0',
            'I' | 'L' => '1',
            other => other,
        })
        .collect();
    if cleaned.chars().count() == CODE_LEN && cleaned.chars().all(|c| CODE_ALPHABET.contains(c)) {
        Some(cleaned)
    } else {
        None
    }
}

/// Pairing ids are 128-bit base64url (22 chars). We validate what the server
/// hands back before ever putting it into a URL we open in the browser.
pub fn valid_pairing_id(id: &str) -> bool {
    id.len() == 22 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Human-readable device label shown on the website's authorize page.
pub fn device_name() -> String {
    let raw = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_default();
    let cleaned: String = raw.chars().filter(|c| !c.is_control()).take(60).collect();
    if cleaned.trim().is_empty() {
        format!("{} device", std::env::consts::OS)
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_rfc7636_appendix_b_vector() {
        assert_eq!(
            challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn generated_pair_is_well_formed_and_unique() {
        let a = new_pkce();
        let b = new_pkce();
        assert_eq!(a.verifier.len(), 43);
        assert_eq!(a.challenge.len(), 43);
        assert_eq!(a.challenge, challenge_for(&a.verifier));
        assert_ne!(a.verifier, b.verifier);
    }

    #[test]
    fn code_cleaning_accepts_pasted_shapes() {
        let want = Some("ABCD1234EFGH5678".to_string());
        assert_eq!(clean_code("ABCD-1234-EFGH-5678"), want);
        assert_eq!(clean_code("  abcd 1234 efgh 5678\n"), want);
        assert_eq!(clean_code("abcd1234efgh5678"), want);
        assert_eq!(clean_code("ABCD-1234-EFGH-567B").unwrap().len(), 16);
        // look-alike fixes agree with the server
        assert_eq!(clean_code("OOOO-IIII-LLLL-0000"), Some("0000111111110000".to_string()));
    }

    #[test]
    fn code_cleaning_rejects_bad_input() {
        for bad in ["", "short", "ABCD-1234-EFGH-567", "ABCD-1234-EFGH-56789", "ABCD-1234-EFGH-567U", "ABCD-1234-EFGH-56;8", &"A".repeat(200)] {
            assert_eq!(clean_code(bad), None, "{bad}");
        }
    }

    #[test]
    fn pairing_id_validation() {
        assert!(valid_pairing_id("AbC_-123AbC_-123AbC_-1"));
        for bad in ["", "short", "AbC_-123AbC_-123AbC_-12", "AbC_-123AbC_-123AbC/-1", "AbC_-123AbC_-123AbC?-1"] {
            assert!(!valid_pairing_id(bad), "{bad}");
        }
    }

    #[test]
    fn device_name_is_never_empty() {
        assert!(!device_name().trim().is_empty());
    }
}
