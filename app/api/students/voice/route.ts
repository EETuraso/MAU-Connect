import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../../lib/server-session';

const prefix = '[voice]';
const pathPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webm|ogg|mp4)$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Voice notes are not configured.' }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const { user, token } = await session();
  if (!user || !token) return Response.json({ error: 'Sign in to send a voice note.' }, { status: 401 });
  let path = '';
  try {
    const form = await request.formData();
    const file = form.get('file');
    const chatId = typeof form.get('chat_id') === 'string' ? String(form.get('chat_id')) : '';
    if (chatId && !uuid.test(chatId)) return Response.json({ error: 'Invalid chat.' }, { status: 400 });
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024) return Response.json({ error: 'Voice notes must be under 4 MB.' }, { status: 400 });
    const type = file.type.split(';')[0];
    const extension = ({ 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4' } as Record<string, string>)[type];
    if (!extension) return Response.json({ error: 'This recording format is not supported.' }, { status: 400 });
    path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    await supabase(`/storage/v1/object/student-voice/${path}`, token, { method: 'POST', headers: { 'Content-Type': type }, body: file });
    let messageId: string | undefined;
    try {
      if (chatId) {
        const id = await supabase('/rest/v1/rpc/student_chat_send', token, { method: 'POST', body: JSON.stringify({ target_chat_id: chatId, message_body: prefix + path }) });
        messageId = typeof id === 'string' ? id : undefined;
      } else {
        const rows = await supabase('/rest/v1/student_messages', token, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, body: prefix + path }) });
        messageId = Array.isArray(rows) && typeof rows[0]?.id === 'string' ? rows[0].id : undefined;
      }
    } catch (error) {
      await supabase(`/storage/v1/object/student-voice/${path}`, token, { method: 'DELETE' }).catch(() => {});
      throw error;
    }
    return Response.json({ ok: true, id: messageId });
  } catch { return Response.json({ error: 'Could not send the voice note. Please try again.' }, { status: 400 }); }
}

export async function GET(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return new Response(null, { status: 503 });
  const { user, token } = await session();
  if (!user || !token) return new Response(null, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 400 });
  try {
    let message;
    try {
      message = await supabase('/rest/v1/rpc/student_chat_message', token, { method: 'POST', body: JSON.stringify({ target_message_id: id }) });
      if (!message?.body) throw new Error('Legacy message lookup');
    } catch {
      const messages = await supabase('/rest/v1/rpc/student_room_messages', token, { method: 'POST', body: '{}' });
      message = messages.find((item: { id: string }) => item.id === id);
    }
    const path = typeof message?.body === 'string' && message.body.startsWith(prefix) ? message.body.slice(prefix.length) : '';
    if (!pathPattern.test(path) || !path.startsWith(`${message.user_id}/`)) return new Response(null, { status: 404 });
    const result = await supabase(`/storage/v1/object/sign/student-voice/${path}`, token, { method: 'POST', body: JSON.stringify({ expiresIn: 60 }) });
    return Response.redirect(`${supabaseUrl()}/storage/v1${result.signedURL}`, 302);
  } catch { return new Response(null, { status: 404 }); }
}
