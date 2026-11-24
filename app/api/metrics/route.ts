import { cookies } from 'next/headers';
import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../lib/server-session';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Metrics unavailable.' }, { status: 503 });
  try {
    const jar = await cookies();
    let id = jar.get('mau_visitor')?.value;
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      id = crypto.randomUUID();
      jar.set('mau_visitor', id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    await supabase('/rest/v1/rpc/record_visit', undefined, { method: 'POST', body: JSON.stringify({ visitor: id }) });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: 'Metrics unavailable.' }, { status: 503 }); }
}
export async function GET() {
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Metrics unavailable.' }, { status: 503 });
  try {
    const { user, token } = await session();
    if (!user || !token) return Response.json({ error: 'Sign in required.' }, { status: 401 });
    const metrics = await supabase('/rest/v1/rpc/market_metrics', token, { method: 'POST', body: '{}' });
    return Response.json(metrics, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Metrics unavailable or admin access required.' }, { status: 403 }); }
}
