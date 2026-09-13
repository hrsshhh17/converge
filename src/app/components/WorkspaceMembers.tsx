"use client";

import Image from "next/image";
import {useCallback,useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {createClient} from "../../lib/supabase/client";

type Member={user_id:string;role:string;full_name:string|null;avatar_url:string|null};

export default function WorkspaceMembers({workspaceId,owner,variant="default",externalTrigger=false}:{workspaceId:string;owner:boolean;variant?:"default"|"menu";externalTrigger?:boolean}){
 const[open,setOpen]=useState(false),[members,setMembers]=useState<Member[]>([]),[link,setLink]=useState(""),[message,setMessage]=useState("");
 const load=useCallback(async()=>{const client=createClient(),{data:rows}=await client.from("workspace_members").select("user_id,role").eq("workspace_id",workspaceId),ids=(rows||[]).map(row=>row.user_id),{data:people}=ids.length?await client.from("workspace_profiles").select("id,full_name,avatar_url").eq("workspace_id",workspaceId).in("id",ids):{data:[]},profiles=new Map((people||[]).map(person=>[person.id,person]));setMembers((rows||[]).map(row=>({...row,full_name:profiles.get(row.user_id)?.full_name||"Member",avatar_url:profiles.get(row.user_id)?.avatar_url||null})))},[workspaceId]);
 useEffect(()=>{if(!open)return;const task=window.setTimeout(()=>void load(),0),previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{window.clearTimeout(task);document.body.style.overflow=previous}},[load,open]);
 useEffect(()=>{if(!externalTrigger)return;const show=()=>setOpen(true);window.addEventListener("converge:open-members",show);return()=>window.removeEventListener("converge:open-members",show)},[externalTrigger]);
 const createInvite=async()=>{setMessage("");const{data,error}=await createClient().rpc("create_workspace_invite",{target_workspace_id:workspaceId});if(error||!data){setMessage(error?.message||"Could not create an invite link.");return}setLink(`${location.origin}/join/${data}`);setMessage("Invite link is ready. Anyone with this link can join as a member.")};
 const copy=async()=>{if(!link)return;await navigator.clipboard.writeText(link);setMessage("Invite link copied.")};
 const dialog=<div className="modal membersDialog" role="dialog" aria-modal="true" aria-label="Workspace members" onMouseDown={event=>event.target===event.currentTarget&&setOpen(false)}><section><header><span><p>TEAM MEMBERS</p><h2>Invite your team</h2></span><button aria-label="Close members" onClick={()=>setOpen(false)}>×</button></header>{owner&&<div className="inviteMaker"><p>Create a secure link. New people can sign up and join automatically.</p><button onClick={createInvite}>Create invite link</button>{link&&<div><input readOnly value={link} onFocus={event=>event.target.select()}/><button onClick={copy}>Copy</button></div>}</div>}{message&&<p className="memberMessage">{message}</p>}<div className="memberList"><b>{members.length} members</b>{members.map(member=><div key={member.user_id}>{member.avatar_url?<Image src={member.avatar_url} alt="" width={29} height={29} unoptimized/>:<i>{member.full_name?.slice(0,1)}</i>}<span>{member.full_name}<small>{member.role}</small></span></div>)}</div></section></div>;
 return <div className={`workspaceMembers ${externalTrigger?"externalMemberDialog":""}`}>{!externalTrigger&&<button className={`memberTrigger ${variant==="menu"?"memberTriggerMenu":""}`} onClick={()=>setOpen(true)}>{variant==="menu"&&<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8m9 5v6m-3-3h6"/></svg>}<span>Invite members</span></button>}{open&&typeof document!=="undefined"&&createPortal(dialog,document.body)}</div>;
}
