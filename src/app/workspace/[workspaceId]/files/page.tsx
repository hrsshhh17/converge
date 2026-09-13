"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useParams,useRouter} from "next/navigation";
import {createClient} from "../../../../lib/supabase/client";
import WorkspaceFiles from "../../../components/WorkspaceFiles";
import WorkspaceThemeScope from "../../../components/WorkspaceThemeScope";
import {WorkspaceRailLinks} from "../../../components/WorkspaceIconRail";
import "../../../components/messages-shell.css";
import "./files.css";
export default function FilesPage(){
 const{workspaceId}=useParams<{workspaceId:string}>(),router=useRouter(),[meId,setMeId]=useState("");
 useEffect(()=>{void createClient().auth.getUser().then(({data})=>data.user?setMeId(data.user.id):router.replace("/auth"))},[router]);
 return <main className="filesShell"><WorkspaceThemeScope workspaceId={workspaceId} userId={meId}/><aside className="messagesRail"><Link className="railBrand" href={`/workspace/${workspaceId}`} aria-label="Converge"><svg viewBox="0 0 64 58"><path d="M32 29C22 11 7 11 7 24c0 11 11 15 25 5"/><path d="M32 29C52 11 59 24 54 35c-4 9-16 6-22-6"/><path d="M32 29C29 53 14 52 13 39c0-11 11-14 19-10"/><circle cx="32" cy="29" r="4"/></svg></Link><WorkspaceRailLinks workspaceId={workspaceId} active="files"/><div className="railSpacer"/><Link href="/dashboard" aria-label="All workspaces" title="All workspaces">⌘</Link></aside>{meId?<WorkspaceFiles workspaceId={workspaceId} meId={meId}/>:<div className="filesLoading">Loading files…</div>}</main>;
}
