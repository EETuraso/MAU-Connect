import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/api/messages/route.ts', import.meta.url), 'utf8')
  .replace("import { sameOrigin, session, supabase, supabaseKey, supabaseUrl } from '../../../lib/server-session';", 'const {sameOrigin,session,supabase,supabaseKey,supabaseUrl}=globalThis.__messageDeps;');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let user = null; const calls = [];
globalThis.__messageDeps = {
  sameOrigin: request => request.headers.get('origin') === new URL(request.url).origin,
  session: async () => user ? { user, token: 'verified-token' } : { user: null, token: undefined },
  supabase: async (...args) => { calls.push(args); return args[0].includes('/rpc/') ? '22222222-2222-4222-8222-222222222222' : []; },
  supabaseKey: () => 'key', supabaseUrl: () => 'https://example.test',
};
const { GET, POST } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const request = (body, origin = 'https://market.test') => new Request('https://market.test/api/messages', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('messaging rejects anonymous and cross-origin requests', async () => {
  user = null; calls.length = 0;
  assert.equal((await GET(new Request('https://market.test/api/messages'))).status, 401);
  assert.equal((await POST(request({ action: 'start' }))).status, 401);
  assert.equal((await POST(request({}, 'https://other.test'))).status, 403);
  assert.equal(calls.length, 0);
});
test('message sender comes from the verified session and invalid inputs are rejected', async () => {
  user = { id: '11111111-1111-4111-8111-111111111111' }; calls.length = 0;
  assert.equal((await POST(request({ action: 'send', conversationId: 'invalid', message: 'hello' }))).status, 400);
  assert.equal(calls.length, 0);
  const result = await POST(request({ action: 'send', conversationId: '22222222-2222-4222-8222-222222222222', sender_id: 'other', message: ' hello ' }));
  assert.equal(result.status, 200);
  const payload = JSON.parse(calls[0][2].body);
  assert.equal(payload.sender_id, user.id);
  assert.equal(payload.body, 'hello');
  assert.equal(calls[0][1], 'verified-token');
});
