import { describe, expect, it } from 'vitest';

import { sessionProgressUpdates } from './hardcover-session-progress';

const session = {
  id: 1,
  startedAt: new Date('2024-01-02T23:00:00Z'),
  endedAt: new Date('2024-01-03T00:30:00Z'),
  durationSeconds: 5400,
  progressDelta: 30,
  endProgress: 50,
};

describe('sessionProgressUpdates', () => {
  it('preserves the starting progress when apportioning an overnight session', () => {
    expect(sessionProgressUpdates(session, 'UTC')).toEqual([
      { progress: 40, actionAt: '2024-01-02T23:59:59.999Z' },
      { progress: 50, actionAt: '2024-01-03T00:30:00.000Z' },
    ]);
  });

  it('handles the longer day when daylight saving time ends', () => {
    expect(
      sessionProgressUpdates(
        {
          ...session,
          startedAt: new Date('2024-10-26T21:00:00Z'),
          endedAt: new Date('2024-10-27T23:00:00Z'),
          durationSeconds: 93600,
          progressDelta: 26,
        },
        'Europe/Stockholm',
      ),
    ).toEqual([
      { progress: 25, actionAt: '2024-10-26T21:59:59.999Z' },
      { progress: 50, actionAt: '2024-10-27T22:59:59.999Z' },
    ]);
  });

  it('attributes a session ending exactly at midnight to the preceding day', () => {
    expect(sessionProgressUpdates({ ...session, endedAt: new Date('2024-01-03T00:00:00Z'), durationSeconds: 3600 }, 'UTC')).toEqual([
      { progress: 50, actionAt: '2024-01-02T23:59:59.999Z' },
    ]);
  });

  it('does not invent intermediate progress when the delta is unknown', () => {
    expect(sessionProgressUpdates({ ...session, progressDelta: null }, 'UTC')).toEqual([{ progress: 50, actionAt: '2024-01-03T00:30:00.000Z' }]);
  });
});
