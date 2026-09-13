"use client";
import {createClient} from "../../lib/supabase/client";
import {attachGroupCallRuntime} from "./group-call";
import {callDuration,startRingtone} from "./ringtone";
import {attachRemoteTrack,getIceServers} from "./webrtc-config";
import "./call-runtime.css";

type Mode="audio"|"video";
type Signal={type:"offer"|"answer"|"ice"|"hangup";from:string;to:string;mode?:Mode;payload?:RTCSessionDescriptionInit|RTCIceCandidateInit;callId?:string;eventId?:string;reason?:string};
type Stored={id:string;sender_id:string;recipient_id:string;signal_type:Signal["type"];mode:Mode|null;signal:unknown;created_at?:string};
export function attachCallRuntime({workspaceId,chatId,meId,isGroup}:{workspaceId:string;chatId:string;meId:string;isGroup:boolean}){
 if(isGroup)return attachGroupCallRuntime({workspaceId,channelId:chatId,meId});
 const client=createClient(),room=client.channel(`call:${workspaceId}:${[meId,chatId].sort().join(":")}`,{config:{private:true}});
 let peer:RTCPeerConnection|null=null,stream:MediaStream|null=null,overlay:HTMLDivElement|null=null,remote:HTMLVideoElement|null=null;
 let mode:Mode="audio",callId="",initiated=false,startedAt=0,answered=false,disposed=false,busy=false;
 let stopRing:(()=>void)|null=null,timer:ReturnType<typeof setInterval>|null=null,timeout:ReturnType<typeof setTimeout>|null=null;
 const processed=new Set<string>(),logged=new Set<string>(),pending:RTCIceCandidateInit[]=[];
 const earlyIce=new Map<string,RTCIceCandidateInit[]>();
 const status=(text:string)=>{const el=overlay?.querySelector(".callStatus");if(el)el.textContent=text};
 const signal=(s:Omit<Signal,"from"|"to">)=>{
  const payload:Signal={...s,from:meId,to:chatId,callId:s.callId||callId,eventId:crypto.randomUUID()};
  void room.send({type:"broadcast",event:"signal",payload});
  void client.from("call_signals").insert({id:payload.eventId,workspace_id:workspaceId,sender_id:meId,recipient_id:chatId,signal_type:s.type,mode:s.mode||mode,signal:{__callEnvelope:1,...payload}}).then(({error})=>{if(error&&s.type==="offer"&&callId===payload.callId){status("Call signal could not be saved. Check your connection.");}});
 };
 const log=(id:string,result:string)=>{
  if(!id||logged.has(id))return;logged.add(id);
  void client.from("direct_messages").upsert({id,workspace_id:workspaceId,sender_id:meId,recipient_id:chatId,body:`${mode==="video"?"Video":"Voice"} call • ${result}`,message_type:"text"},{onConflict:"id",ignoreDuplicates:true}).then(({error})=>{
   if(error){logged.delete(id);window.alert("Call ended, but its chat log could not be saved: "+error.message)}
   else{window.dispatchEvent(new Event("converge:call-log"));window.dispatchEvent(new Event("converge:unread-chats"))}
  });
 };
 const close=(notify=true,reason="No answer")=>{
  if(!callId)return;const id=callId,result=startedAt?callDuration(Date.now()-startedAt):reason;
  if(notify)signal({type:"hangup",reason:result});
  if(initiated)log(id,result);
  callId="";stopRing?.();stopRing=null;if(timer)clearInterval(timer);if(timeout)clearTimeout(timeout);timer=null;timeout=null;
  peer?.close();peer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;pending.length=0;overlay?.remove();overlay=null;remote=null;busy=false;
 };
 const show=async(incoming:boolean,id:string)=>{
  const {data:person}=await client.from("workspace_profiles").select("full_name,avatar_url").eq("workspace_id",workspaceId).eq("id",chatId).maybeSingle();
  if(disposed||id!==callId)return;
  overlay?.remove();overlay=document.createElement("div");overlay.className="callOverlay "+(mode==="video"?"videoCall":"voiceCall");overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label",incoming?"Incoming call":"Active call");
  overlay.innerHTML='<section><div class="callBrand">CONVERGE · PERSONAL CALL</div><div class="callPerson"><div class="callAvatar"></div><h2></h2><p class="callStatus" aria-live="polite"></p></div><div class="callVideoStage"><video class="remote" autoplay playsinline></video><video class="local" autoplay playsinline muted></video></div><div class="callControls"><button class="callAccept">Answer</button><button class="callMute">Mute</button><button class="callCamera">Camera off</button><button class="callHangup">End call</button></div><small class="callHint"></small></section>';
  const name=person?.full_name||"Workspace member";overlay.querySelector("h2")!.textContent=name;
  const avatar=overlay.querySelector(".callAvatar")!;
  if(person?.avatar_url){const img=document.createElement("img");img.src=person.avatar_url;img.alt=name;avatar.append(img)}else avatar.textContent=name.split(" ").map((v:string)=>v[0]).join("").slice(0,2);
  overlay.querySelector(".callHint")!.textContent=incoming?"A teammate is calling you":"Your microphone stays under your control";
  const accept=overlay.querySelector<HTMLButtonElement>(".callAccept")!,mute=overlay.querySelector<HTMLButtonElement>(".callMute")!,camera=overlay.querySelector<HTMLButtonElement>(".callCamera")!;
  accept.hidden=!incoming;mute.hidden=incoming;camera.hidden=incoming||mode!=="video";
  const hangup=overlay.querySelector<HTMLButtonElement>(".callHangup")!;hangup.textContent=incoming?"Decline":"End call";hangup.onclick=()=>close(true,incoming&&!answered?"Declined":answered?"Call ended":"Cancelled");
  mute.onclick=()=>{const track=stream?.getAudioTracks()[0];if(track){track.enabled=!track.enabled;mute.textContent=track.enabled?"Mute":"Unmute";mute.setAttribute("aria-pressed",String(!track.enabled))}};
  camera.onclick=()=>{const track=stream?.getVideoTracks()[0];if(track){track.enabled=!track.enabled;camera.textContent=track.enabled?"Camera off":"Camera on"}};
  document.body.append(overlay);remote=overlay.querySelector(".remote");overlay.addEventListener("click",()=>{if(remote?.srcObject)void remote.play().catch(()=>{})});status(incoming?"Incoming "+(mode==="audio"?"voice":"video")+" call":"Calling…");
  return accept;
 };
 const prepare=async(id:string)=>{
  const media=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==="video"});
  if(disposed||id!==callId){media.getTracks().forEach(t=>t.stop());throw Error("Call was closed")}
  stream=media;const pc=new RTCPeerConnection({iceServers:getIceServers()});peer=pc;const remoteStream=new MediaStream();
  media.getTracks().forEach(t=>pc.addTrack(t,media));const local=overlay?.querySelector<HTMLVideoElement>(".local");if(local){local.muted=true;local.srcObject=media}
  pc.ontrack=e=>{if(id===callId&&remote){attachRemoteTrack(remoteStream,e);remote.srcObject=remoteStream;remote.muted=false;remote.volume=1;void remote.play().catch(()=>status("Tap the call screen to enable audio"));}};
  pc.onicecandidate=e=>{if(e.candidate&&id===callId)signal({type:"ice",payload:e.candidate.toJSON()})};
  pc.onconnectionstatechange=()=>{
   if(id!==callId)return;
   if(pc.connectionState==="connected"){if(!startedAt)startedAt=Date.now();if(timeout)clearTimeout(timeout);status(callDuration(Date.now()-startedAt));if(!timer)timer=setInterval(()=>status(callDuration(Date.now()-startedAt)),1000)}
   else if(pc.connectionState==="failed"){status("Media connection failed. TURN relay may be unavailable.");setTimeout(()=>{if(id===callId)close(true,"Connection failed")},1500)}
   else if(pc.connectionState==="disconnected")status("Reconnecting…");
  };
  return pc;
 };
 const start=async(nextMode:Mode)=>{
  if(callId||disposed)return;
  const {data:blocked}=await client.rpc("direct_chat_is_blocked",{target_workspace_id:workspaceId,target_partner_id:chatId});if(blocked===true){window.alert("This private conversation is blocked.");return}
  if(callId||disposed)return;mode=nextMode;callId=crypto.randomUUID();const id=callId;initiated=false;startedAt=0;answered=false;
  try{await show(false,id);if(id!==callId)return;const pc=await prepare(id);const offer=await pc.createOffer();await pc.setLocalDescription(offer);if(id!==callId)return;initiated=true;signal({type:"offer",payload:offer,mode});status("Ringing…");timeout=setTimeout(()=>{if(id===callId)close(true,"No answer")},45000)}
  catch{if(id===callId){close(false,"Connection failed");window.alert("Unable to start call. Check camera/microphone permission and connection.")}}
 };
 const receive=async(s:Signal)=>{
  if(disposed||s.from!==chatId||s.to!==meId)return;
  const event=s.eventId||(s.type==="offer"||s.type==="answer"||s.type==="ice"?s.type+JSON.stringify(s.payload):"");
  if(event&&processed.has(event))return;if(event)processed.add(event);
  try{
   if(s.type==="offer"){
    if(callId)return;const {data:blocked}=await client.rpc("direct_chat_is_blocked",{target_workspace_id:workspaceId,target_partner_id:chatId});if(blocked===true||callId||disposed)return;
    callId=s.callId||crypto.randomUUID();const id=callId;pending.push(...(earlyIce.get(id)||[]));earlyIce.clear();mode=s.mode||"audio";initiated=false;answered=false;startedAt=0;
    const accept=await show(true,id);if(!accept||id!==callId)return;stopRing=startRingtone();timeout=setTimeout(()=>{if(id===callId)close(true,"No answer")},50000);
    accept.onclick=async()=>{if(answered||id!==callId)return;answered=true;accept.disabled=true;stopRing?.();stopRing=null;status("Connecting…");try{const pc=await prepare(id);await pc.setRemoteDescription(s.payload as RTCSessionDescriptionInit);for(const candidate of pending.splice(0))await pc.addIceCandidate(candidate);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);if(id!==callId)return;signal({type:"answer",payload:answer});accept.hidden=true;overlay!.querySelector<HTMLButtonElement>(".callMute")!.hidden=false;overlay!.querySelector<HTMLButtonElement>(".callCamera")!.hidden=mode!=="video";overlay!.querySelector(".callHangup")!.textContent="End call"}catch{if(id===callId){close(true,"Connection failed");window.alert("Unable to answer. Check microphone/camera access.")}}};
    const key=`converge:auto-answer:${workspaceId}:${chatId}`;if(sessionStorage.getItem(key)){sessionStorage.removeItem(key);accept.click()}return;
   }
   if(!callId&&s.type==="ice"&&s.callId&&s.payload){if(earlyIce.size>8)earlyIce.clear();const candidates=earlyIce.get(s.callId)||[];if(candidates.length<64)candidates.push(s.payload as RTCIceCandidateInit);earlyIce.set(s.callId,candidates);return}
   if(!callId||(s.callId&&s.callId!==callId))return;
   if(s.type==="answer"&&peer&&!peer.remoteDescription){answered=true;await peer.setRemoteDescription(s.payload as RTCSessionDescriptionInit);for(const c of pending.splice(0))await peer.addIceCandidate(c)}
   if(s.type==="ice"&&s.payload){if(peer?.remoteDescription)await peer.addIceCandidate(s.payload as RTCIceCandidateInit);else pending.push(s.payload as RTCIceCandidateInit)}
   if(s.type==="hangup")close(false,s.reason||"No answer");
  }catch{close(true,"Connection failed")}
 };
 room.on("broadcast",{event:"signal"},({payload})=>void receive(payload as Signal)).subscribe();
 const consume=async(row:Stored)=>{
  const envelope=row.signal as {__callEnvelope?:number}&Partial<Signal>|null;
  await receive(envelope?.__callEnvelope?{...envelope,type:row.signal_type,from:row.sender_id,to:row.recipient_id,eventId:envelope.eventId||row.id} as Signal:{type:row.signal_type,from:row.sender_id,to:row.recipient_id,mode:row.mode||undefined,payload:row.signal as Signal["payload"]});
  await client.from("call_signals").delete().eq("id",row.id);
 };
 const inbox=client.channel(`call-inbox:${workspaceId}:${meId}:${chatId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"call_signals",filter:`recipient_id=eq.${meId}`},({new:row})=>{if(row.sender_id===chatId&&row.workspace_id===workspaceId)void consume(row as Stored)}).subscribe();
 const check=async()=>{if(busy||disposed)return;busy=true;try{const {data}=await client.from("call_signals").select("*").eq("workspace_id",workspaceId).eq("recipient_id",meId).eq("sender_id",chatId).gte("created_at",new Date(Date.now()-60000).toISOString()).order("created_at");for(const row of data||[])await consume(row as Stored)}finally{busy=false}};
 void check().catch(()=>{});const polling=setInterval(()=>void check().catch(()=>{}),2500);
 const click=(e:MouseEvent)=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>("[aria-label='Voice call'],[aria-label='Video call']");if(!button||button.disabled)return;e.preventDefault();void start(button.getAttribute("aria-label")==="Video call"?"video":"audio")};
 document.addEventListener("click",click);
 return()=>{disposed=true;document.removeEventListener("click",click);clearInterval(polling);close(true,"Call ended");void client.removeChannel(room);void client.removeChannel(inbox)};
}
