import { CronExpressionParser } from 'cron-parser';

function legacyIntervalMinutes(interval: string): number {
  const value = interval.toLowerCase();
  if (value.includes('monthly')) return 30 * 24 * 60;
  if (value.includes('weekly')) return 7 * 24 * 60;
  if (value.includes('daily')) return 24 * 60;
  if (value.includes('hourly')) return 60;
  const match = value.match(/every\s+(\d+)\s*(minute|hour|day)/);
  if (!match) return 10;
  const amount = Number(match[1]);
  if (match[2] === 'hour') return amount * 60;
  if (match[2] === 'day') return amount * 24 * 60;
  return amount;
}

export function nextScheduledRun(job: {
  schedule_expression?: string | null;
  timezone?: string | null;
  interval?: string | null;
}, after: Date): Date {
  if (job.schedule_expression?.trim()) {
    return CronExpressionParser.parse(job.schedule_expression, {
      currentDate: after,
      tz: job.timezone || 'UTC',
    }).next().toDate();
  }
  return new Date(after.getTime() + legacyIntervalMinutes(job.interval || '10 minutes') * 60_000);
}
