import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const sessionSource=fs.readFileSync(new URL('../lib/server-session.ts',import.meta.url),'utf8');
const originSource=sessionSource.slice(sessionSource.indexOf('export function sameOrigin'));
const source=fs.readFileSync(new URL('../app/api/market/route.ts',import.meta.url),'utf8').replace("import { cookies } from 'next/headers';",'const cookies=async()=>globalThis.__jar;').replace("import { defaults } from '../../data';",'const defaults={};').replace("import { sameOrigin } from '../../../lib/server-session';",originSource);
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {POST,GET}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const originalFetch=globalThis.fetch;
const calls=[];
let role='seller';
let suspended=false;
let userId='seller-1';
globalThis.__jar={get:key=>key==='mau_access'?{value:'test-token'}:undefined,set(){},delete(){}};
function configure(){process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_ANON_KEY='test-key';calls.length=0;role='seller';suspended=false;userId='seller-1';globalThis.__jar={get:key=>key==='mau_access'?{value:'test-token'}:undefined,set(){},delete(){}};globalThis.fetch=async(url,init)=>{calls.push({url,init});if(url.endsWith('/auth/v1/user'))return Response.json({id:userId});if(url.includes('/profiles?'))return Response.json([{id:userId,role,suspended}]);if(!init.method||init.method==='GET')return Response.json([]);return new Response(null,{status:204});};}
const request=(body,origin='https://market.test')=>new Request('https://market.test/api/market',{method:'POST',headers:{origin,host:'market.test','content-type':'application/json'},body:JSON.stringify(body)});
test('unconfigured preview cannot accept live account mutations',async()=>{delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;assert.equal((await POST(request({action:'signup'}))).status,503);assert.equal((await (await GET()).json()).demo,true)});
test('cross-origin mutations fail before authentication',async()=>{configure();assert.equal((await POST(request({action:'settings'},'https://evil.test'))).status,403);assert.equal(calls.length,0)});
test('seller cannot call any admin operation',async()=>{configure();for(const action of ['remove','settings','suspend','impersonate','reports','resolve'])assert.equal((await POST(request({action}))).status,403);assert.equal(calls.some(x=>x.url.includes('admin_action')),false)});
test('listing creation derives owner from verified identity',async()=>{configure();const listing={seller_id:'victim',title:'Test item',price:200,images:['https://test.supabase.co/storage/v1/object/public/listings/seller-1/item.png'],description:'Test',category:'Electronics',location:'Lagos',condition:'New'};assert.equal((await POST(request({action:'listing',listing}))).status,200);const mutation=calls.find(x=>x.url.endsWith('/rest/v1/listings'));assert.equal(JSON.parse(mutation.init.body).seller_id,'seller-1')});
test('foreign-owner images cannot be attached',async()=>{configure();assert.equal((await POST(request({action:'listing',listing:{title:'Test item',price:200,images:['https://test.supabase.co/storage/v1/object/public/listings/victim/item.png']}}))).status,400);assert.equal(calls.some(x=>x.url.endsWith('/rest/v1/listings')),false)});
test('profile edit cannot promote role or change suspension',async()=>{configure();assert.equal((await POST(request({action:'profile',role:'admin',suspended:false,name:'Test',phone:'',payment_method:'Cash',payment_instructions:''}))).status,200);const mutation=calls.find(x=>x.init.method==='PATCH');assert.equal('role' in JSON.parse(mutation.init.body),false);assert.equal('suspended' in JSON.parse(mutation.init.body),false)});
test('admin support goes through audited RPC, not a seller session',async()=>{configure();role='admin';assert.equal((await POST(request({action:'impersonate',id:'22222222-2222-4222-8222-222222222222',reason:'Investigating issue'}))).status,200);assert.equal(calls.some(x=>x.url.endsWith('/rest/v1/rpc/admin_action')),true);assert.equal(calls.some(x=>x.url.includes('/auth/v1/token')),false)});

test('expired access cookie can be renewed using only the refresh cookie',async()=>{
  configure();
  const writes=[];
  globalThis.__jar={get:key=>key==='mau_refresh'?{value:'refresh-token'}:undefined,set:(...args)=>writes.push(args),delete(){}};
  const mockFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    if(url.endsWith('/auth/v1/token?grant_type=refresh_token')){
      assert.equal(JSON.parse(init.body).refresh_token,'refresh-token');
      return Response.json({access_token:'renewed-token',refresh_token:'rotated-refresh',expires_in:3600,user:{id:'seller-1'}});
    }
    return mockFetch(url,init);
  };
  const response=await POST(request({action:'profile',name:'Test',phone:'',payment_method:'Cash',payment_instructions:''}));
  assert.equal(response.status,200);
  assert.deepEqual(writes.map(([name,value])=>[name,value]),[['mau_access','renewed-token'],['mau_refresh','rotated-refresh']]);
  assert.equal(writes.every(([, ,options])=>options.httpOnly&&options.sameSite==='lax'),true);
  assert.equal(calls.find(x=>x.init.method==='PATCH').init.headers.Authorization,'Bearer renewed-token');
});

test('invalid access tokens are not reused for public marketplace reads',async()=>{
  configure();
  globalThis.__jar={get:key=>key==='mau_access'?{value:'expired-token'}:undefined,set(){},delete(){}};
  globalThis.fetch=async(url,init)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({message:'Expired token'},{status:401});
    assert.equal(init.headers.Authorization,'Bearer test-key');
    return Response.json([]);
  };
  const response=await GET();
  assert.equal(response.status,200);
  assert.equal((await response.json()).user,null);
});

test('partial Supabase configuration fails instead of silently showing demo data',async()=>{
  configure();
  delete process.env.SUPABASE_ANON_KEY;
  const response=await GET();
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/configuration is incomplete/i);
  assert.equal(calls.length,0);
});

test('admin overview loads reports, sellers and audit using the verified session',async()=>{
  configure();
  role='admin';
  const mockFetch=globalThis.fetch;
  const report={id:'report-1',listing_id:'listing-1',reason:'Misleading listing',status:'open'};
  globalThis.fetch=async(url,init)=>{
    if(url.includes('/reports?')){
      calls.push({url,init});
      return Response.json([report]);
    }
    return mockFetch(url,init);
  };
  const response=await GET();
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(body.reports,[report]);
  assert.equal(body.users[0].role,'admin');
  const privateCalls=calls.filter(isAdminQuery);
  assert.equal(privateCalls.length,3);
  assert.equal(privateCalls.every(call=>call.init.headers.Authorization==='Bearer test-token'),true);
});

const isAdminQuery=call=>call.url.includes('/profiles?select=')||call.url.includes('/audit_log?')||call.url.includes('/reports?');

test('only an active admin receives the exact profile count',async()=>{
  configure(); role='admin';
  const mockFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    if(init.method==='HEAD'&&url.includes('/profiles?')){
      calls.push({url,init});
      return new Response(null,{status:200,headers:{'content-range':'0-0/1234'}});
    }
    return mockFetch(url,init);
  };
  const body=await (await GET()).json();
  assert.equal(body.registered_count,1234);
  assert.equal(calls.find(call=>call.init.method==='HEAD').init.headers.Authorization,'Bearer test-token');
  configure();
  const sellerBody=await (await GET()).json();
  assert.equal(sellerBody.registered_count,null);
  assert.equal(calls.some(call=>call.init.method==='HEAD'),false);
});

test('seller and suspended admin overviews never request privileged collections',async()=>{
  for(const account of [{role:'seller',suspended:false},{role:'admin',suspended:true}]){
    configure();
    role=account.role;
    suspended=account.suspended;
    const response=await GET();
    const body=await response.json();
    assert.equal(response.status,200);
    assert.deepEqual(body.users,[]);
    assert.deepEqual(body.audit,[]);
    assert.deepEqual(body.reports,[]);
    assert.equal(calls.some(isAdminQuery),false);
  }
});

test('anonymous users cannot read privileged collections or run admin actions',async()=>{
  configure();
  globalThis.__jar={get(){},set(){},delete(){}};
  const response=await GET();
  assert.equal(response.status,200);
  assert.equal((await response.json()).user,null);
  assert.equal(calls.some(isAdminQuery),false);
  assert.equal((await POST(request({action:'reports'}))).status,401);
  assert.equal(calls.some(call=>call.url.includes('/rpc/admin_action')),false);
});

test('suspended admins cannot perform any admin operation',async()=>{
  configure();
  role='admin';
  suspended=true;
  for(const action of ['remove','settings','suspend','impersonate','reports','resolve']){
    assert.equal((await POST(request({action}))).status,403);
  }
  assert.equal(calls.some(call=>call.url.includes('/rpc/admin_action')),false);
});

const recordId='11111111-1111-4111-8111-111111111111';
const validSettings={site_name:'MAU Connect',hero_title:'Great finds.',hero_subtitle:'Your marketplace.',payment_mode:'seller',payment_instructions:'',categories:['Electronics','Fashion']};

test('admin actions reject invalid IDs, suspension values and support reasons before calling RPC',async()=>{
  configure();
  role='admin';
  const invalidBodies=[
    {action:'remove'}, {action:'resolve',id:'not-a-uuid'},
    {action:'suspend',id:recordId,suspended:'false'},
    {action:'suspend',id:recordId},
    {action:'impersonate',id:recordId,reason:'    '},
    {action:'impersonate',id:recordId,reason:'a'.repeat(1001)},
  ];
  for(const body of invalidBodies)assert.equal((await POST(request(body))).status,400);
  assert.equal(calls.some(call=>call.url.includes('/rpc/admin_action')),false);
});

test('admins cannot suspend their own verified account',async()=>{
  configure();
  role='admin';
  userId=recordId;
  assert.equal((await POST(request({action:'suspend',id:recordId,suspended:true}))).status,400);
  assert.equal(calls.some(call=>call.url.includes('/rpc/admin_action')),false);
});

test('invalid website settings cannot overwrite the live marketplace',async()=>{
  configure();
  role='admin';
  const invalidSettings=[
    null, {}, {...validSettings,payment_mode:null}, {...validSettings,categories:[]},
    {...validSettings,categories:['Electronics',7]}, {...validSettings,categories:['   ']},
    {...validSettings,categories:['Electronics',' electronics ']},
    {...validSettings,categories:Array.from({length:41},(_,i)=>String(i))},
    {...validSettings,site_name:'  '}, {...validSettings,hero_title:7},
    {...validSettings,hero_subtitle:'x'.repeat(501)},
    {...validSettings,payment_instructions:'x'.repeat(2001)},
  ];
  for(const settings of invalidSettings)assert.equal((await POST(request({action:'settings',settings}))).status,400);
  assert.equal(calls.some(call=>call.url.includes('/rpc/admin_action')),false);
});

test('valid settings and moderation actions pass only allowed fields to audited RPC',async()=>{
  configure();
  role='admin';
  const settings={...validSettings,site_name:' MAU Connect ',categories:[' Electronics ','Fashion'],unexpected:'discard'};
  assert.equal((await POST(request({action:'settings',settings,actor_id:'forged'}))).status,200);
  let mutation=calls.find(call=>call.url.includes('/rpc/admin_action'));
  assert.deepEqual(JSON.parse(mutation.init.body),{action:'settings',payload:{action:'settings',settings:validSettings}});
  calls.length=0;
  assert.equal((await POST(request({action:'suspend',id:recordId,suspended:false,role:'admin'}))).status,200);
  mutation=calls.find(call=>call.url.includes('/rpc/admin_action'));
  assert.deepEqual(JSON.parse(mutation.init.body),{action:'suspend',payload:{action:'suspend',id:recordId,suspended:false}});
});

test('uploads over 4MB are rejected before a storage mutation',async()=>{
  configure();
  const form=new FormData();
  form.append('file',new File([new Uint8Array(4*1024*1024+1)],'large.png',{type:'image/png'}));
  const response=await POST(new Request('https://market.test/api/market',{method:'POST',headers:{origin:'https://market.test',host:'market.test'},body:form}));
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/4MB/);
  assert.equal(calls.some(call=>call.url.includes('/storage/v1/object/')),false);
});

test.after(()=>{globalThis.fetch=originalFetch;delete globalThis.__jar;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY});
