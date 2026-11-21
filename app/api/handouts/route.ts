import { cookies } from 'next/headers';

const url = () => process.env.SUPABASE_URL;
const key = () => process.env.SUPABASE_ANON_KEY;
async function sb(path: string, token: string | undefined, init: RequestInit = {}) {
  const result = await fetch(`${url()}${path}`, { ...init, headers: { apikey: key()!, Authorization: `Bearer ${token || key()}`, 'Content-Type': 'application/json', ...init.headers }, cache: 'no-store' });
  const text = await result.text(); const body = text ? JSON.parse(text) : null;
  if (!result.ok) throw new Error(body?.message || body?.msg || 'Request failed');
  return body;
}
async function identity() {
  const jar = await cookies(); const token = jar.get('mau_access')?.value;
  if (!token) return { token: undefined, user: null };
  try { return { token, user: await sb('/auth/v1/user', token) }; } catch { return { token: undefined, user: null }; }
}
export async function POST(request: Request) {
  if (!url() || !key()) return Response.json({ error: 'Connect Supabase to enable handouts.' }, { status: 503 });
  try {
    const { token, user } = await identity();
    if (!user || !token) return Response.json({ error: 'Sign in required.' }, { status: 401 });
    const profile = (await sb(`/rest/v1/profiles?id=eq.${user.id}&select=*`, token))[0];
    if (!profile || profile.role !== 'admin' || profile.suspended) return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const form = await request.formData(); const file = form.get('file');
    const title = String(form.get('title') || '').trim(); const course = String(form.get('course') || '').trim(); const description = String(form.get('description') || '').trim();
    if (title.length < 3 || title.length > 160 || course.length < 2 || course.length > 120) throw new Error('Provide a valid handout title and course.');
    if (!(file instanceof File) || file.type !== 'application/pdf' || file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error('Choose a PDF file under 10MB.');
    const path = `${user.id}/${crypto.randomUUID()}.pdf`;
    await sb(`/storage/v1/object/handouts/${path}`, token, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    const file_url = `${url()}/storage/v1/object/public/handouts/${path}`;
    const created = await sb('/rest/v1/handouts', token, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title, course, description: description.slice(0, 500), file_url, created_by: user.id }) });
    return Response.json(created?.[0] || { ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to add handout.' }, { status: 400 }); }
}
