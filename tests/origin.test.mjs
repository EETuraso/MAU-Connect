import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/server-session.ts',import.meta.url),'utf8').replace("import { cookies } from 'next/headers';",'const cookies=async()=>({});');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {sameOrigin}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('same-origin validation uses the public host and rejects a different origin',()=>{
  const request=(origin)=>new Request('http://localhost:3000/api/messages',{method:'POST',headers:{origin,host:'127.0.0.1:3000'}});
  assert.equal(sameOrigin(request('http://127.0.0.1:3000')),true);
  assert.equal(sameOrigin(request('http://evil.test')),false);
  assert.equal(sameOrigin(new Request('https://internal/api/messages',{method:'POST',headers:{origin:'https://site.test',host:'site.test','x-forwarded-proto':'https'}})),true);
});
