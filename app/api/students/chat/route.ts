import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../../lib/server-session';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configured() {
  return Boolean(supabaseUrl() && supabaseKey());
}

export async function GET(request: Request) {
  if (!configured()) return Response.json({ error: 'Student Block is not configured.' }, { status: 503 });
  try {
    const { user, token } = await session();
    if (!user || !token) return Response.json({ user: null, chats: [], contacts: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
    const query = new URL(request.url).searchParams;
    const chatId = query.get('messages') || '';
    const payload = chatId
      ? await supabase('/rest/v1/rpc/student_chat_messages', token, { method: 'POST', body: JSON.stringify({ target_chat_id: chatId }) })
      : await supabase('/rest/v1/rpc/student_chat_bootstrap', token, { method: 'POST', body: '{}' });
    return Response.json(chatId ? { messages: payload } : payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Student chat could not load.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!configured()) return Response.json({ error: 'Student Block is not configured.' }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  try {
    const { user, token } = await session();
    if (!user || !token) return Response.json({ error: 'Sign in to join Student Block.' }, { status: 401 });
    const input: unknown = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({ error: 'Invalid request.' }, { status: 400 });
    const body = input as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'send') {
      const chatId = typeof body.chat_id === 'string' ? body.chat_id : '';
      const message = typeof body.body === 'string' ? body.body.trim() : '';
      if (!uuid.test(chatId) || !message || message.length > 1000) return Response.json({ error: 'Invalid message.' }, { status: 400 });
      const id = await supabase('/rest/v1/rpc/student_chat_send', token, {
        method: 'POST',
        body: JSON.stringify({ target_chat_id: chatId, message_body: message }),
      });
      return Response.json({ ok: true, id: typeof id === 'string' ? id : undefined });
    }

    if (action === 'direct') {
      const contactId = typeof body.user_id === 'string' ? body.user_id : '';
      if (!uuid.test(contactId)) return Response.json({ error: 'Invalid contact.' }, { status: 400 });
      const chatId = await supabase('/rest/v1/rpc/student_chat_get_or_create_direct', token, {
        method: 'POST',
        body: JSON.stringify({ other_user_id: contactId }),
      });
      return Response.json({ ok: true, chat_id: chatId });
    }

    if (action === 'read') {
      const chatId = typeof body.chat_id === 'string' ? body.chat_id : '';
      if (!uuid.test(chatId)) return Response.json({ error: 'Invalid chat.' }, { status: 400 });
      await supabase('/rest/v1/rpc/student_chat_mark_read', token, {
        method: 'POST',
        body: JSON.stringify({ target_chat_id: chatId }),
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to complete the request.' }, { status: 400 });
  }
}
