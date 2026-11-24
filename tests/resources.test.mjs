import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const input = fs.readFileSync(new URL('../app/api/resources/[kind]/[id]/route.ts', import.meta.url), 'utf8')
  .replace("import { session, supabase, supabaseKey, supabaseUrl } from '../../../../../lib/server-session';", 'const {session,supabase,supabaseKey,supabaseUrl}=globalThis.__resourceDeps;');
const code = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let user = null, fileUrl = '', calls = [];
globalThis.__resourceDeps = {
  session: async () => user ? { user, token:'verified' } : { user:null, token:undefined },
  supabaseUrl: () => 'https://supabase.test', supabaseKey: () => 'key',
  supabase: async (path, token, init) => {
    calls.push({path,token,init});
    if(path.startsWith('/rest/v1/past_questions?')) return [{file_url:fileUrl}];
    if(path.startsWith('/storage/v1/object/sign/')) return {signedURL:'/object/sign/past-questions/user/paper.pdf?token=short'};
    return null;
  },
};
const { GET } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const id='11111111-1111-4111-8111-111111111111';
const params=kind=>({params:Promise.resolve({kind,id})});
test('resource downloads require a verified account',async()=>{
  user=null; calls=[];
  assert.equal((await GET(new Request('https://site.test'),params('past'))).status,401);
  assert.equal(calls.length,0);
});
test('downloads only sign known storage paths and record successful starts',async()=>{
  user={id}; calls=[]; fileUrl='https://evil.test/storage/v1/object/public/past-questions/user/paper.pdf';
  assert.equal((await GET(new Request('https://site.test'),params('past'))).status,400);
  assert.equal(calls.some(call=>call.path.includes('record_resource_download')),false);
  calls=[]; fileUrl='https://supabase.test/storage/v1/object/public/past-questions/user/paper.pdf';
  const result=await GET(new Request('https://site.test'),params('past'));
  assert.equal(result.status,302);
  assert.match(result.headers.get('location'),/^https:\/\/supabase\.test\/storage\/v1\/object\/sign\//);
  assert.equal(result.headers.get('cache-control'),'private, no-store');
  assert.equal(calls.some(call=>call.path.includes('record_resource_download')),true);
});
