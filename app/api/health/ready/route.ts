import dbClient from '@/lib/database/db_client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const failures: string[] = [];
  try {
    await dbClient.queryOne('SELECT 1 as ok');
  } catch (error: any) {
    failures.push(`Database unreachable: ${error?.message || String(error)}`);
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.APP_PASSWORD) failures.push('APP_PASSWORD is not configured.');
    if (!process.env.AUTH_SECRET) failures.push('AUTH_SECRET is not configured.');
    if (process.env.SUPR_TELEGRAM_ENABLED === 'true') {
      if (!process.env.TELEGRAM_BOT_TOKEN) failures.push('TELEGRAM_BOT_TOKEN is not configured.');
      if (!process.env.TELEGRAM_WEBHOOK_SECRET) failures.push('TELEGRAM_WEBHOOK_SECRET is not configured.');
      if (!process.env.TELEGRAM_CHAT_ID) failures.push('TELEGRAM_CHAT_ID is not configured.');
    }
    if (process.env.SUPR_GITHUB_ENABLED === 'true' && !process.env.GITHUB_TOKEN) {
      failures.push('GITHUB_TOKEN is not configured.');
    }
  }

  const status = failures.length === 0 ? 'pass' : 'fail';
  return Response.json(
    { status, generatedAt: new Date().toISOString(), failures },
    { status: status === 'pass' ? 200 : 503 },
  );
}
