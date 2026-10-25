import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { ReadingSessionSource } from '@bookorbit/types';

import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';

export const ACHIEVEMENT_EVENT_READING_SESSION_SAVED = 'reading-session.saved';
export const ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED = 'book.status-changed';
export const ACHIEVEMENT_EVENT_ANNOTATION_CREATED = 'annotation.created';
export const ACHIEVEMENT_EVENT_COLLECTION_CREATED = 'collection.created';
export const ACHIEVEMENT_EVENT_LIBRARY_CATALOG_CHANGED = 'library.catalog-changed';
export const ACHIEVEMENT_EVENT_BACKFILL = 'achievement.backfill';
export const ACHIEVEMENT_EVENT_ACHIEVEMENT_AWARDED = 'achievement.awarded';
export const ACHIEVEMENT_EVENT_BOOK_RATING_CHANGED = 'book.rating-changed';
export const ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED = 'book.progress-changed';
export const ACHIEVEMENT_EVENT_BOOK_HARDCOVER_EDITION_CHANGED = 'book.hardcover-edition-changed';

export interface ReadingSessionSavedPayload {
  userId: number;
  bookFileId: number;
  durationSeconds: number;
  startedAt: Date;
  endedAt: Date;
  progressDelta: number | null;
  endProgress: number | null;
  timezone: string;
  source: ReadingSessionSource;
}

export interface BookStatusChangedPayload {
  userId: number;
  bookId: number;
  newStatus: string;
  previousStatus: string | null;
}

export interface AnnotationCreatedPayload {
  userId: number;
  bookId: number;
  annotationId: number;
}

export interface CollectionCreatedPayload {
  userId: number;
  collectionId: number;
}

export interface LibraryCatalogChangedPayload {
  userId: number;
  libraryId: number;
}

export interface BookRatingChangedPayload {
  userId: number;
  bookIds: number[];
  rating: number | null;
}

export interface BookProgressChangedPayload {
  userId: number;
  bookId: number;
  // Optional: Kobo syncs progress at the book level and has no single relevant file id.
  bookFileId?: number;
  progress: number;
  source: 'koreader' | 'kobo' | 'web_reader';
}

export interface BookHardcoverEditionChangedPayload {
  userId: number;
  bookId: number;
  hardcoverEditionId: string;
}

export type AchievementEventPayload =
  | ReadingSessionSavedPayload
  | BookStatusChangedPayload
  | AnnotationCreatedPayload
  | CollectionCreatedPayload
  | LibraryCatalogChangedPayload
  | BookRatingChangedPayload
  | BookProgressChangedPayload
  | BookHardcoverEditionChangedPayload;

@Injectable()
export class AchievementEventsService extends EventEmitter {
  private readonly logger = new Logger(AchievementEventsService.name);

  notifyBookProgressChanged(payload: BookProgressChangedPayload): void {
    const startedAt = Date.now();
    try {
      this.emit(ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED, payload);
    } catch (error: unknown) {
      const errorClass = error instanceof Error ? error.constructor.name : 'Error';
      const message = sanitizeLogValue(error instanceof Error ? error.message : String(error));
      this.logger.warn(
        `[book.progress_notification] [fail] userId=${payload.userId} bookId=${payload.bookId} durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${message}" - saved progress notification failed`,
      );
    }
  }
}
