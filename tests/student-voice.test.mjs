import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = fs.readFileSync(new URL('../app/api/students/voice/route.ts', import.meta.url), 'utf8').replace("import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../../lib/server-session';", 'const {sameOrigin, session, supabase, supabaseKey, supabaseUrl} = globalThis.__voiceDeps;');
let user = null, origin = true, calls = [], messages = [], failInsert = false;
globalThis.__voiceDeps = {
  sameOrigin: () => origin, session: async () => ({ user, token: user ? 'token' : null }),
  supabaseKey: () => 'key', supabaseUrl: () => 'https://example.test',
  supabase: async (path, token, init) => {
    calls.push({ path, init });
    if (path.includes('student_room_messages')) return messages;
    if (path.includes('/sign/')) return { signedURL: '/object/sign/student-voice/test?token=x' };
    if (failInsert && path === '/rest/v1/student_messages') throw new Error('insert failed');
    return {};
  },
};
const { POST, GET } = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`);
const id = '11111111-1111-4111-8111-111111111111';
function upload(type = 'audio/webm') { const form = new FormData(); form.append('file', new Blob(['audio'], {type}), 'note'); return new Request('https://example.test/api/students/voice', {method:'POST', body:form}); }
test('voice uploads require same origin and a signed-in user', async () => {
  user = null; origin = true; calls = []; assert.equal((await POST(upload())).status, 401);
  user = {id}; origin = false; assert.equal((await POST(upload())).status, 403); assert.equal(calls.length, 0);
});
test('voice upload validates format and stores under the verified user', async () => {
  user = {id}; origin = true; calls = []; assert.equal((await POST(upload('text/plain'))).status, 400);
  assert.equal((await POST(upload())).status, 200);
  assert.match(calls[0].path, new RegExp(`student-voice/${id}/`));
  assert.match(JSON.parse(calls[1].init.body).body, /^\[voice\]/);
});
test('failed message creation removes the uploaded recording', async () => {
  calls = []; failInsert = true; assert.equal((await POST(upload())).status, 400); failInsert = false;
  assert.equal(calls.at(-1).init.method, 'DELETE');
});
test('playback only signs paths attached to a matching sender message', async () => {
  calls = []; messages = [{id, user_id:id, body:`[voice]${id}/22222222-2222-4222-8222-222222222222.webm`}];
  assert.equal((await GET(new Request(`https://example.test/api/students/voice?id=${id}`))).status, 302);
  messages[0].user_id = '33333333-3333-4333-8333-333333333333'; calls = [];
  assert.equal((await GET(new Request(`https://example.test/api/students/voice?id=${id}`))).status, 404);
  assert.equal(calls.some(call => call.path.includes('/sign/')), false);
});
