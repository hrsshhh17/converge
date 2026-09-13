"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {createClient} from "../../lib/supabase/client";

type Signal={type:string;from:string;name?:string};

export default function MeetingInviteHub({workspaceId,meId}:{workspaceId:string;meId:string}){
 const[invite,setInvite]=useState<{id:string;name:string}|null>(null),inviteRef=useRef<string|null>(null);
 useEffect(()=>{inviteRef.current=invite?.id||null},[invite]);
 useEffect(()=>{
  if(new URLSearchParams(location.search).get("view")==="screen")return;
  const client=createClient(),channel=client.channel(`workspace-meeting:${workspaceId}`,{config:{private:true}}).on("broadcast",{event:"meeting-signal"},({payload})=>{
   const signal=payload as Signal;
   if(signal.from!==meId&&signal.type==="start"&&!document.querySelector(".meetingPage"))setInvite({id:signal.from,name:signal.name||"A workspace member"});
   if(signal.type==="stop"&&signal.from===inviteRef.current)setInvite(null);
  }).subscribe(value=>{if(value==="SUBSCRIBED")void channel.send({type:"broadcast",event:"meeting-signal",payload:{type:"discover",from:meId}})});
  return()=>{void client.removeChannel(channel)};
 },[meId,workspaceId]);
 if(!invite||typeof document==="undefined")return null;
 return createPortal(<div className="meetingInviteBackdrop globalMeetingInvite" role="dialog" aria-modal="true" aria-label="Meeting invitation"><section><i>◉</i><small>WORKSPACE MEETING</small><h2>{invite.name} started a meeting</h2><p>Join to watch the shared screen, talk using your mic or camera, and message everyone in the meeting.</p><div><button onClick={()=>setInvite(null)}>Not now</button><button onClick={()=>location.assign(`/workspace/${workspaceId}?view=screen&join=1`)}>Join meeting</button></div></section></div>,document.body);
}
