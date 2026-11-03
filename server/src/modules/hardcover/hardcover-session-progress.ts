import { addDateKeyDays, splitReadingSessionByDay } from '../../common/utils/reading-daily-stats.utils';
import { toTimeZoneStartOfDay } from '../../common/utils/timezone.utils';
import type { HardcoverRepository } from './hardcover.repository';

type ProgressSession = Awaited<ReturnType<HardcoverRepository['findProgressSessions']>>[number];

export function sessionProgressUpdates(session: ProgressSession, timeZone: string): Array<{ progress: number; actionAt: string }> {
  const endProgress = session.endProgress;
  if (endProgress == null) return [];
  if (session.progressDelta == null || session.progressDelta <= 0 || !(session.durationSeconds > 0)) {
    return [{ progress: endProgress, actionAt: session.endedAt.toISOString() }];
  }

  const segments = splitReadingSessionByDay(session, timeZone);
  let progress = endProgress - session.progressDelta;
  return segments.map((segment, index) => {
    progress += segment.progressDelta;
    const nextDay = toTimeZoneStartOfDay(addDateKeyDays(segment.day, 1), timeZone);
    // Midnight belongs to the next day, so stamp the preceding day's share just before it.
    const actionAt = new Date(Math.min(session.endedAt.getTime(), nextDay.getTime() - 1)).toISOString();
    return { progress: index === segments.length - 1 ? endProgress : progress, actionAt };
  });
}
