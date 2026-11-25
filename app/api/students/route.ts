import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../lib/server-session';

export async function GET(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Student Block is not configured.' }, { status: 503 });
  try {
    const { user, token } = await session();
    const chatOnly = new URL(request.url).searchParams.get('chat') === '1';
    const resourcesOnly = new URL(request.url).searchParams.get('resources') === '1';
    if (!user || !token) {
      if (chatOnly) return Response.json({ error: 'Sign in to join Student Block.' }, { status: 401 });
      return Response.json({ user: null, messages: [] });
    }
    if (new URL(request.url).searchParams.get('members') === '1') {
      const members = await supabase('/rest/v1/rpc/student_group_info', token, { method: 'POST', body: '{}' });
      return Response.json({ members }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (resourcesOnly) {
      const [past_questions, handouts] = await Promise.all([
        supabase('/rest/v1/past_questions?select=id,title,course,level,year,created_at&order=year.desc,created_at.desc', token),
        supabase('/rest/v1/handouts?select=id,title,course,description,created_at&order=created_at.desc', token),
      ]);
      return Response.json({ user: { id: user.id }, past_questions, handouts }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const [messages, , profiles] = await Promise.all([
      supabase('/rest/v1/rpc/student_room_messages', token, { method: 'POST', body: '{}' }),
      chatOnly ? Promise.resolve(null) : supabase('/rest/v1/rpc/student_group_info', token, { method: 'POST', body: '{}' }),
      chatOnly ? Promise.resolve(null) : supabase(`/rest/v1/profiles?id=eq.${user.id}&select=id,name,username,avatar_url`, token),
    ]);
    if (chatOnly) return Response.json({ messages });
    if (!profiles[0]) return Response.json({ error: 'Your student profile is unavailable. Please contact support.' }, { status: 403 });
    return Response.json({ user: profiles[0], messages });
  } catch {
    return Response.json({ error: 'Student Block could not load. Please try again.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!supabaseUrl() || !supabaseKey()) return Response.json({ error: 'Student Block is not configured.' }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  try {
    const { user, token } = await session();
    if (!user || !token) return Response.json({ error: 'Sign in to join Student Block.' }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid request.' }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (input.action === 'delete_message') {
      const id = typeof input.id === 'string' ? input.id : '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: 'Invalid message.' }, { status: 400 });
      const rows = await supabase(`/rest/v1/student_messages?id=eq.${id}&user_id=eq.${user.id}&select=id,body`, token);
      if (!rows.length) return Response.json({ error: 'Message not found.' }, { status: 404 });
      await supabase(`/rest/v1/student_messages?id=eq.${id}&user_id=eq.${user.id}`, token, { method: 'DELETE' });
      const match = typeof rows[0].body === 'string' ? /^\[(voice|image)\]([0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:webm|ogg|mp4|jpg|png|webp))$/i.exec(rows[0].body) : null;
      if (match && match[2].startsWith(`${user.id}/`)) await supabase(`/storage/v1/object/${match[1] === 'voice' ? 'student-voice' : 'student-chat-images'}/${match[2]}`, token, { method: 'DELETE' }).catch(() => {});
      return Response.json({ ok: true });
    }
    if (input.action === 'profile') {
      const username = String(input.username || '').trim().replace(/\s+/g, ' ');
      const avatar = String(input.avatar_url || '');
      if (username && (username.length < 3 || username.length > 30 || !/^[\p{L}\p{N} _.-]+$/u.test(username))) return Response.json({ error: 'Choose a username of 3 to 30 letters, numbers, spaces, dots, dashes or underscores.' }, { status: 400 });
      if (avatar && !avatar.startsWith(`${supabaseUrl()}/storage/v1/object/public/student-avatars/${user.id}/`)) return Response.json({ error: 'Please upload your own profile picture.' }, { status: 400 });
      await supabase(`/rest/v1/profiles?id=eq.${user.id}`, token, { method: 'PATCH', body: JSON.stringify({ username, avatar_url: avatar }) });
      return Response.json({ ok: true });
    }
    if (input.action === 'message') {
      const message = typeof input.body === 'string' ? input.body.trim() : '';
      if (!message || message.length > 1000) return Response.json({ error: 'Messages must be between 1 and 1,000 characters.' }, { status: 400 });
      await supabase('/rest/v1/student_messages', token, { method: 'POST', body: JSON.stringify({ user_id: user.id, body: message }) });
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to complete the request.' }, { status: 400 });
  }
}
