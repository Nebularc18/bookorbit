export const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql';
export const HARDCOVER_MIN_INTERVAL_MS = 1100;
export const HARDCOVER_MAX_RETRIES = 3;

// Backoff schedule for failed book syncs: 2m, 10m, 30m, 2h, 6h, 24h (~32h total window).
export const HARDCOVER_SYNC_RETRY_DELAYS_MS = [
  2 * 60 * 1000,
  10 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;
export const HARDCOVER_SYNC_MAX_RETRIES = HARDCOVER_SYNC_RETRY_DELAYS_MS.length;
export const HARDCOVER_RETRY_SWEEP_BATCH_SIZE = 50;
export const HARDCOVER_NON_RETRYABLE_SYNC_ERRORS = ['no_match', 'Hardcover API error: 401', 'Hardcover API error: 403'] as const;

export const HARDCOVER_STATUS = {
  WANT_TO_READ: 1,
  CURRENTLY_READING: 2,
  READ: 3,
  PAUSED: 4,
  DNF: 5,
  IGNORED: 6,
} as const;

export const HARDCOVER_PRIVACY = {
  PUBLIC: 1,
  FOLLOWS: 2,
  PRIVATE: 3,
} as const;

export const HARDCOVER_EVENT = {
  RATING_CHANGED: 'hardcover.rating_changed',
} as const;
