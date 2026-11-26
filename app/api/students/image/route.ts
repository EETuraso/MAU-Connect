import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../../lib/server-session';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Images are not configured.' }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const { user, token } = await session();
  if (!user || !token) return Response.json({ error: 'Sign in to send a photo.' }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    const chatId = typeof form.get('chat_id') === 'string' ? String(form.get('chat_id')) : '';
    if (chatId && !uuid.test(chatId)) return Response.json({ error: 'Invalid chat.' }, { status: 400 });
    const types: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    if (!(file instanceof File) || !types[file.type] || !file.size || file.size > 4 * 1024 * 1024) return Response.json({ error: 'Choose a JPG, PNG or WebP photo under 4 MB.' }, { status: 400 });
    if (form.get('view_once') === 'true') {
      if (file.size > 2 * 1024 * 1024) return Response.json({ error: 'View-once photos must be under 2 MB.' }, { status: 400 });
      const imageData = Buffer.from(await file.arrayBuffer()).toString('base64');
      const id = await supabase(chatId ? '/rest/v1/rpc/send_student_view_once_in_chat' : '/rest/v1/rpc/send_student_view_once', token, {
        method: 'POST',
        body: JSON.stringify(chatId ? { image_data: imageData, image_type: file.type, target_chat_id: chatId } : { image_data: imageData, image_type: file.type }),
      });
      return Response.json({ ok: true, id: typeof id === 'string' ? id : undefined });
    }
    const path = `${user.id}/${crypto.randomUUID()}.${types[file.type]}`;
    await supabase(`/storage/v1/object/student-chat-images/${path}`, token, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    let messageId: string | undefined;
    try {
      if (chatId) {
        const id = await supabase('/rest/v1/rpc/student_chat_send', token, { method: 'POST', body: JSON.stringify({ target_chat_id: chatId, message_body: `[image]${path}` }) });
        messageId = typeof id === 'string' ? id : undefined;
      } else {
        const rows = await supabase('/rest/v1/student_messages', token, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, body: `[image]${path}` }) });
        messageId = Array.isArray(rows) && typeof rows[0]?.id === 'string' ? rows[0].id : undefined;
      }
    }
    catch (error) { await supabase(`/storage/v1/object/student-chat-images/${path}`, token, { method: 'DELETE' }).catch(() => {}); throw error; }
    return Response.json({ ok: true, id: messageId });
  } catch { return Response.json({ error: 'Could not send this photo. Please try again.' }, { status: 400 }); }
}

export async function PUT(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return new Response(null, { status: 503 });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const { user, token } = await session();
  if (!user || !token) return new Response(null, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 400 });
  try {
    const photo = await supabase('/rest/v1/rpc/open_student_view_once', token, { method: 'POST', body: JSON.stringify({ message_id: id }) });
    if (!photo?.data || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) return new Response(null, { status: 404 });
    return new Response(Buffer.from(photo.data, 'base64'), { headers: { 'Content-Type': photo.type, 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
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
    const match = typeof message?.body === 'string' ? /^\[image\]([0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp))$/i.exec(message.body) : null;
    if (!match || !match[1].startsWith(`${message.user_id}/`)) return new Response(null, { status: 404 });
    const result = await supabase(`/storage/v1/object/sign/student-chat-images/${match[1]}`, token, { method: 'POST', body: JSON.stringify({ expiresIn: 60 }) });
    return Response.redirect(`${supabaseUrl()}/storage/v1${result.signedURL}`, 302);
  } catch { return new Response(null, { status: 404 }); }
}
