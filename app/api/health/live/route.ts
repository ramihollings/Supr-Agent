export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'pass',
    service: process.env.SUPR_SERVICE_ROLE || 'web',
    generatedAt: new Date().toISOString(),
  });
}
