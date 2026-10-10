// Bountied Desktop - Rust/Tauri layer.
//
// Authentication: device pairing (docs/desktop-pairing.md in the web repo).
//  * The website is the account authority. This app never sees a password.
//  * begin_pairing   -> announce this device + PKCE challenge, open the browser.
//  * complete_pairing-> redeem the one-time code (+ PKCE verifier) for a device session.
//  * Access tokens (~15 min) live in memory only. The refresh token is kept in the OS
//    credential store, rotated on every use, and never returned to the WebView.
//  * Any renewal failure clears everything and sends the user back to pairing.
//
// Every command is a narrow business operation. No fs/shell/generic-HTTP capability
// is exposed, and the WebView makes no network requests of its own.

mod pkce;

use serde::Serialize;
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::async_runtime::Mutex;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

// ── errors ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CommandError {
    /// Stable machine code the UI switches on.
    pub code: &'static str,
    /// Safe, human-readable message (never contains tokens).
    pub message: String,
}
type Res<T> = Result<T, CommandError>;
type CmdResult = Res<Value>;

fn err(code: &'static str, message: impl Into<String>) -> CommandError {
    CommandError { code, message: message.into() }
}

// ── configuration / HTTP ──────────────────────────────────────────────────────

/// Compile-time default; override at build time with BOUNTIED_API_URL.
/// Debug builds may also override at runtime for local development.
fn api_base() -> String {
    #[cfg(debug_assertions)]
    if let Ok(v) = std::env::var("BOUNTIED_API_URL") {
        return v.trim_end_matches('/').to_string();
    }
    option_env!("BOUNTIED_API_URL").unwrap_or("http://localhost:3000").trim_end_matches('/').to_string()
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(150)) // sandbox reviews can be slow
            .user_agent(concat!("BountiedDesktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("http client")
    })
}

/// One HTTP round trip. Network failures become a "network" error; every HTTP
/// status is returned to the caller together with its JSON body.
async fn raw(post: bool, path: &str, bearer: Option<&str>, body: Option<&Value>) -> Res<(u16, Value)> {
    let url = format!("{}{}", api_base(), path);
    let mut req = if post { http().post(url) } else { http().get(url) };
    if let Some(t) = bearer {
        req = req.bearer_auth(t);
    }
    if let Some(b) = body {
        req = req.json(b);
    }
    let resp = req.send().await.map_err(|_| err("network", "Could not reach Bountied. Check your connection."))?;
    let status = resp.status().as_u16();
    let parsed: Value = resp.json().await.unwrap_or_else(|_| json!({}));
    Ok((status, parsed))
}

fn map_status(status: u16, body: Value) -> CmdResult {
    if (200..300).contains(&status) {
        return Ok(body);
    }
    let msg = body.get("error").and_then(|v| v.as_str()).unwrap_or("Request failed.").to_string();
    Err(match status {
        401 => err("unauthenticated", "Session ended. Pair this device again."),
        402 => err("insufficient_funds", msg),
        403 => err("forbidden", msg),
        404 => err("not_found", msg),
        409 => err("conflict", msg),
        429 => err("rate_limited", msg),
        _ => err("server", msg),
    })
}

// ── credential store (refresh token only) ─────────────────────────────────────

mod vault {
    const SERVICE: &str = "com.bountied.desktop";
    const ACCOUNT: &str = "device-session";
    fn entry() -> Option<keyring::Entry> {
        keyring::Entry::new(SERVICE, ACCOUNT).ok()
    }
    pub fn save(refresh: &str) {
        if let Some(e) = entry() {
            let _ = e.set_password(refresh);
        }
    }
    pub fn load() -> Option<String> {
        entry()?.get_password().ok()
    }
    pub fn clear() {
        if let Some(e) = entry() {
            let _ = e.delete_credential();
        }
    }
}

// ── auth state ────────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
pub struct UserInfo {
    pub name: String,
    pub email: String,
}

struct Tokens {
    access: String,
    /// Monotonic clock: unaffected by the user changing the system time.
    access_exp: Instant,
    refresh: String,
}

struct Pending {
    pairing_id: String,
    verifier: String,
    expires: Instant,
}

#[derive(Default)]
struct Inner {
    tokens: Option<Tokens>,
    user: Option<UserInfo>,
    pending: Option<Pending>,
}

#[derive(Default)]
pub struct AuthState(Mutex<Inner>);

#[derive(Serialize)]
pub struct AuthStatus {
    /// "signed_out" | "signed_in" | "offline"
    pub state: &'static str,
    pub user: Option<UserInfo>,
    /// Set when we dropped a previous session (revoked/expired) so the UI can say why.
    pub reason: Option<&'static str>,
}

fn signed_out(reason: Option<&'static str>) -> AuthStatus {
    AuthStatus { state: "signed_out", user: None, reason }
}

enum RefreshFail {
    /// Revoked / expired / replayed: the device must pair again.
    Ended,
    /// Couldn't reach the server; keep the refresh token and try later.
    Offline,
    Limited,
}

fn forget(inner: &mut Inner) {
    inner.tokens = None;
    inner.user = None;
    vault::clear();
}

/// Rotates the refresh token. Caller holds the state lock, which serializes
/// refreshes (the server rejects a second use of the same refresh token).
async fn refresh_locked(inner: &mut Inner) -> Result<(), RefreshFail> {
    let presented = match inner.tokens.as_ref().map(|t| t.refresh.clone()).or_else(vault::load) {
        Some(r) => r,
        None => return Err(RefreshFail::Ended),
    };
    let body = json!({ "refreshToken": presented });
    match raw(true, "/api/desktop/session/refresh", None, Some(&body)).await {
        Ok((200, v)) => {
            let access = v.get("accessToken").and_then(|x| x.as_str());
            let refresh = v.get("refreshToken").and_then(|x| x.as_str());
            let ttl = v.get("expiresIn").and_then(|x| x.as_u64()).unwrap_or(0);
            match (access, refresh) {
                (Some(a), Some(r)) if ttl > 0 => {
                    vault::save(r);
                    inner.tokens = Some(Tokens {
                        access: a.to_string(),
                        access_exp: Instant::now() + Duration::from_secs(ttl),
                        refresh: r.to_string(),
                    });
                    Ok(())
                }
                _ => Err(RefreshFail::Ended),
            }
        }
        Ok((429, _)) => Err(RefreshFail::Limited),
        Ok((401, _)) | Ok((400, _)) => {
            forget(inner);
            Err(RefreshFail::Ended)
        }
        Ok(_) => Err(RefreshFail::Offline), // 5xx: transient, don't destroy the session
        Err(_) => Err(RefreshFail::Offline),
    }
}

fn refresh_err(f: RefreshFail) -> CommandError {
    match f {
        RefreshFail::Ended => err("unauthenticated", "Session ended. Pair this device again."),
        RefreshFail::Offline => err("network", "Could not reach Bountied. Check your connection."),
        RefreshFail::Limited => err("rate_limited", "Too many requests. Try again shortly."),
    }
}

/// A valid access token, refreshing first when it is missing or about to expire.
async fn access_token(state: &AuthState) -> Res<String> {
    let mut inner = state.0.lock().await;
    let fresh = inner
        .tokens
        .as_ref()
        .filter(|t| t.access_exp > Instant::now() + Duration::from_secs(30))
        .map(|t| t.access.clone());
    if let Some(a) = fresh {
        return Ok(a);
    }
    refresh_locked(&mut inner).await.map_err(refresh_err)?;
    inner.tokens.as_ref().map(|t| t.access.clone()).ok_or_else(|| err("unauthenticated", "Pair this device."))
}

/// After a 401: refresh once (unless another task already did) and return the new token.
async fn renew_after_401(state: &AuthState, stale: &str) -> Res<String> {
    let mut inner = state.0.lock().await;
    if let Some(t) = inner.tokens.as_ref() {
        if t.access != stale {
            return Ok(t.access.clone());
        }
    }
    refresh_locked(&mut inner).await.map_err(refresh_err)?;
    inner.tokens.as_ref().map(|t| t.access.clone()).ok_or_else(|| err("unauthenticated", "Pair this device."))
}

async fn authed(state: &AuthState, post: bool, path: &str, body: Option<Value>) -> CmdResult {
    let tok = access_token(state).await?;
    let (status, v) = raw(post, path, Some(&tok), body.as_ref()).await?;
    if status != 401 {
        return map_status(status, v);
    }
    // Revoked, or expired between our check and the server's. One renewal attempt.
    let tok2 = renew_after_401(state, &tok).await?;
    let (s2, v2) = raw(post, path, Some(&tok2), body.as_ref()).await?;
    map_status(s2, v2)
}

fn valid_id(id: &str) -> Res<&str> {
    let ok = !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok { Ok(id) } else { Err(err("bad_request", "Invalid identifier.")) }
}

// ── commands: pairing & session ───────────────────────────────────────────────

fn user_from(v: &Value) -> Option<UserInfo> {
    Some(UserInfo {
        name: v.get("name")?.as_str()?.to_string(),
        email: v.get("email")?.as_str()?.to_string(),
    })
}

/// Called once at startup. Uses the stored refresh token (if any) to resume silently.
#[tauri::command]
async fn restore_session(state: State<'_, AuthState>) -> Res<AuthStatus> {
    let had_stored = vault::load().is_some();
    {
        let mut inner = state.0.lock().await;
        if inner.tokens.is_some() && inner.user.is_some() {
            return Ok(AuthStatus { state: "signed_in", user: inner.user.clone(), reason: None });
        }
        if !had_stored {
            return Ok(signed_out(None));
        }
        match refresh_locked(&mut inner).await {
            Ok(()) => {}
            Err(RefreshFail::Ended) => return Ok(signed_out(Some("session_ended"))),
            Err(_) => return Ok(AuthStatus { state: "offline", user: None, reason: None }),
        }
    }
    let acct = authed(&state, false, "/api/desktop/account", None).await;
    match acct {
        Ok(v) => {
            let user = user_from(&v);
            state.0.lock().await.user = user.clone();
            Ok(AuthStatus { state: "signed_in", user, reason: None })
        }
        Err(e) if e.code == "unauthenticated" => Ok(signed_out(Some("session_ended"))),
        Err(_) => Ok(AuthStatus { state: "offline", user: None, reason: None }),
    }
}

#[derive(Serialize)]
pub struct PairingStarted {
    pub expires_in_sec: u64,
    pub device_name: String,
}

/// Step 1: announce this device, then open the website's authorize page in the browser.
#[tauri::command]
async fn begin_pairing(app: tauri::AppHandle, state: State<'_, AuthState>) -> Res<PairingStarted> {
    let pair = pkce::new_pkce();
    let device_name = pkce::device_name();
    let body = json!({
        "codeChallenge": pair.challenge,
        "deviceName": device_name,
        "platform": std::env::consts::OS,
        "appVersion": env!("CARGO_PKG_VERSION"),
    });
    let (status, v) = raw(true, "/api/desktop/pair/start", None, Some(&body)).await?;
    let v = map_status(status, v)?;

    let id = v.get("pairingId").and_then(|x| x.as_str()).unwrap_or("");
    if !pkce::valid_pairing_id(id) {
        return Err(err("server", "Unexpected response from Bountied."));
    }
    let ttl = v.get("expiresInSec").and_then(|x| x.as_u64()).unwrap_or(300).min(900);

    // The URL is built from the trusted API base + a validated id. Nothing from the
    // WebView is involved, so it can't be steered to another site.
    let url = format!("{}/desktop/connect?req={}", api_base(), id);
    app.opener().open_url(&url, None::<&str>).map_err(|_| err("internal", "Could not open your browser."))?;

    state.0.lock().await.pending = Some(Pending {
        pairing_id: id.to_string(),
        verifier: pair.verifier,
        expires: Instant::now() + Duration::from_secs(ttl),
    });
    Ok(PairingStarted { expires_in_sec: ttl, device_name })
}

/// Re-open the authorize page for the request that is already in progress.
#[tauri::command]
async fn reopen_pairing(app: tauri::AppHandle, state: State<'_, AuthState>) -> Res<()> {
    let inner = state.0.lock().await;
    let p = inner.pending.as_ref().filter(|p| p.expires > Instant::now()).ok_or_else(|| err("pairing_expired", "That request expired. Start again."))?;
    let url = format!("{}/desktop/connect?req={}", api_base(), p.pairing_id);
    app.opener().open_url(&url, None::<&str>).map_err(|_| err("internal", "Could not open your browser."))
}

#[tauri::command]
async fn cancel_pairing(state: State<'_, AuthState>) -> Res<()> {
    state.0.lock().await.pending = None;
    Ok(())
}

/// Step 3: redeem the pasted code.
#[tauri::command]
async fn complete_pairing(code: String, state: State<'_, AuthState>) -> Res<AuthStatus> {
    let code = pkce::clean_code(&code).ok_or_else(|| err("invalid_code", "That doesn't look like a Bountied code. It has 16 letters and numbers."))?;

    let (pairing_id, verifier) = {
        let inner = state.0.lock().await;
        match inner.pending.as_ref() {
            Some(p) if p.expires > Instant::now() => (p.pairing_id.clone(), p.verifier.clone()),
            _ => return Err(err("pairing_expired", "That request expired. Start again.")),
        }
    };

    let body = json!({ "pairingId": pairing_id, "code": code, "codeVerifier": verifier });
    let (status, v) = raw(true, "/api/desktop/pair/exchange", None, Some(&body)).await?;
    if status == 400 {
        return Err(err("invalid_code", "That code is invalid or has expired. Generate a new one on the website."));
    }
    let v = map_status(status, v)?;

    let access = v.get("accessToken").and_then(|x| x.as_str());
    let refresh = v.get("refreshToken").and_then(|x| x.as_str());
    let ttl = v.get("expiresIn").and_then(|x| x.as_u64()).unwrap_or(0);
    let user = v.get("user").and_then(user_from);
    let (Some(a), Some(r)) = (access, refresh) else {
        return Err(err("server", "Unexpected response from Bountied."));
    };

    vault::save(r);
    let mut inner = state.0.lock().await;
    inner.tokens = Some(Tokens { access: a.to_string(), access_exp: Instant::now() + Duration::from_secs(ttl.max(1)), refresh: r.to_string() });
    inner.user = user.clone();
    inner.pending = None; // verifier is single-use: drop it now
    Ok(AuthStatus { state: "signed_in", user, reason: None })
}

/// Sign out on this device: revoke server-side (best effort), then forget everything locally.
#[tauri::command]
async fn sign_out(state: State<'_, AuthState>) -> Res<()> {
    let tok = state.0.lock().await.tokens.as_ref().map(|t| t.access.clone());
    if let Some(t) = tok {
        let _ = raw(true, "/api/desktop/session/revoke", Some(&t), Some(&json!({}))).await;
    }
    let mut inner = state.0.lock().await;
    forget(&mut inner);
    inner.pending = None;
    Ok(())
}

// ── commands: Giver review workspace ──────────────────────────────────────────

#[tauri::command]
async fn get_account(state: State<'_, AuthState>) -> CmdResult {
    authed(&state, false, "/api/desktop/account", None).await
}

#[tauri::command]
async fn get_my_problems(state: State<'_, AuthState>) -> CmdResult {
    authed(&state, false, "/api/desktop/problems", None).await
}

#[tauri::command]
async fn get_submissions(problem_id: String, state: State<'_, AuthState>) -> CmdResult {
    let id = valid_id(&problem_id)?;
    authed(&state, false, &format!("/api/desktop/problems/{id}/submissions"), None).await
}

#[tauri::command]
async fn get_evidence(submission_id: String, state: State<'_, AuthState>) -> CmdResult {
    let id = valid_id(&submission_id)?;
    authed(&state, false, &format!("/api/desktop/submissions/{id}/evidence"), None).await
}

/// Starts a billed sandbox review. The server checks ownership, status and balance;
/// the UI must still confirm with the user first.
#[tauri::command]
async fn run_review(submission_id: String, state: State<'_, AuthState>) -> CmdResult {
    let id = valid_id(&submission_id)?;
    authed(&state, true, "/api/desktop/sandbox/run", Some(json!({ "submissionId": id }))).await
}

/// Accept + release escrow. Irreversible; the UI must confirm first.
#[tauri::command]
async fn accept_submission(problem_id: String, submission_id: String, state: State<'_, AuthState>) -> CmdResult {
    let (p, s) = (valid_id(&problem_id)?, valid_id(&submission_id)?);
    authed(&state, true, "/api/desktop/submissions/accept", Some(json!({ "problemId": p, "submissionId": s }))).await
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(AuthState::default())
        .invoke_handler(tauri::generate_handler![
            restore_session,
            begin_pairing,
            reopen_pairing,
            cancel_pairing,
            complete_pairing,
            sign_out,
            get_account,
            get_my_problems,
            get_submissions,
            get_evidence,
            run_review,
            accept_submission,
            get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bountied Desktop");
}
