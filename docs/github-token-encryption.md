# GitHub OAuth token encryption

`User.githubAccessToken` uses AES-256-GCM ciphertext with the versioned `enc:v1:` prefix. The key is `GITHUB_TOKEN_ENCRYPTION_KEY`, a base64-encoded 32-byte random value. Keep it in the deployment secret manager; never commit it or put it in client-visible variables. Back it up securely because losing it makes encrypted GitHub tokens unreadable.

Generate a key with Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set the same key in every server environment before enabling encrypted-token writes. Deploy code that can read both legacy plaintext and `enc:v1:` ciphertext, then run the one-off migration against the intended database. Prefer `DIRECT_URL` for the script. Back up the database first.

From `apps/web`, first perform a dry run:

```powershell
npm run db:encrypt-github-tokens
```

Only after confirming the environment and backup, apply the migration:

```powershell
npm run db:encrypt-github-tokens -- --apply
```

The script never prints token values. It updates only rows whose stored value still matches the plaintext value it read. Re-running is safe; already encrypted rows are skipped. Keep legacy plaintext reads temporarily for migration compatibility, then remove that fallback only after confirming all rows are encrypted. Do not rotate or replace the key without a planned re-encryption procedure.
