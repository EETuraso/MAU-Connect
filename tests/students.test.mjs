import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/api/students/route.ts', import.meta.url), 'utf8').replace("import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../lib/server-session';", 'const {sameOrigin,session,supabase,supabaseKey,supabaseUrl}=globalThis.__studentDeps;');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let user = null; const calls = [];
globalThis.__studentDeps = {
  sameOrigin: request => request.headers.get('origin') === new URL(request.url).origin,
  session: async () => user ? { user, token: 'verified' } : { user: null },
  supabase: async (...args) => { calls.push(args); return args[0].includes('/profiles?') ? [user] : []; },
  supabaseKey: () => 'key', supabaseUrl: () => 'https://example.test',
};
const { GET, POST } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const request = (body, origin = 'https://site.test') => new Request('https://site.test/api/students', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('student room requires authentication and rejects cross-origin messages', async () => {
  user = null; calls.length = 0;
  assert.equal((await GET(new Request('https://site.test/api/students?chat=1'))).status, 401);
  assert.equal((await POST(request({ action: 'message', body: 'hello' }))).status, 401);
  assert.equal((await POST(request({ action: 'message', body: 'hello' }, 'https://evil.test'))).status, 403);
  assert.equal(calls.length, 0);
});
test('student messages use the verified sender and reject empty messages', async () => {
  user = { id: 'student-1' }; calls.length = 0;
  assert.equal((await POST(request({ action: 'message', body: ' ' }))).status, 400);
  assert.equal((await POST(request({ action: 'message', user_id: 'other', body: ' hello ' }))).status, 200);
  assert.deepEqual(JSON.parse(calls[0][2].body), { user_id: 'student-1', body: 'hello' });
  assert.equal((await GET(new Request('https://site.test/api/students?chat=1'))).status, 200);
});
