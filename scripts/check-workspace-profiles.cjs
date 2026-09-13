// Browser integration test with isolated, mocked Supabase data. No real account writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const env=fs.readFileSync('.env.local','utf8');const origin=env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)[1];
 const me='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',workspace='33333333-3333-4333-8333-333333333333';
 const user={id:me,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:me,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'fixture'].join('.');
 const session={access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
 const b=await chromium.launch({channel:'chrome',headless:true});
 try{
 const ctx=await b.newContext({viewport:{width:1440,height:900}});
 await ctx.addCookies([{name:`sb-${new URL(origin).hostname.split('.')[0]}-auth-token`,value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'localhost',path:'/'}]);

 const second='66666666-6666-4666-8666-666666666666';const records={[workspace]:{id:me,full_name:'Harsh A',job_title:'Designer',avatar_url:null},[second]:{id:me,full_name:'Harsh B',job_title:'Engineer',avatar_url:null}};
 const reads=[];const writes=[];
 await ctx.route(origin+'/**',async route=>{
  const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/').pop(),scope=url.searchParams.get('workspace_id')?.replace('eq.','');let data=[];
  if(url.pathname.includes('/auth/'))data=user;
  else if(table==='workspace_members')data={workspace_id:scope};
  else if(table==='workspaces')data={name:url.searchParams.get('id')?.includes(second)?'Workspace B':'Workspace A'};
  else if(table==='workspace_profiles'){
   assert.ok(records[scope],'Profile query must specify a workspace');reads.push(scope);
   if(request.method()==='PATCH'){writes.push(scope);Object.assign(records[scope],request.postDataJSON())}
   data=url.searchParams.get('id')?.startsWith('in.')?[records[scope]]:records[scope];
  }else if(table==='posts'){
   assert.ok(records[scope],'Post query must specify a workspace');
   data=[];
  }else if(table==='profiles')throw Error('Global profile query is forbidden');
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await ctx.newPage();await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 await page.goto('http://localhost:3000/profile?workspace='+workspace);await page.getByRole('heading',{name:'Harsh A',exact:true}).waitFor();
 await page.getByRole('button',{name:'Edit profile',exact:true}).click();await page.getByLabel('Display name').fill('Only A changed');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('heading',{name:'Only A changed',exact:true}).waitFor();
 await page.goto('http://localhost:3000/profile?workspace='+second);await page.getByRole('heading',{name:'Harsh B',exact:true}).waitFor();assert.equal(records[second].full_name,'Harsh B');assert.deepEqual(writes,[workspace]);assert.ok(reads.includes(second));console.log('Workspace A edit leaves Workspace B unchanged; profile/posts reads are scoped: PASS');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
