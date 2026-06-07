import { OAuth2Client } from 'google-auth-library';

const verifier = new OAuth2Client();

export async function requireInternalOidc(request: Request): Promise<Response | null> {
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_LOCAL_INTERNAL_API === 'true') return null;
  const audience = process.env.SUPR_INTERNAL_AUDIENCE || new URL(request.url).origin;
  const expectedEmail = process.env.SUPR_INTERNAL_SERVICE_ACCOUNT;
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!audience || !expectedEmail || !token) {
    return Response.json({ ok: false, error: 'Internal OIDC identity is required.' }, { status: 401 });
  }
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || payload.email !== expectedEmail) {
      return Response.json({ ok: false, error: 'Internal service identity is not authorized.' }, { status: 403 });
    }
    return null;
  } catch {
    return Response.json({ ok: false, error: 'Internal OIDC token is invalid.' }, { status: 401 });
  }
}
