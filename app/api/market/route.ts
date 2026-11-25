import { cookies } from 'next/headers';
import { defaults } from '../../data';
import { sameOrigin } from '../../../lib/server-session';
type AuthSession={access_token:string;refresh_token:string;expires_in?:number};
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
const adminActions=['remove','settings','suspend','impersonate','reports','resolve'];
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function adminPayload(body:Record<string,unknown>){
  const action=body.action;
  if(action==='reports')return {action};
  if(action==='settings'){
    const settings=body.settings;
    if(!isRecord(settings))throw new Error('Provide website settings');
    const text=(name:string,max:number,required=false)=>{
      const value=settings[name];
      if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new Error(`Invalid ${name.replaceAll('_',' ')}`);
      return value.trim();
    };
    if(settings.payment_mode!=='seller'&&settings.payment_mode!=='platform')throw new Error('Invalid payment mode');
    if(!Array.isArray(settings.categories)||settings.categories.length<1||settings.categories.length>40||settings.categories.some((value:unknown)=>typeof value!=='string'||!value.trim()||value.length>80))throw new Error('Provide 1–40 categories of up to 80 characters');
    const categories=settings.categories.map((value:string)=>value.trim());
    if(new Set(categories.map((value:string)=>value.toLowerCase())).size!==categories.length)throw new Error('Categories must be unique');
    return {action,settings:{site_name:text('site_name',80,true),hero_title:text('hero_title',200,true),hero_subtitle:text('hero_subtitle',500),payment_mode:settings.payment_mode,payment_instructions:text('payment_instructions',2000),categories}};
  }
  if(typeof body.id!=='string'||!uuidPattern.test(body.id))throw new Error('Provide a valid record ID');
  if(action==='suspend'){
    if(typeof body.suspended!=='boolean')throw new Error('Suspension must be true or false');
    return {action,id:body.id,suspended:body.suspended};
  }
  if(action==='impersonate'){
    if(typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>1000)throw new Error('Provide a support reason of 5–1000 characters');
    return {action,id:body.id,reason:body.reason.trim()};
  }
  return {action,id:body.id};
}
const url=()=>process.env.SUPABASE_URL;
const key=()=>process.env.SUPABASE_ANON_KEY;
async function sb(path:string,token?:string,init:RequestInit={}){const r=await fetch(`${url()}${path}`,{...init,headers:{apikey:key()!,Authorization:`Bearer ${token||key()}`,'Content-Type':'application/json',...init.headers},cache:'no-store'});const text=await r.text();const data=text?JSON.parse(text):null;if(!r.ok)throw new Error(data?.message||data?.msg||data?.error_description||'Request failed');return data;}
async function identity(){
  const jar=await cookies();
  const token=jar.get('mau_access')?.value;
  if(token){
    try{return {user:await sb('/auth/v1/user',token),token};}catch{/* Try the refresh cookie below. */}
  }
  // Browsers remove the access cookie when it expires. The longer-lived
  // refresh cookie must work even when there is no access cookie at all.
  const refresh=jar.get('mau_refresh')?.value;
  if(refresh){
    try{
      const s=await sb('/auth/v1/token?grant_type=refresh_token',undefined,{method:'POST',body:JSON.stringify({refresh_token:refresh})});
      if(!s?.access_token||!s?.refresh_token||!s?.user?.id)throw new Error('Invalid session');
      await setSession(s);
      return {user:s.user,token:s.access_token};
    }catch{/* Invalid sessions are treated as signed out. */}
  }
  // Never pass a rejected access token to otherwise public database reads.
  return {user:null,token:undefined};
}
async function setSession(s:AuthSession){const jar=await cookies();const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};jar.set('mau_access',s.access_token,{...options,maxAge:s.expires_in||3600});jar.set('mau_refresh',s.refresh_token,{...options,maxAge:60*60*24*30});}
export async function GET(){
  const headers={'Cache-Control':'private, no-store'};
  if(!url()&&!key())return Response.json({demo:true,settings:defaults,listings:[],past_questions:[],handouts:[],user:null,users:[],audit:[],reports:[]},{headers});
  if(!url()||!key())return Response.json({error:'Supabase configuration is incomplete.'},{status:503,headers});
  try{
    const {user,token}=await identity();
    const [listings,settings,past_questions,handouts]=await Promise.all([sb('/rest/v1/listings?select=*&order=created_at.desc',token),sb('/rest/v1/settings?id=eq.1&select=data',token),sb('/rest/v1/past_questions?select=id,title,course,level,year,file_url,created_at&order=year.desc,created_at.desc',token).catch(()=>[]),sb('/rest/v1/handouts?select=id,title,course,description,file_url,created_at&order=created_at.desc',token).catch(()=>[])]);
    let profile=null,users=[],audit=[],reports=[],registeredCount:number|null=null;
    if(user){
      profile=(await sb(`/rest/v1/profiles?id=eq.${user.id}&select=*`,token))[0]||null;
      if(profile?.role==='admin'&&!profile.suspended){
        [users,audit,reports]=await Promise.all([
          sb('/rest/v1/profiles?select=*&order=created_at.desc',token),
          sb('/rest/v1/audit_log?select=*&order=created_at.desc&limit=100',token),
          sb('/rest/v1/reports?select=*&order=created_at.desc',token),
        ]);
        try {
          const countResponse=await fetch(`${url()}/rest/v1/profiles?id=not.is.null&select=id`,{method:'HEAD',headers:{apikey:key()!,Authorization:`Bearer ${token}`,Prefer:'count=exact'},cache:'no-store'});
          const count=countResponse.headers.get('content-range')?.split('/')[1];
          if(countResponse.ok&&count&&/^\d+$/.test(count))registeredCount=Number(count);
        } catch {/* Counts can be temporarily unavailable. */}
      }
    }
    return Response.json({demo:false,listings,settings:settings[0]?.data||defaults,past_questions,handouts,user:profile,users,audit,reports,registered_count:registeredCount},{headers});
  }catch(e){return Response.json({error:(e as Error).message},{status:400,headers});}
}
export async function POST(req:Request){if(!url()||!key())return Response.json({error:'Connect Supabase to enable live accounts.'},{status:503});if(!sameOrigin(req))return Response.json({error:'Invalid origin'},{status:403});try{const content=req.headers.get('content-type')||'';if(content.includes('multipart/form-data')){const {user,token}=await identity();if(!user)throw new Error('Sign in required');const form=await req.formData();const file=form.get('file');if(form.get('kind')==='past-question'){const profile=(await sb(`/rest/v1/profiles?id=eq.${user.id}&select=*`,token))[0];if(!profile||profile.suspended||profile.role!=='admin')throw new Error('Admin access required');if(!(file instanceof File)||file.type!=='application/pdf'||file.size===0||file.size>10*1024*1024)throw new Error('Use a PDF under 10MB');const path=`${user.id}/${crypto.randomUUID()}.pdf`;await sb(`/storage/v1/object/past-questions/${path}`,token,{method:'POST',headers:{'Content-Type':file.type},body:file});return Response.json({url:`${url()}/storage/v1/object/public/past-questions/${path}`});}if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>4*1024*1024)throw new Error('Use a JPG, PNG or WebP image under 4MB');const path=`${user.id}/${crypto.randomUUID()}.${file.type.split('/')[1]}`;await sb(`/storage/v1/object/listings/${path}`,token,{method:'POST',headers:{'Content-Type':file.type},body:file});return Response.json({url:`${url()}/storage/v1/object/public/listings/${path}`});}
const b:unknown=await req.json();if(!isRecord(b)||typeof b.action!=='string')throw new Error('Invalid request');if(['signin','signup'].includes(b.action)){if(typeof b.email!=='string'||typeof b.password!=='string'||b.password.length<8)throw new Error('Enter an email and a password of at least 8 characters');const s=await sb(b.action==='signin'?'/auth/v1/token?grant_type=password':'/auth/v1/signup',undefined,{method:'POST',body:JSON.stringify({email:b.email,password:b.password,data:{name:String(b.name||'Seller').slice(0,80)}})});if(s.access_token)await setSession(s);return Response.json({message:s.access_token?'Signed in':'Check your email to confirm your account.'});}
if(b.action==='signout'){const j=await cookies();j.delete('mau_access');j.delete('mau_refresh');return Response.json({ok:true});}
const {user,token}=await identity();if(!user) return Response.json({error:'Sign in required'},{status:401});const profile=(await sb(`/rest/v1/profiles?id=eq.${user.id}&select=*`,token))[0];if(!profile||profile.suspended)return Response.json({error:profile?'Your account is suspended':'Account profile required'},{status:403});
if(b.action==='listing'){const p=b.listing;if(!isRecord(p)||typeof p.title!=='string'||p.title.trim().length<3||p.title.length>120||!Number.isFinite(Number(p.price))||Number(p.price)<=0)throw new Error('Provide a valid title and price');if(!Array.isArray(p.images)||!p.images.length||p.images.length>5||p.images.some((x:unknown)=>typeof x!=='string'||!x.startsWith(`${url()}/storage/v1/object/public/listings/${user.id}/`)))throw new Error('Upload 1–5 product images');const data={title:p.title.trim(),description:String(p.description).slice(0,3000),price:Number(p.price),negotiable:!!p.negotiable,category:String(p.category).slice(0,80),location:String(p.location).slice(0,120),condition:p.condition==='New'?'New':'Used',images:p.images};await sb(p.id?`/rest/v1/listings?id=eq.${encodeURIComponent(String(p.id))}&seller_id=eq.${user.id}`:'/rest/v1/listings',token,{method:p.id?'PATCH':'POST',body:JSON.stringify(p.id?data:{...data,status:'active',seller_id:user.id})});}
else if(b.action==='sold')await sb(`/rest/v1/listings?id=eq.${encodeURIComponent(String(b.id))}&seller_id=eq.${user.id}`,token,{method:'PATCH',body:JSON.stringify({status:'sold'})});
else if(b.action==='available')await sb(`/rest/v1/listings?id=eq.${encodeURIComponent(String(b.id))}&seller_id=eq.${user.id}&status=eq.sold`,token,{method:'PATCH',body:JSON.stringify({status:'active'})});
else if(b.action==='profile')await sb(`/rest/v1/profiles?id=eq.${user.id}`,token,{method:'PATCH',body:JSON.stringify({name:String(b.name).slice(0,80),phone:String(b.phone).slice(0,25),payment_method:String(b.payment_method).slice(0,100),payment_instructions:String(b.payment_instructions).slice(0,500)})});
else if(b.action==='contact'){const result=await sb('/rest/v1/rpc/seller_contact',token,{method:'POST',body:JSON.stringify({seller:b.seller})});return Response.json(result);}
else if(b.action==='report')await sb('/rest/v1/reports',token,{method:'POST',body:JSON.stringify({listing_id:b.id,reporter_id:user.id,reason:String(b.reason).slice(0,1000)})});
else if(b.action==='past-question'){if(profile.role!=='admin')return Response.json({error:'Admin access required'},{status:403});if(typeof b.title!=='string'||b.title.trim().length<3||b.title.length>160||typeof b.course!=='string'||b.course.trim().length<2||b.course.length>120||typeof b.level!=='string'||!b.level.trim()||b.level.length>40||!Number.isInteger(Number(b.year))||Number(b.year)<2000||Number(b.year)>2100||typeof b.file_url!=='string'||!b.file_url.startsWith(`${url()}/storage/v1/object/public/past-questions/${user.id}/`))throw new Error('Provide valid past question details and upload a PDF');await sb('/rest/v1/past_questions',token,{method:'POST',body:JSON.stringify({title:b.title.trim(),course:b.course.trim(),level:b.level.trim(),year:Number(b.year),file_url:b.file_url,created_by:user.id})});}
else if(adminActions.includes(b.action)){if(profile.role!=='admin')return Response.json({error:'Admin access required'},{status:403});const payload=adminPayload(b);if(b.action==='suspend'&&b.id===user.id)return Response.json({error:'Cannot suspend yourself'},{status:400});const result=await sb('/rest/v1/rpc/admin_action',token,{method:'POST',body:JSON.stringify({action:b.action,payload})});return Response.json(result||{ok:true});}
else throw new Error('Unknown action');return Response.json({ok:true});}catch(e){return Response.json({error:(e as Error).message},{status:400});}}
