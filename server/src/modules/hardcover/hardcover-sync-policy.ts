import type {
  HardcoverBookSyncEffectiveReason,
  HardcoverBookSyncMode,
  HardcoverBookSyncOverride,
  HardcoverSyncDisabledReason,
  ReadStatus,
} from '@bookorbit/types';

import { HARDCOVER_NON_RETRYABLE_SYNC_ERRORS, HARDCOVER_SYNC_RETRY_DELAYS_MS } from './hardcover.constants';

const SYNCABLE_STATUSES = new Set<ReadStatus>(['want_to_read', 'reading', 'rereading', 'on_hold', 'read', 'skimmed', 'abandoned']);
const NON_RETRYABLE_SYNC_ERRORS = new Set<string>(HARDCOVER_NON_RETRYABLE_SYNC_ERRORS);

export interface HardcoverBookSyncPolicySettings {
  effectiveEnabled: boolean;
  disabledReason: HardcoverSyncDisabledReason | null;
  bookSyncMode: HardcoverBookSyncMode;
}

export interface HardcoverBookSyncDecision {
  syncEnabled: boolean;
  effectiveReason: HardcoverBookSyncEffectiveReason | null;
}

export function normalizeHardcoverBookSyncOverride(
  input: { syncOverride?: string | null; syncExcluded?: boolean | null } | null | undefined,
): HardcoverBookSyncOverride {
  if (input?.syncOverride === 'included' || input?.syncOverride === 'excluded') return input.syncOverride;
  if (input?.syncExcluded === true) return 'excluded';
  return null;
}

/** A book in an excluded library only syncs when included on its own, so turning it on has to say so. */
export function resolveHardcoverBookSyncOverrideForToggle(
  bookSyncMode: HardcoverBookSyncMode,
  syncEnabled: boolean,
  libraryExcluded = false,
): HardcoverBookSyncOverride {
  if (libraryExcluded || bookSyncMode === 'selected_only') {
    return syncEnabled ? 'included' : null;
  }
  return syncEnabled ? null : 'excluded';
}

export function resolveHardcoverBookSyncDecision(input: {
  settings: HardcoverBookSyncPolicySettings;
  status: string | null | undefined;
  syncOverride: HardcoverBookSyncOverride;
  libraryExcluded?: boolean;
}): HardcoverBookSyncDecision {
  if (!input.settings.effectiveEnabled) {
    return {
      syncEnabled: false,
      effectiveReason: input.settings.disabledReason ?? 'global_disabled',
    };
  }

  // Ahead of the status, so an unread book in an excluded library does not read as waiting to sync.
  if (input.libraryExcluded && input.syncOverride === null) {
    return { syncEnabled: false, effectiveReason: 'library_excluded' };
  }

  if (!input.status || !SYNCABLE_STATUSES.has(input.status as ReadStatus)) {
    return {
      syncEnabled: false,
      effectiveReason: input.status === 'unread' ? 'unread' : 'unsupported_status',
    };
  }

  if (input.syncOverride === 'excluded') {
    return { syncEnabled: false, effectiveReason: 'excluded' };
  }

  if (input.syncOverride === 'included') {
    return { syncEnabled: true, effectiveReason: null };
  }

  if (input.settings.bookSyncMode === 'all_eligible') {
    return { syncEnabled: true, effectiveReason: null };
  }

  return { syncEnabled: false, effectiveReason: 'not_selected' };
}

export function isRetryableHardcoverSyncError(syncError: string | null | undefined): boolean {
  if (!syncError) return false;
  if (NON_RETRYABLE_SYNC_ERRORS.has(syncError)) return false;
  if (syncError.startsWith('no_status_mapping:')) return false;
  return true;
}

export interface HardcoverRetrySchedule {
  retryCount: number;
  nextRetryAt: Date | null;
}

export function computeHardcoverRetrySchedule(error: string, currentRetryCount: number, now = new Date()): HardcoverRetrySchedule {
  if (!isRetryableHardcoverSyncError(error)) {
    return { retryCount: 0, nextRetryAt: null };
  }

  const retryCount = Math.max(0, currentRetryCount) + 1;
  const delayMs = HARDCOVER_SYNC_RETRY_DELAYS_MS[retryCount - 1];
  if (delayMs === undefined) {
    return { retryCount, nextRetryAt: null };
  }

  return {
    retryCount,
    nextRetryAt: new Date(now.getTime() + delayMs),
  };
}
