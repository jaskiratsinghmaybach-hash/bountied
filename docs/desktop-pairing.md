# Bountied Desktop: device pairing

The website is the account authority. The Desktop app never sees a password or a
Supabase token; it holds a revocable **device session** that the website issued.

## Flow

```
Desktop                          Website (signed-in browser)              Server
   |  1. Connect click                                                        |
   |--- POST /api/desktop/pair/start {codeChallenge, deviceName, ...} ------->|
   |<-- {pairingId} ----------------------------------------------------------|
   |  2. opens  {site}/desktop/connect?req=<pairingId>                        |
   |                                 shows account + device, user clicks      |
   |                                 "Authorize this device"  --------------->|
   |                                 <-- one-time 16-char code (shown once) --|
   |  3. user copies the code and pastes it into the app                      |
   |--- POST /api/desktop/pair/exchange {pairingId, code, codeVerifier} ----->|
   |<-- {accessToken (15 min), refreshToken, user} ---------------------------|
   |  4. ... POST /api/desktop/session/refresh rotates both tokens ...        |
   |  5. Integrations page lists the device; Revoke kills it on the next call |
```

Deviation from the original plan, deliberate: pairing is **started from the app**,
not from a code generated cold on the website. That is what lets the code be bound to
one specific app instance (PKCE), so a code phished onto an attacker's machine is useless.
The website's "Connect Bountied Desktop" entry point is therefore: open the app, click Connect.

## Properties (all covered by `desktop-pairing-e2e.ts`, run against real Postgres)

| Property | How |
|---|---|
| Code is single use | `consumedAt` flipped by one atomic conditional UPDATE; 6 simultaneous redemptions -> 1 session |
| Code is short-lived | 3 min from authorization, never past the 5 min request lifetime; generated only on click |
| Code is high entropy | 16 symbols from a 32-symbol alphabet (80 bits), unbiased, no look-alike characters |
| A stolen/phished code is useless | Redeeming also requires the PKCE verifier, which never leaves the originating app |
| Brute force | Per-pairing (5 wrong guesses burns the request), per-IP, per-account, plus request-start and authorize limits; one generic error for every failure |
| DB leak is not enough | Codes and tokens are stored as HMAC-SHA256 hashes keyed by `DESKTOP_AUTH_SECRET` |
| Short-lived access | 15 min opaque token, looked up (and revocation-checked) on every request |
| Refresh rotation + theft detection | Refresh token rotates every use; replaying any previously-rotated token revokes the whole session |
| Revocation | Integrations -> Revoke takes effect on the very next request; refresh dies too |
| Re-pair on failure | Any renewal failure clears local state and returns the app to the pairing screen |
| Renewal is capped | Sliding 30-day refresh window, hard 180-day limit per pairing |

## Setup

1. Add to the web app's environment (local `.env` and your host):
   `DESKTOP_AUTH_SECRET` - at least 32 random characters. Generate one with
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
   Rotating it invalidates every device session and in-flight pairing (users re-pair).
2. `npx prisma migrate deploy` then `npx prisma generate`.
3. `NEXT_PUBLIC_SITE_URL` is already used by the app; the desktop app opens
   `{BOUNTIED_API_URL}/desktop/connect`, so both must point at the same origin.

## Known limits / follow-ups

- Rate-limit client IP comes from `X-Forwarded-For`. Behind Vercel that is correct; if you
  self-host, make your proxy overwrite (not append to) that header.
- A refresh response lost in transit forces a re-pair (the retry looks like a replay).
- The OS keychain stores the refresh token; there is no extra at-rest encryption beyond that.
- `RateLimitBucket` rows are swept opportunistically, not by a scheduled job.
- The Integrations device list does not auto-refresh; reload the page after revoking elsewhere.
