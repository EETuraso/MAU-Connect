import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/api/students/avatar/route.ts', import.meta.url), 'utf8').replace("import { sameOrigin, session } from '../../../../lib/server-session';", 'const { sameOrigin, session } = globalThis.__avatarDeps;');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let user = null;
globalThis.__avatarDeps = { sameOrigin: req => req.headers.get('origin') === 'https://site.test', session: async () => user ? { user, token: 'verified' } : { user: null } };
const { POST } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
process.env.SUPABASE_URL = 'https://example.test'; process.env.SUPABASE_ANON_KEY = 'key';
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 200 }); };
function request(type = 'image/png') { const form = new FormData(); form.append('file', new File(['image'], 'avatar', { type })); return new Request('https://site.test/api/students/avatar', { method: 'POST', headers: { origin: 'https://site.test' }, body: form }); }
test('picture upload requires sign-in and validates image type', async () => {
  user = null; calls.length = 0;
  assert.equal((await POST(request())).status, 401);
  user = { id: 'student-1' };
  assert.equal((await POST(request('text/plain'))).status, 400);
  assert.equal(calls.length, 0);
});
test('upload saves the verified student profile picture', async () => {
  user = { id: 'student-1' }; calls.length = 0;
  const response = await POST(request());
  assert.equal(response.status, 200);
  const { url } = await response.json();
  assert.match(url, /^https:\/\/example\.test\/storage\/v1\/object\/public\/student-avatars\/student-1\//);
  assert.equal(calls[1].init.method, 'PATCH');
  assert.equal(JSON.parse(calls[1].init.body).avatar_url, url);
  assert.match(calls[1].url, /profiles\?id=eq\.student-1$/);
});
