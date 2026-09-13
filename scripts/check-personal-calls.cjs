const fs=require('fs');
const ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();await page.goto('http://localhost:3000');
  const code=ts.transpileModule(fs.readFileSync('src/app/components/call-runtime.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const result=await page.evaluate(async(code)=>{
   const logs=[],handlers={};let pc;
   const client={rpc:async()=>({data:false}),channel:()=>({on(type,filter,fn){if(type==='broadcast')handlers.signal=fn;return this},subscribe(){return this},send:async()=>{}}),removeChannel:async()=>{},from(table){const q={select(){return q},eq(){return q},gte(){return q},order(){return q},delete(){return q},insert(){return q},upsert(row){logs.push(row);return q},maybeSingle:async()=>({data:{full_name:'Test Partner',avatar_url:'https://example.com/avatar.png'}}),then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return q}};
   const track={enabled:true,stop(){}};Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track],getVideoTracks:()=>[]})}});
   Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{configurable:true,set(){},get(){return null}});
   window.RTCPeerConnection=class{constructor(){pc=this}addTrack(){}async createOffer(){return {type:'offer',sdp:'test'}}async setLocalDescription(){}async setRemoteDescription(value){this.remoteDescription=value}async addIceCandidate(){}close(){}};
   const exports={};new Function('require','exports',code)(name=>name.includes('supabase')?{createClient:()=>client}:name.includes('ringtone')?{callDuration:ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`,startRingtone:()=>()=>{}}:{},exports);
   const stop=exports.attachCallRuntime({workspaceId:'workspace',chatId:'partner',meId:'me',isGroup:false});
   const button=document.createElement('button');button.setAttribute('aria-label','Voice call');document.body.append(button);button.click();await new Promise(r=>setTimeout(r,50));
   if(document.querySelector('.callAvatar img')?.alt!=='Test Partner')throw Error('Missing partner photo');
   pc.connectionState='connected';pc.onconnectionstatechange();document.querySelector('.callMute').click();if(track.enabled)throw Error('Mute did not work');
   document.querySelector('.callHangup').click();await new Promise(r=>setTimeout(r,10));stop();
   if(logs.length!==1||logs[0].recipient_id!=='partner'||!logs[0].body.startsWith('Voice call • 0:'))throw Error('Incorrect call log');
   return {photo:true,mute:true,oneDurationLog:true};
  },code);console.log(result);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
