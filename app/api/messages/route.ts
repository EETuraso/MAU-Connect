import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../lib/server-session';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Messaging is not configured.' }, { status: 503 });
  try {
    const { token, user } = await session();
    if (!token || !user) return Response.json({ error: 'Sign in to view messages.' }, { status: 401 });
    const conversation = new URL(request.url).searchParams.get('conversation');
    if (conversation) {
      if (!uuid.test(conversation)) return Response.json({ error: 'Invalid conversation.' }, { status: 400 });
      const messages = await supabase(`/rest/v1/market_messages?conversation_id=eq.${conversation}&select=id,sender_id,body,created_at&order=created_at.asc&limit=500`, token);
      return Response.json({ messages, userId: user.id }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const conversations = await supabase('/rest/v1/market_conversations?select=id,listing_id,buyer_id,seller_id,created_at,listing:listings(title)&order=created_at.desc&limit=100', token);
    return Response.json({ conversations, userId: user.id }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to load messages.' }, { status: 400 }); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Messaging is not configured.' }, { status: 503 });
  try {
    const { token, user } = await session();
    if (!token || !user) return Response.json({ error: 'Sign in to send messages.' }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') throw new Error('Invalid request.');
    const input = body as Record<string, unknown>;
    if (input.action === 'start' && typeof input.listingId === 'string' && uuid.test(input.listingId)) {
      const id = await supabase('/rest/v1/rpc/start_market_conversation', token, { method: 'POST', body: JSON.stringify({ item_id: input.listingId }) });
      return Response.json({ id });
    }
    if (input.action === 'send' && typeof input.conversationId === 'string' && uuid.test(input.conversationId) && typeof input.message === 'string' && input.message.trim().length >= 1 && input.message.trim().length <= 1000) {
      await supabase('/rest/v1/market_messages', token, { method: 'POST', body: JSON.stringify({ conversation_id: input.conversationId, sender_id: user.id, body: input.message.trim() }) });
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Invalid message.' }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to send message.' }, { status: 400 }); }
}
