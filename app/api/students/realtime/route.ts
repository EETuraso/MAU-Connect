import { sameOrigin, session, supabaseKey, supabaseUrl } from '../../../../lib/server-session';

export async function GET(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const { user, token } = await session();
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!user || !token) return Response.json({ error: 'Sign in to join Student Block.' }, { status: 401 });
  if (!url || !key) return Response.json({ error: 'Student Block is not configured.' }, { status: 503 });

  const realtimeUrl = `${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
  return Response.json({ url: realtimeUrl, token }, { headers: { 'Cache-Control': 'private, no-store' } });
}
