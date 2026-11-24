import { cookies } from 'next/headers';

export const supabaseUrl = () => process.env.SUPABASE_URL;
export const supabaseKey = () => process.env.SUPABASE_ANON_KEY;
export async function supabase(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl()}${path}`, { ...init, headers: { apikey: supabaseKey()!, Authorization: `Bearer ${token || supabaseKey()}`, 'Content-Type': 'application/json', ...init.headers }, cache: 'no-store' });
  const raw = await response.text();
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(body?.message || body?.msg || 'Unable to complete the request.');
  return body;
}
export async function session() {
  const jar = await cookies();
  const access = jar.get('mau_access')?.value;
  if (access) try { return { token: access, user: await supabase('/auth/v1/user', access) }; } catch { /* Try refresh. */ }
  const refresh = jar.get('mau_refresh')?.value;
  if (refresh) try {
    const result = await supabase('/auth/v1/token?grant_type=refresh_token', undefined, { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) });
    if (!result?.access_token || !result?.refresh_token || !result?.user?.id) throw new Error('Invalid session');
    const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
    jar.set('mau_access', result.access_token, { ...options, maxAge: result.expires_in || 3600 });
    jar.set('mau_refresh', result.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
    return { token: result.access_token as string, user: result.user };
  } catch { /* Expired session. */ }
  return { token: undefined, user: null };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || new URL(request.url).protocol.replace(':', '');
    return parsed.host === host && parsed.protocol === protocol + ':';
  } catch { return false; }
}
