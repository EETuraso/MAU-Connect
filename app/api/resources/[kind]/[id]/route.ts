import { session, supabase, supabaseKey, supabaseUrl } from '../../../../../lib/server-session';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!uuid.test(id) || !['past', 'handout'].includes(kind)) return Response.json({ error: 'Resource not found.' }, { status: 404 });
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Resources are not configured.' }, { status: 503 });
  try {
    const { token, user } = await session();
    if (!token || !user) return Response.json({ error: 'Sign in to download this resource.' }, { status: 401 });
    const table = kind === 'past' ? 'past_questions' : 'handouts';
    const bucket = kind === 'past' ? 'past-questions' : 'handouts';
    const records = await supabase(`/rest/v1/${table}?id=eq.${id}&select=file_url`, token) as { file_url: string }[];
    if (!records?.[0]?.file_url) return Response.json({ error: 'Resource not found.' }, { status: 404 });
    const file = new URL(records[0].file_url);
    const base = new URL(supabaseUrl()!);
    const prefix = `/storage/v1/object/public/${bucket}/`;
    if (file.origin !== base.origin || !file.pathname.startsWith(prefix)) throw new Error('Invalid resource location.');
    const path = file.pathname.slice(prefix.length);
    if (!path || path.includes('..')) throw new Error('Invalid resource location.');
    const signed = await supabase(`/storage/v1/object/sign/${bucket}/${path}`, token, { method: 'POST', body: JSON.stringify({ expiresIn: 60 }) }) as { signedURL?: string };
    if (!signed.signedURL || !signed.signedURL.startsWith('/object/sign/')) throw new Error('Unable to retrieve the file.');
    const download = new URL('/storage/v1' + signed.signedURL, base.origin);
    download.searchParams.set('download', `${kind}-${id}.pdf`);
    await supabase('/rest/v1/rpc/record_resource_download', token, { method: 'POST', body: JSON.stringify({ kind, resource: id }) });
    return new Response(null, { status: 302, headers: { Location: download.toString(), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to download the resource.' }, { status: 400 }); }
}
