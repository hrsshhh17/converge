"use client";
import {useEffect,useState} from "react";
import {createClient} from "../../lib/supabase/client";
import MeetingInviteHub from "./MeetingInviteHub";
import "./workspace-tools.css";
export default function WorkspaceThemeScope({workspaceId,userId}:{workspaceId:string|null;userId?:string}){
 const[resolvedUserId,setResolvedUserId]=useState(userId||"");
 useEffect(()=>{if(!workspaceId)return;let active=true;void(async()=>{let id=userId;if(!id){const{data:{user}}=await createClient().auth.getUser();id=user?.id}if(!active||!id)return;setResolvedUserId(id);const theme=localStorage.getItem(`converge:workspace-theme:${workspaceId}:${id}`)||"ember";document.documentElement.dataset.workspaceTheme=theme})();return()=>{active=false}},[userId,workspaceId]);
 return workspaceId&&resolvedUserId?<MeetingInviteHub workspaceId={workspaceId} meId={resolvedUserId}/>:null;
}
