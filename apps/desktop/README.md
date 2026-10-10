# Bountied Desktop

Tauri v2 + Rust native shell, React/TypeScript/Tailwind v4 UI, Zustand state.
Milestone 1: **device pairing** + the **Giver review workspace** (bounties -> submissions
-> sandbox evidence -> run review / accept & release).

## How sign-in works (no passwords, no third-party login)
1. Click **Connect Bountied Desktop**. The app registers this device with the website
   (with a PKCE challenge) and opens `{site}/desktop/connect?req=...` in your browser.
2. On the website (signed in as you) review the account + device and click **Authorize**.
   A one-time 16-character code appears. Copy it.
3. Paste it into the app. Pasting a full code connects immediately.
4. The app holds a 15-minute access token in memory and a rotating refresh token in the
   OS credential store (Windows Credential Manager / macOS Keychain). Revoke the device
   under **Integrations** on the website and the app returns to the pairing screen.

Full design + test coverage: `docs/desktop-pairing.md` in the web repo (in `desktop-backend.patch`).

## Security rules
- The WebView makes no network requests and never sees a token (CSP `connect-src 'self' ipc:`).
- Only named business commands exist in `src-tauri/src/lib.rs`. No fs/shell/http/opener
  permission is granted to JS; the browser is opened from Rust to a URL built from the
  configured API origin and a validated id.
- The server is authoritative for ownership, payment and reveal; repo URLs are returned
  only after release.
- Sandbox output is untrusted: rendered as plain text, size-capped.

## Setup on Windows
Prerequisites: Rust (rustup), MSVC Build Tools ("Desktop development with C++"), WebView2.

1. Web repo (`D:\bountied`): apply `review-engine-fix.patch` (already done) then
   `git apply --whitespace=nowarn desktop-backend.patch`. Add `DESKTOP_AUTH_SECRET`
   (32+ random chars) to its `.env`, then `npx prisma migrate deploy` and `npx prisma generate`.
2. Desktop (`D:\bountied-desktop`):
   ```
   npm install
   npx tauri icon app-icon.png
   npm run tauri dev
   ```
   No `.env` is needed any more. Debug builds talk to `http://localhost:3000`
   (run `npm run dev` in `D:\bountied`). Release builds read `BOUNTIED_API_URL` at build time.

## Status
- Verified here: backend pairing logic against a real Postgres (21 checks), the Rust PKCE/code
  helpers (6 unit tests, RFC 7636 vector), frontend `tsc --strict` + production build.
- NOT verified here: the Tauri glue in `lib.rs` has not been compiled (no Tauri toolchain in
  the authoring sandbox). Expect small first-compile fixes; paste errors back.
- Not built yet: Solver views, command palette, resizable panels, auto-update, code signing.
- GitHub sign-in needs nothing special: you sign in on the website however you normally do,
  and pairing happens after that.
