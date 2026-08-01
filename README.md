# Payment fixes — round 2 (real root causes)

This is a full replacement of the payment integration bundle from earlier.
Two real bugs were found and fixed, and the payout model was rebuilt around
your decision to go manual for v1 (no live payout provider — you transfer
via Wise by hand).

## The two root-cause bugs

**1. Whop webhook signature verification was fundamentally wrong.**
The code checked a `whop-signature` header with a plain hex HMAC. Whop
actually signs webhooks with the **Standard Webhooks spec**: three headers
(`webhook-id`, `webhook-timestamp`, `webhook-signature`), a
period-joined signed payload (`{id}.{timestamp}.{body}`), a base64-encoded
secret, and a base64 (not hex) signature. This meant **every real webhook
from Whop would have been silently rejected with a 401** — even once
checkout itself started working, credits would never have landed. Fixed in
`src/app/api/webhooks/whop/route.ts`.

**2. Checkout was calling an endpoint that doesn't exist.**
`/v1/checkout/sessions` isn't a real Whop API path. The real flow uses
`client.checkoutConfigurations.create(...)` from the official `@whop/sdk`
package, which returns a `plan_id` you pass to an **embedded** React
component (`<WhopCheckoutEmbed planId="..." />` from `@whop/checkout/react`)
— an iframe that renders inline on your page, so givers never leave your
domain. Fixed in `src/lib/payments/whop-provider.ts`, and the two client
components that trigger it.

## Solver payouts — rebuilt for manual v1

Per your decision: no live payout API. The flow now is:

1. Solver adds bank details (legal name, country, account number,
   IFSC/SWIFT) directly in the app — stored as-is in the DB, no external
   verification call, so nothing can hang waiting on an API that isn't
   real.
2. When a submission is accepted, `availableBalance` is credited at 95% of
   the bounty (first 5% cut) — same as before, unchanged.
3. Solver requests a withdrawal from `availableBalance`. This immediately
   creates a `PayoutRequest` (95% of the requested amount, second 5% cut)
   with `eligibleAt` set to 7 days out, and shows the solver "sent by
   [date]".
4. You see every pending request — with the bank details needed to wire
   the money — at **`/admin/payouts`**, and mark each one sent (or failed,
   which refunds the solver's balance) once you've transferred it via Wise.

## What you need to add to `.env`

```
WHOP_API_KEY=...        # you already have this
WHOP_WEBHOOK_SECRET=...  # you already have this — starts with whsec_
WHOP_COMPANY_ID=biz_XXXXXXXXX   # NEW — copy from your Whop dashboard URL
ADMIN_EMAILS=you@example.com    # NEW — comma-separated, gates /admin/payouts
```

`WHOP_COMPANY_ID` is not the same as your API key — it's the ID visible in
your Whop dashboard's URL (`whop.com/dashboard/biz_XXXXXXXXX/`). Checkout
configuration creation requires it explicitly.

## What you need to run

```bash
npm install              # package.json now includes @whop/sdk + @whop/checkout
npx prisma generate
npx prisma migrate deploy   # or migrate dev in dev — applies the new migration
```

## Full file list in this bundle

**Fixed (root cause):**
- `src/app/api/webhooks/whop/route.ts` — correct Standard Webhooks signature verification
- `src/lib/payments/whop-provider.ts` — real `@whop/sdk` checkout call, payout methods removed
- `src/lib/payments/types.ts` — interface trimmed to match (no more fake payout-provider methods)
- `src/lib/payments/index.ts` — matching type exports
- `src/app/api/checkout/create-session/route.ts` — returns `planId`, wrapped in try/catch so failures return real JSON (this is what fixed your "Unexpected end of JSON input" crash)
- `src/app/api/checkout/status/route.ts` — **new**, lets the embedded checkout poll for the webhook-confirmed balance instead of trusting the client-side `onComplete` event directly

**Rebuilt for manual v1 payouts:**
- `src/components/payments/bank-verification-modal.tsx` — now a plain details form, no API call, can't hang
- `src/components/payments/payout-warning-banner.tsx` — updated copy/prop name, links to `/settings` (the old link was dead)
- `src/lib/payouts/bank-details-actions.ts` — **new**, saves bank details directly
- `src/lib/payouts/withdraw.ts` — rewritten: no provider call, immediate debit + 7-day `eligibleAt` window
- `src/lib/payouts/actions.ts` — returns `eligibleAt` so the UI can show a real date
- `src/lib/payouts/admin-actions.ts` — **new**, mark-sent / mark-failed (with refund) actions
- `src/lib/auth/require-admin.ts` — **new**, simple `ADMIN_EMAILS` allowlist gate
- `src/app/(app)/admin/payouts/page.tsx` — **new**, your manual payout queue
- `src/components/admin/payout-row-actions.tsx` — **new**

**Updated for the embedded-checkout + polling flow:**
- `src/components/payments/add-credits-widget.tsx`
- `src/components/payments/insufficient-credits-modal.tsx`
- `src/components/payments/withdraw-widget.tsx`
- `src/components/payments/earnings-withdraw-section.tsx`
- `src/components/payments/settings-payout-section.tsx`
- `src/app/(app)/dashboard/solver/page.tsx`, `.../solver/earnings/page.tsx`, `src/app/(app)/settings/page.tsx` — prop renames (`bankVerified` → `bankDetailsAdded`)
- `src/lib/escrow/release.ts` — doc comment fix only, logic unchanged

**Schema:**
- `prisma/schema.prisma` — `User.bankVerified`/`whopPayoutMethodId` replaced with `bankDetailsAdded`/`bankCountry`/`bankAccountNumber`/`bankIfscOrSwift`; `PayoutRequest` gets a bank-detail snapshot + `eligibleAt`
- `prisma/migrations/20260801100833_manual_v1_payouts/migration.sql` — new migration on top of the one from the last bundle

**Unchanged, included for completeness (from the previous bundle, still correct):**
- `src/lib/payments/fees.ts`, `src/lib/payments/credits.ts`
- `src/lib/problems/create-actions.ts`, the bounty creation form/page/detail-page pieces

## Known limitation, flagged honestly

`bankAccountNumber` is stored as plain text in the DB right now — there's
no encryption-at-rest layer in this codebase yet. For a real v1 with actual
money moving, that's worth encrypting (e.g. `pgcrypto` at the column level,
or application-level encryption before the value ever reaches Prisma)
before you have real users submitting real bank details. Flagging this
rather than quietly leaving it — it's a genuine gap, not an oversight to
gloss over.
