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


 const postId='77777777-7777-4777-8777-777777777777';
 await ctx.route(origin+'/**',async route=>{
  const url=new URL(route.request().url()),table=url.pathname.split('/').pop();let data=[];
  if(url.pathname.includes('/auth/'))data=user;
  else if(table==='workspaces')data=url.searchParams.get('id')?.startsWith('in.')?[{id:workspace,name:'Studio'}]:{name:'Studio',owner_id:other,personality:'Startup'};
  else if(table==='channels')data=url.searchParams.get('workspace_id')?.startsWith('in.')?[{workspace_id:workspace,avatar_url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}]:{avatar_url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'};
  else if(table==='workspace_members')data=[{workspace_id:workspace}];
  else if(table==='channel_messages'||table==='direct_messages')data=[];
  else if(table==='workspace_profiles'){assert.equal(url.searchParams.get('workspace_id'),'eq.'+workspace);const p={id:me,full_name:'Harsh',avatar_url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',job_title:'Designer'};data=url.searchParams.get('id')?.startsWith('eq.')?p:[p]}
  else if(table==='posts'){assert.equal(url.searchParams.get('workspace_id'),'eq.'+workspace);data=url.searchParams.has('body')?[{id:postId,body:'Design review'}]:url.searchParams.has('attachment_name')?[{id:postId,attachment_name:'Design.pdf'}]:[]}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await ctx.newPage();await page.routeWebSocket('**/realtime/**',ws=>ws.close());await page.goto('http://localhost:3000/workspace/'+workspace);await page.locator('.emptyFeed').waitFor();
 assert.equal(await page.locator('.emptyFeed button').innerText(),'Create post');
 assert.equal(await page.locator('.wordmark').evaluate(e=>e.tagName),'DIV');
 assert.equal(await page.locator('.spacePicker img').count(),1);assert.equal(await page.locator('.spacePicker img').getAttribute('alt'),'Studio group');
 await page.locator('.spacePicker').click();await page.getByRole('menu').waitFor();assert.equal(await page.getByRole('menuitem',{name:/Studio/}).count(),1);await page.locator('.wordmark').click();assert.equal(await page.getByRole('menu').count(),0);assert.ok(page.url().endsWith('/workspace/'+workspace));
 await page.getByRole('button',{name:'Files',exact:true}).click();await page.getByRole('heading',{name:'Files, media & links'}).waitFor();assert.ok(await page.locator('.proSidebar').isVisible());
 await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('heading',{name:'Calendar',exact:true}).waitFor();await page.getByRole('button',{name:/New event/}).click();await page.getByPlaceholder('Weekly design review').fill('Launch review');await page.getByRole('button',{name:'Save event'}).click();await page.getByText('Launch review',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Screen share',exact:true}).click();await page.getByRole('heading',{name:'Screen share',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Start screen share'}).isVisible());
 await page.getByRole('button',{name:'Home',exact:true}).click();await page.locator('.emptyFeed').waitFor();
 assert.ok(await page.locator('.topbar>.notificationsBell').evaluate(e=>e.nextElementSibling.classList.contains('createIcon')));
 await page.getByRole('textbox',{name:'Search posts, people and files'}).fill('Design');await page.locator('.workspaceSearchResults').getByText('Design review',{exact:true}).waitFor();
 assert.equal(await page.locator('.workspaceSearchResults').getByText('Design.pdf',{exact:true}).count(),1);
 assert.ok((await page.locator('.workspaceSearchResults a').getAttribute('href')).includes('workspace='+workspace));
 await page.keyboard.press('Escape');assert.equal(await page.locator('.workspaceSearchResults').count(),0);
 await page.getByRole('button',{name:'Create post',exact:true}).first().click();await page.getByRole('dialog',{name:'Post dialog'}).getByRole('button',{name:'Photo/video'}).click();
 const imageInput=page.getByRole('dialog',{name:'Post dialog'}).locator('input[type=file]');await imageInput.setInputFiles({name:'photo.png',mimeType:'image/png',buffer:fs.readFileSync('public/team/maya.png')});
 await page.getByRole('dialog',{name:'Edit media'}).waitFor();await page.locator('.imageCropStage canvas').waitFor({state:'visible'});await page.getByRole('button',{name:'1:1'}).click();await page.getByLabel('Zoom').fill('1.3');await page.getByRole('button',{name:'Use cropped photo'}).click();await page.locator('.mediaDraftPreview img').waitFor();assert.match(await page.locator('.mediaDraftPreview b').innerText(),/-edited\.(png|jpg)$/);
 await page.locator('.mediaDraftPreview').getByRole('button',{name:'Crop'}).click();await page.getByRole('dialog',{name:'Edit media'}).waitFor();await page.getByRole('dialog',{name:'Edit media'}).getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('.mediaDraftPreview').getByRole('button',{name:'Remove'}).click();await page.evaluate(()=>{const times=new WeakMap();Object.defineProperty(HTMLMediaElement.prototype,'duration',{configurable:true,get(){return 1}});Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{configurable:true,get(){return times.get(this)||0},set(value){times.set(this,value)}});HTMLVideoElement.prototype.captureStream=function(){return new MediaStream()};HTMLMediaElement.prototype.play=function(){setTimeout(()=>{this.currentTime=1.1;this.dispatchEvent(new Event('timeupdate'))},60);return Promise.resolve()};window.MediaRecorder=class{static isTypeSupported(){return true}constructor(){this.mimeType='video/webm'}start(){}stop(){this.ondataavailable?.({data:new Blob(['trimmed'],{type:'video/webm'})});this.onstop?.()}}});
 await imageInput.setInputFiles({name:'clip.webm',mimeType:'video/webm',buffer:Buffer.from('fixture')});const videoEditor=page.getByRole('dialog',{name:'Edit media'});await videoEditor.waitFor();await videoEditor.locator('video').dispatchEvent('loadedmetadata');await videoEditor.getByLabel('Trim start').fill('0.2');await videoEditor.getByRole('button',{name:'Use trimmed video'}).click();await page.waitForTimeout(200);if(await page.locator('.mediaEditorError').count())throw Error(await page.locator('.mediaEditorError').innerText());await page.locator('.mediaDraftPreview video').waitFor({timeout:15000});assert.equal(await page.locator('.mediaDraftPreview b').innerText(),'clip-edited.webm');
 for(const width of [390,875,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 console.log('Five feed changes, scoped search and responsive layout: PASS');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
