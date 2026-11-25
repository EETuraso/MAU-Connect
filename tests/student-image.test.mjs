import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = fs.readFileSync(new URL('../app/api/students/image/route.ts', import.meta.url), 'utf8').replace("import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../../lib/server-session';", 'const {sameOrigin, session, supabase, supabaseKey, supabaseUrl} = globalThis.__imageDeps;');
const id = '11111111-1111-4111-8111-111111111111';
let user = null, origin = true, calls = [], messages = [];
globalThis.__imageDeps = {
  sameOrigin: () => origin, session: async () => ({ user, token: user ? 'token' : null }), supabaseKey: () => 'key', supabaseUrl: () => 'https://example.test',
  supabase: async (path, token, init) => { calls.push({path, init}); if (path.includes('student_room_messages')) return messages; if (path.includes('/sign/')) return {signedURL:'/object/sign/test?token=x'}; return {}; },
};
const { POST, GET } = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`);
function upload(type = 'image/jpeg') { const form = new FormData(); form.append('file', new Blob(['image'], {type}), 'photo'); return new Request('https://example.test/api/students/image', {method:'POST', body:form}); }
test('image uploads require a session and valid image type', async () => {
  calls=[]; user=null; assert.equal((await POST(upload())).status,401);
  user={id}; origin=false; assert.equal((await POST(upload())).status,403); origin=true;
  assert.equal((await POST(upload('text/plain'))).status,400); assert.equal(calls.length,0);
  assert.equal((await POST(upload())).status,200); assert.match(calls[0].path,new RegExp(`student-chat-images/${id}/`));
});
test('photo playback cannot sign a path belonging to a different sender', async () => {
  calls=[]; messages=[{id,user_id:'33333333-3333-4333-8333-333333333333',body:`[image]${id}/22222222-2222-4222-8222-222222222222.jpg`}];
  assert.equal((await GET(new Request(`https://example.test/api/students/image?id=${id}`))).status,404);
  assert.equal(calls.some(call=>call.path.includes('/sign/')),false);
});
