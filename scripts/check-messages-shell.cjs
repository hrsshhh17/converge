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
 await ctx.route(origin+'/**',async route=>{
  const url=new URL(route.request().url()),table=url.pathname.split('/').pop();let data=[];
  const avatar='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#754e37"/><circle cx="200" cy="210" r="110" fill="#be8b68"/></svg>');
  const people=[{id:me,full_name:'Harsh',avatar_url:null,job_title:'Designer'},{id:other,full_name:'Ram Prasad',avatar_url:avatar,job_title:'Developer'}];
  const message={id:'44444444-4444-4444-8444-444444444444',sender_id:other,recipient_id:me,body:'Let us review the new designs. https://example.com/guide?x=1&y=2.',created_at:new Date().toISOString(),message_type:'text',post_id:null,attachment_url:null,attachment_name:null};
  const mediaMessages=[1,2].map((number)=>({id:`66666666-6666-4666-8666-66666666666${number}`,sender_id:other,recipient_id:me,body:'',created_at:new Date(Date.now()+number*1000).toISOString(),message_type:'media',post_id:null,attachment_url:avatar,attachment_name:`shared-${number}.png`}));
  if(url.pathname.includes('/auth/'))data=user;
  else if(table==='workspace_profiles'){assert.equal(url.searchParams.get('workspace_id'),'eq.'+workspace);data=url.searchParams.has('id')&&url.searchParams.get('id').startsWith('eq.')?people.find(p=>p.id===url.searchParams.get('id').slice(3)):people;}
  else if(table==='workspaces')data={id:workspace,name:'Design studio'};
  else if(table==='channels'){const channel={id:'55555555-5555-4555-8555-555555555555',name:'Design studio',avatar_url:avatar};data=url.searchParams.get('id')?.startsWith('in.')?[channel]:channel;}
  else if(table==='workspace_members')data=people.map(p=>({user_id:p.id}));
  else if(table==='direct_messages')data=[message,...mediaMessages];
  else if(table==='channel_messages')data=url.searchParams.get('limit')==='1'?{body:'Welcome to the team',created_at:message.created_at}:[];
  else if(table==='get_workspace_unread_chats')data=[{chat_id:other,unread_count:2}];
  else if(table==='channel_members')data=route.request().headers().accept?.includes('object')?{role:'admin'}:[{channel_id:'55555555-5555-4555-8555-555555555555'}];
  else if(table==='direct_chat_blocks')data=null;
  else if(table==='direct_chat_is_blocked')data=false;
  else if(table==='channel_permissions')data={members_send_messages:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await ctx.newPage();await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=`http://localhost:3000/workspace/${workspace}/messages`;
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('link',{name:/Ram Prasad/}).waitFor({timeout:45000});
 await page.getByRole('button',{name:'View Ram Prasad photo',exact:true}).click();await page.getByRole('dialog',{name:'Ram Prasad profile photo'}).waitFor();assert.equal(page.url(),base);await page.keyboard.press('Escape');
 await page.getByRole('link',{name:/Ram Prasad/}).click();await page.locator('.chatMessage').first().waitFor({timeout:45000});
 await page.getByRole('button',{name:'Add attachment'}).click();assert.equal(await page.locator('.chatPlus').count(),1);await page.locator('.chatTop').click({position:{x:400,y:35}});assert.equal(await page.locator('.chatPlus').count(),0);
 await page.getByRole('button',{name:'Open shared-1.png'}).click();await page.getByRole('dialog',{name:'Chat media viewer'}).waitFor();assert.match(await page.getByRole('dialog',{name:'Chat media viewer'}).innerText(),/1 of 2/);await page.getByRole('button',{name:'Next media'}).click();assert.match(await page.getByRole('dialog',{name:'Chat media viewer'}).innerText(),/2 of 2/);await page.keyboard.press('ArrowLeft');assert.match(await page.getByRole('dialog',{name:'Chat media viewer'}).innerText(),/1 of 2/);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Chat media viewer'}).count(),0);
 await page.getByRole('button',{name:'Add attachment'}).click();await page.locator('.chatPlus input[accept="image/*,video/*"]').setInputFiles({name:'chat-photo.png',mimeType:'image/png',buffer:fs.readFileSync('public/team/maya.png')});await page.getByRole('dialog',{name:'Edit media'}).waitFor();await page.getByRole('button',{name:'Use cropped photo'}).click();await page.locator('.chatComposer>.mediaDraftPreview').waitFor();assert.match(await page.locator('.chatComposer>.mediaDraftPreview b').innerText(),/chat-photo-edited\.png/);await page.locator('.chatComposer>.mediaDraftPreview').getByRole('button',{name:'Remove'}).click();assert.equal(await page.locator('.chatComposer>.mediaDraftPreview').count(),0);
 assert.ok(await page.locator('.messagesIndex').isVisible());
 assert.equal(await page.locator('.railBrand svg').count(),1);assert.match(await page.locator('.chatSeparator').first().innerText(),/^Today · /);
 await ctx.route('https://example.com/**',r=>r.fulfill({body:'Test destination'}));const link=page.locator('.chatTextLink').first();assert.equal(await link.getAttribute('target'),'_blank');const popupEvent=ctx.waitForEvent('page');await link.click();const popup=await popupEvent;await popup.waitForLoadState();assert.equal(popup.url(),'https://example.com/guide?x=1&y=2');await popup.close();
 await page.getByRole('button',{name:'Options',exact:true}).click();await page.locator('.directChatMenu').getByRole('button',{name:'Chat theme & wallpaper'}).click();await page.getByRole('button',{name:'Forest',exact:true}).click();await page.getByRole('button',{name:'Grid',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await page.locator('.chatTheme-forest.chatWallpaper-grid').count(),1);
 await page.getByRole('button',{name:'Options',exact:true}).click();
 assert.equal(await page.locator('.directChatMenu').isVisible(),true);
 assert.equal(await page.locator('.directChatMenu').getByText('Add member',{exact:true}).count(),0);
 await page.locator('.directChatMenu').getByRole('button',{name:'Contact info'}).click();
 await page.getByRole('dialog',{name:'Contact info',exact:true}).waitFor();
 await page.getByRole('button',{name:'View Design studio group photo'}).waitFor();await page.getByRole('button',{name:'View Design studio group photo'}).click();await page.getByRole('dialog',{name:'Design studio profile photo'}).waitFor();assert.ok(page.url().includes(other));await page.getByRole('button',{name:'Close photo',exact:true}).click();
 assert.ok((await page.locator('.commonGroupRow a').getAttribute('href')).includes('/messages/group?channel=55555555'));
 await page.locator('.commonGroupRow a').click();await page.waitForURL('**/messages/group?channel=55555555-5555-4555-8555-555555555555');await page.locator('.chatTitle').getByText('Design studio',{exact:true}).waitFor();assert.equal(await page.locator('.chatTheme-ember.chatWallpaper-glow').count(),1);await page.locator('.conversationRow a').filter({hasText:'Ram Prasad'}).click();await page.locator('.chatTitle').getByText('Ram Prasad',{exact:true}).waitFor();await page.locator('.chatTheme-forest.chatWallpaper-grid').waitFor();await page.getByRole('button',{name:'Options',exact:true}).click();await page.locator('.directChatMenu').getByRole('button',{name:'Contact info'}).click();
 if(process.env.CONTACT_SCREENSHOT)await page.screenshot({path:process.env.CONTACT_SCREENSHOT});
 await page.getByRole('button',{name:'View contact photo',exact:true}).click();await page.getByRole('dialog',{name:'Ram Prasad profile photo'}).waitFor();await page.getByRole('button',{name:'Close photo',exact:true}).click();
 await page.getByRole('button',{name:'Close contact info',exact:true}).click();
 await page.getByRole('button',{name:'Options',exact:true}).click();await page.locator('.directChatMenu').getByRole('button',{name:'Search',exact:false}).click();
 await page.getByRole('textbox',{name:'Search messages',exact:true}).fill('new designs');assert.equal(await page.locator('.contactResult').count(),1);await page.locator('.contactResult').click();assert.equal(await page.locator('.contactSheet').count(),0);
 await page.getByRole('button',{name:'Message options',exact:true}).first().click();await page.locator('.messageContextMenu').getByRole('button',{name:'Star',exact:false}).click();
 await page.getByRole('button',{name:'Options',exact:true}).click();await page.locator('.directChatMenu').getByRole('button',{name:'Contact info'}).click();await page.getByRole('button',{name:/Starred messages/}).click();assert.equal(await page.locator('.contactResult').count(),1);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Options',exact:true}).click();await page.locator('.directChatMenu').getByRole('button',{name:'Add to favourites'}).click();await page.getByRole('button',{name:'Favourites',exact:true}).click();assert.equal(await page.locator('.conversationRow').count(),1);await page.getByRole('button',{name:'All',exact:true}).click();
 await page.getByRole('button',{name:'Options',exact:true}).click();page.once('dialog',d=>d.accept('Project'));await page.locator('.directChatMenu').getByRole('button',{name:'Add to list'}).click();await page.getByLabel('Filter by chat list').selectOption('list:Project');assert.equal(await page.locator('.conversationRow').count(),1);await page.getByRole('button',{name:'All',exact:true}).click();
 await page.getByRole('button',{name:'Options',exact:true}).click();page.once('dialog',d=>d.accept());await page.locator('.directChatMenu').getByRole('button',{name:'Block',exact:false}).click();assert.equal(await page.getByRole('button',{name:'Voice call',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Options',exact:true}).click();page.once('dialog',d=>d.accept());await page.locator('.directChatMenu').getByRole('button',{name:'Unblock',exact:false}).click();assert.equal(await page.getByRole('button',{name:'Voice call',exact:true}).isDisabled(),false);
 if(process.env.CHAT_SCREENSHOT)await page.screenshot({path:process.env.CHAT_SCREENSHOT});
 await page.locator('.chatMessages').dblclick({position:{x:20,y:350}});await page.getByRole('dialog',{name:'Close chat',exact:true}).waitFor();await page.getByRole('button',{name:'Keep chatting',exact:true}).click();
 await page.locator('.chatMessages').dblclick({position:{x:20,y:350}});await page.getByRole('button',{name:'Close chat',exact:true}).click();await page.waitForURL(base);assert.ok(await page.locator('.conversationWelcome').isVisible());
 await page.getByRole('button',{name:'Unread',exact:false}).click();assert.equal(await page.locator('.conversationRow').count(),1);
 for(const width of [360,390,768,1024,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log('Inbox no overflow:',width);}
 await page.setViewportSize({width:390,height:844});await page.getByRole('link',{name:/Ram Prasad/}).click();await page.locator('.chatMessage').first().waitFor();assert.equal(await page.locator('.messagesIndex').isVisible(),false);assert.ok(await page.locator('.chatComposer').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'View chat photo',exact:true}).click();await page.locator('.mobilePhotoViewer').waitFor();await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.ok((await page.locator('.photoViewerStage img').getAttribute('style')).includes('scale(2.5)'));await page.getByRole('button',{name:'Reset zoom',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 if(process.env.MOBILE_PHOTO_SCREENSHOT)await page.screenshot({path:process.env.MOBILE_PHOTO_SCREENSHOT});
 const cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:350,id:1},{x:230,y:350,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:350,id:1},{x:280,y:350,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.getByRole('button',{name:'Reset zoom',exact:true}).waitFor();await page.getByRole('button',{name:'Reset zoom',exact:true}).click();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:350,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:510,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.locator('.photoViewer').count(),0);
 assert.deepEqual(errors,[]);console.log('Common-group photo/link, mobile zoom/pinch/swipe and chat interactions: PASS');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
