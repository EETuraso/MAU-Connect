const url = () => process.env.SUPABASE_URL;
const key = () => process.env.SUPABASE_ANON_KEY;
export async function POST(request: Request) {
  if (!url() || !key()) return Response.json({ error: 'Password recovery is not configured.' }, { status: 503 });
  try {
    const { email } : { email?: unknown } = await request.json();
    if (typeof email !== 'string' || !email.includes('@')) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
    const redirect = encodeURIComponent(`${new URL(request.url).origin}/reset-password`);
    const result = await fetch(`${url()}/auth/v1/recover?redirect_to=${redirect}`, { method: 'POST', headers: { apikey: key()!, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
    if (!result.ok) { const body: any = await result.json().catch(() => null); throw new Error(body?.msg || body?.message || 'Unable to send the reset email.'); }
    return Response.json({ ok: true, message: 'If an account exists for that email, a password reset link is on its way.' });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to send the reset email.' }, { status: 400 }); }
}
