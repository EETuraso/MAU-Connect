export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: 'Password recovery is not configured.' }, { status: 503 });
  try {
    const { accessToken, password } = await request.json();
    if (typeof accessToken !== 'string' || !accessToken || typeof password !== 'string' || password.length < 8) return Response.json({ error: 'Use a valid recovery link and a password of at least 8 characters.' }, { status: 400 });
    const result = await fetch(`${url}/auth/v1/user`, { method: 'PUT', headers: { apikey: key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), cache: 'no-store' });
    if (!result.ok) {
      const body = await result.json().catch(() => ({}));
      return Response.json({ error: body.message || body.msg || 'The recovery link is invalid or expired. Request a new one.' }, { status: result.status });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Unable to update the password. Please try again.' }, { status: 400 });
  }
}
