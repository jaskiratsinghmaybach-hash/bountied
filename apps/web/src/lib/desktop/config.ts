/**
 * Bountied Desktop pairing: every tunable in one place so the security
 * posture is reviewable at a glance. See docs/desktop-pairing.md.
 */
export const PAIRING = {
  /** Whole pairing request (desktop "Connect" click -> code redeemed). */
  requestTtlSec: 5 * 60,
  /** The one-time code, counted from the moment the user authorizes. Never outlives the request. */
  codeTtlSec: 3 * 60,
  /** Wrong attempts allowed against ONE pairing before it is burned. */
  maxFailedPerPairing: 5,
  codeLength: 16,
} as const;

export const SESSION = {
  accessTtlSec: 15 * 60,
  /** Sliding: every successful refresh pushes this out. */
  refreshTtlSec: 30 * 24 * 60 * 60,
  /** Hard cap from first pairing; after this the device must pair again. */
  absoluteTtlSec: 180 * 24 * 60 * 60,
  /** Don't write lastSeenAt on every request. */
  lastSeenThrottleSec: 60,
} as const;

/** Fixed windows. `key` prefixes are independent so one axis can't mask another. */
export const LIMITS = {
  startPerIp: { limit: 10, windowSec: 60 * 60 },
  authorizePerUser: { limit: 6, windowSec: 10 * 60 },
  authorizePerIp: { limit: 20, windowSec: 10 * 60 },
  failedExchangePerIp: { limit: 20, windowSec: 15 * 60 },
  failedExchangePerAccount: { limit: 10, windowSec: 15 * 60 },
  exchangeAttemptsPerIp: { limit: 60, windowSec: 15 * 60 },
  refreshPerIp: { limit: 120, windowSec: 15 * 60 },
} as const;
