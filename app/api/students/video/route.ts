import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../../lib/server-session';

const prefix = '[video]';
const pathPattern = /^[0-9a-f-]{36}\/([0-9a-f-]{36})\.(mp4|webm|mov)$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Video messages are not configured.' }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const { user, token } = await session();
  if (!user || !token) return Response.json({ error: 'Sign in to send a video.' }, { status: 401 });
  let path = '';
  try {
    const form = await request.formData();
    const file = form.get('file');
    const chatId = typeof form.get('chat_id') === 'string' ? String(form.get('chat_id')) : '';
    if (!uuid.test(chatId)) return Response.json({ error: 'Invalid chat.' }, { status: 400 });
    const types: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
    };
    if (!(file instanceof File) || !file.size || file.size > 16 * 1024 * 1024 || !types[file.type]) {
      return Response.json({ error: 'Choose an MP4, WebM or MOV video under 16 MB.' }, { status: 400 });
    }
    path = `${user.id}/${crypto.randomUUID()}.${types[file.type]}`;
    await supabase(`/storage/v1/object/student-chat-videos/${path}`, token, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    try {
      const id = await supabase('/rest/v1/rpc/student_chat_send', token, {
        method: 'POST',
        body: JSON.stringify({ target_chat_id: chatId, message_body: prefix + path }),
      });
      return Response.json({ ok: true, id: typeof id === 'string' ? id : undefined });
    } catch (error) {
      await supabase(`/storage/v1/object/student-chat-videos/${path}`, token, { method: 'DELETE' }).catch(() => {});
      throw error;
    }
  } catch {
    return Response.json({ error: 'Could not send this video. Please try again.' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return new Response(null, { status: 503 });
  const { user, token } = await session();
  if (!user || !token) return new Response(null, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!uuid.test(id)) return new Response(null, { status: 400 });
  try {
    const message = await supabase('/rest/v1/rpc/student_chat_message', token, {
      method: 'POST',
      body: JSON.stringify({ target_message_id: id }),
    });
    const path = typeof message?.body === 'string' && message.body.startsWith(prefix) ? message.body.slice(prefix.length) : '';
    if (!pathPattern.test(path) || !path.startsWith(`${message.user_id}/`)) return new Response(null, { status: 404 });
    const result = await supabase(`/storage/v1/object/sign/student-chat-videos/${path}`, token, {
      method: 'POST',
      body: JSON.stringify({ expiresIn: 60 }),
    });
    return Response.redirect(`${supabaseUrl()}/storage/v1${result.signedURL}`, 302);
  } catch {
    return new Response(null, { status: 404 });
  }
}
