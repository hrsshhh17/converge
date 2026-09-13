"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import "./messages-shell.css";
import PhotoPreview from "./PhotoPreview";
import NotificationsBell from "./NotificationsBell";
import "../workspace/[workspaceId]/notifications.css";
import {WorkspaceRailLinks} from "./WorkspaceIconRail";
import WorkspaceThemeScope from "./WorkspaceThemeScope";

type Profile = { id: string; full_name: string | null; avatar_url: string | null; job_title: string | null };
type DirectRow = { sender_id: string; recipient_id: string; body: string; post_id: string | null; created_at: string; message_type:string; attachment_name:string|null };
type Chat = { id: string; name: string; avatar: string | null; preview: string; time: string; group?: boolean; mainGroup?: boolean; unread?: number; channelId?:string };
const initials = (name: string) => (name.split(" ").map((part) => part[0]).join("").slice(0, 2) || "M").toUpperCase();
const chatKey=(chat:Chat)=>chat.group?`group:${chat.channelId}`:`direct:${chat.id}`;

export default function MessagesShell({children}:{children:ReactNode}) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const pathname=usePathname();const searchParams=useSearchParams();const base=`/workspace/${workspaceId}/messages`;const active=pathname.startsWith(base+"/")?pathname.slice(base.length+1):"";
  const [query,setQuery]=useState("");const [filter,setFilter]=useState("all");const [photo,setPhoto]=useState<{src:string|null;name:string}|null>(null);const [ready,setReady]=useState(false);
  const router = useRouter(); const [me, setMe] = useState<Profile | null>(null); const [chats, setChats] = useState<Chat[]>([]); const [members, setMembers] = useState<Profile[]>([]); const [open, setOpen] = useState(false); const [error, setError] = useState("");
  const [pinnedChatKeys,setPinnedChatKeys]=useState<string[]>([]);
  const authenticatedOnce = useRef(false);
  const load = useCallback(async () => {
    const client = createClient(); const { data: { user }, error: authError } = await client.auth.getUser(); if (!user) { if (authenticatedOnce.current || authError) return; router.replace("/auth"); return; } authenticatedOnce.current = true;
    const [{ data: mine }, { data: channels }, { data: channelMemberships }, { data: memberRows }, { data: dmRows, error: dmError }, {data:unreadRows}] = await Promise.all([
      client.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id",workspaceId).eq("id", user.id).single(), client.from("channels").select("id,name,avatar_url,is_workspace_group").eq("workspace_id", workspaceId).eq("kind", "group").order("created_at", { ascending: true }),client.from("channel_members").select("channel_id").eq("user_id",user.id), client.from("workspace_members").select("user_id").eq("workspace_id", workspaceId), client.from("direct_messages").select("sender_id,recipient_id,body,post_id,created_at,message_type,attachment_name").eq("workspace_id", workspaceId).or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).order("created_at", { ascending: false }),client.rpc("get_workspace_unread_chats",{target_workspace_id:workspaceId}),
    ]);
    const currentProfile=(mine || { id: user.id, full_name: user.email?.split("@")[0] || "Member", avatar_url: null, job_title: null }) as Profile;
    setMe(currentProfile); if (dmError) { setError(dmError.message); return; }
    const ids = (memberRows || []).map((row) => row.user_id); const { data: maskedPeople, error: identityError } = await client.rpc("get_workspace_chat_identities",{target_workspace_id:workspaceId}); const { data: fallbackPeople } = identityError&&ids.length ? await client.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id",workspaceId).in("id", ids) : { data: [] }; const all = ((identityError?fallbackPeople:maskedPeople) || []) as Profile[]; const peopleById = new Map(all.map((person) => [person.id, person]));peopleById.set(user.id,currentProfile);setMembers([currentProfile,...all.filter((person) => person.id !== user.id)]);
    const unread=new Map(((unreadRows||[]) as {chat_id:string;unread_count:number}[]).map(row=>[row.chat_id,Number(row.unread_count)]));
    const latest = new Map<string, DirectRow>(); ((dmRows || []) as DirectRow[]).forEach((row) => { const other = row.sender_id === user.id ? row.recipient_id : row.sender_id; if (!latest.has(other)) latest.set(other, row); }); const direct:Chat[] = [...latest.entries()].map(([id, row]) => { const person = peopleById.get(id); const senderName=row.sender_id===user.id?(currentProfile.full_name||"You"):(peopleById.get(row.sender_id)?.full_name||"Member");return { id, name: `${person?.full_name || "Member"}${id===user.id?" (You)":""}`, avatar: person?.avatar_url || null, preview: row.message_type==="voice"?"Voice message":row.post_id ? `${senderName} sent a post` : row.body || row.attachment_name || "Attachment", time: row.created_at,unread:unread.get(id)||0 }; });
    if(!latest.has(user.id))direct.push({id:user.id,name:`${currentProfile.full_name||"Me"} (You)`,avatar:currentProfile.avatar_url,preview:"Message yourself",time:"",unread:0});
    const joined=new Set((channelMemberships||[]).map(row=>row.channel_id)),visibleChannels=(channels||[]).filter(channel=>channel.is_workspace_group||joined.has(channel.id));
    // Old data can contain more than one `is_workspace_group` flag. The original
    // (earliest) workspace channel is the only conversation that stays fixed.
    const mainChannelId=visibleChannels.find(channel=>channel.is_workspace_group)?.id||visibleChannels[0]?.id;
    const groupChats=await Promise.all(visibleChannels.map(async channel=>{const{data:last}=await client.from("channel_messages").select("body,created_at,attachment_name,message_type,post_id,sender_id").eq("channel_id",channel.id).order("created_at",{ascending:false}).limit(1).maybeSingle();const mainGroup=channel.id===mainChannelId;const senderName=last?.sender_id===user.id?(currentProfile.full_name||"You"):(peopleById.get(last?.sender_id||"")?.full_name||"Member");return{id:"group",channelId:channel.id,name:channel.name,avatar:channel.avatar_url||null,preview:last?.message_type==="voice"?"Voice message":last?.post_id?`${senderName} sent a post`:last?.body||last?.attachment_name||"Start the conversation",time:last?.created_at||"",group:true,mainGroup,unread:unread.get(channel.id)||(mainGroup?unread.get("group")||0:0)} satisfies Chat}));
    const storedPins=JSON.parse(localStorage.getItem(`converge:pinned-chats:${workspaceId}:${user.id}`)||"[]") as string[];
    setPinnedChatKeys(storedPins);
    const pinRank=new Map(storedPins.map((key,index)=>[key,index]));
    const ordered:Chat[]=[...groupChats,...direct].sort((a:Chat,b:Chat)=>{const aMain=Boolean(a.mainGroup),bMain=Boolean(b.mainGroup);if(aMain!==bMain)return aMain?-1:1;const aPin=pinRank.get(chatKey(a)),bPin=pinRank.get(chatKey(b));if((aPin!==undefined)!==(bPin!==undefined))return aPin!==undefined?-1:1;if(aPin!==undefined&&bPin!==undefined)return aPin-bPin;return (b.time?new Date(b.time).getTime():0)-(a.time?new Date(a.time).getTime():0)});
    setChats(ordered); setError("");setReady(true);
  }, [router, workspaceId]);
  const loading=useRef(false);
  const safeLoad = useCallback(() => { if(loading.current)return;loading.current=true;void load().catch(() => setError("Connection interrupted. Please retry.")).finally(()=>{loading.current=false}); }, [load]);
  const meId=me?.id;
  useEffect(() => { safeLoad(); }, [safeLoad]);
  useEffect(() => { if (!meId) return; const client = createClient(); const channel = client.channel(`inbox:${workspaceId}:${meId}`).on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `workspace_id=eq.${workspaceId}` }, safeLoad).on("postgres_changes",{event:"*",schema:"public",table:"channel_messages",filter:`workspace_id=eq.${workspaceId}`},safeLoad).on("postgres_changes",{event:"*",schema:"public",table:"direct_message_receipts",filter:`workspace_id=eq.${workspaceId}`},safeLoad).on("postgres_changes",{event:"*",schema:"public",table:"channel_message_receipts",filter:`workspace_id=eq.${workspaceId}`},safeLoad).subscribe();const fallback=window.setInterval(safeLoad,15000);return () => {window.clearInterval(fallback);void client.removeChannel(channel); }; }, [meId, safeLoad, workspaceId]);

  useEffect(()=>{safeLoad()},[pathname,safeLoad]);
  useEffect(()=>{const changed=()=>safeLoad();window.addEventListener("converge:unread-chats",changed);return()=>window.removeEventListener("converge:unread-chats",changed)},[safeLoad]);
  useEffect(()=>{const changed=()=>safeLoad();window.addEventListener("converge:pinned-chats",changed);return()=>window.removeEventListener("converge:pinned-chats",changed)},[safeLoad]);
  useEffect(()=>{const changed=()=>safeLoad();window.addEventListener("converge:group-membership",changed);return()=>window.removeEventListener("converge:group-membership",changed)},[safeLoad]);
  const readPreference=(chat:Chat,setting:string)=>typeof window==="undefined"?"":localStorage.getItem(chat.group&&setting==="deleted"?`converge:group-deleted:${workspaceId}:${me?.id}:${chat.channelId}`:chat.group?`converge:group-${setting}:${workspaceId}:${me?.id}`:`converge:direct-${setting}:${workspaceId}:${me?.id}:${chat.id}`)||"";
  const visible=chats.filter(chat=>(chat.name+" "+chat.preview).toLowerCase().includes(query.toLowerCase())&&(filter!=="unread"||!!chat.unread)&&(filter!=="groups"||chat.group)&&(filter!=="favourites"||readPreference(chat,"favourite")==="1")&&(!filter.startsWith("list:")||readPreference(chat,"list")===filter.slice(5))&&(!readPreference(chat,"deleted")||chat.time>readPreference(chat,"deleted")));
  const customLists=[...new Set(chats.map(chat=>readPreference(chat,"list")).filter(Boolean))];
  const [preferenceRevision,setPreferenceRevision]=useState(0);
  useEffect(()=>{const changed=()=>{setPreferenceRevision(v=>v+1);safeLoad()};window.addEventListener("converge:chat-preferences",changed);return()=>window.removeEventListener("converge:chat-preferences",changed)},[safeLoad]);
  void preferenceRevision;
  const unreadChats=chats.filter(chat=>!!chat.unread).length;
  const chatHref=(chat:Chat)=>chat.group&&chat.channelId?`${base}/group?channel=${chat.channelId}`:`${base}/${chat.id}`;
  const selectedGroupChannel=searchParams.get("channel")||chats.find(chat=>chat.group)?.channelId;
  const isChatSelected=(chat:Chat)=>chat.group?active==="group"&&chat.channelId===selectedGroupChannel:active===chat.id;
  return <div className={`messagesShell ${active?"hasActiveChat":""}`}><WorkspaceThemeScope workspaceId={workspaceId} userId={me?.id}/>
    <aside className="messagesRail" aria-label="Workspace navigation">
      <Link className="railBrand" href={`/workspace/${workspaceId}`} title="Workspace home" aria-label="Workspace home"><svg viewBox="0 0 64 58" role="img" aria-label="Converge logo"><path d="M32 29C22 11 7 11 7 24c0 11 11 15 25 5"/><path d="M32 29C52 11 59 24 54 35c-4 9-16 6-22-6"/><path d="M32 29C29 53 14 52 13 39c0-11 11-14 19-10"/><circle cx="32" cy="29" r="4"/></svg></Link>
      <WorkspaceRailLinks workspaceId={workspaceId} active="messages" badge={unreadChats}/>
      <div className="railSpacer"/>
      {me&&<NotificationsBell userId={me.id} workspaceId={workspaceId}/>}
      <Link href="/dashboard" title="All workspaces" aria-label="All workspaces"><RailIcon name="grid"/></Link>
      <Link className="railAccount" href={`/profile?workspace=${workspaceId}`} title="Your profile" aria-label="Your profile">{me?.avatar_url?<img src={me.avatar_url} alt=""/>:<span>{initials(me?.full_name||"Me")}</span>}</Link>
    </aside>
    <aside className="messagesIndex" aria-label="Chats">
      <header><div><small>YOUR WORKSPACE</small><h1>Chats</h1></div><button className="newConversation" title="New chat" aria-label="New chat" onClick={()=>setOpen(true)}><RailIcon name="plus"/></button></header>
      <label className="inboxSearch"><RailIcon name="search"/><input type="search" data-no-emoji aria-label="Search chats" placeholder="Search your conversations" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className="inboxFilters">{[["all","All"],["unread","Unread"],["groups","Groups"],["favourites","Favourites"]].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}{value==="unread"&&unreadChats>0&&<span>{unreadChats}</span>}</button>)}</div>
      {customLists.length>0&&<select className="inboxListSelect" aria-label="Filter by chat list" value={filter.startsWith("list:")?filter:""} onChange={e=>setFilter(e.target.value||"all")}><option value="">Your lists</option>{customLists.map(name=><option value={"list:"+name} key={name}>{name}</option>)}</select>}
      {error&&<p className="inboxError" role="alert">{error}<button onClick={safeLoad}>Retry</button></p>}
      <div className="conversationList">
       {!ready&&!error&&<p className="inboxEmpty">Loading conversations…</p>}
       {ready&&!visible.length&&<p className="inboxEmpty">No {filter==="unread"?"unread ":""}conversations found.</p>}
       {visible.map(chat=><div key={chat.channelId||chat.id} className={`conversationRow ${isChatSelected(chat)?"isSelected":""}`} onClick={event=>{if(!(event.target as Element).closest("button,a"))router.push(chatHref(chat))}}>
        <button className="conversationAvatar" aria-label={`View ${chat.name} photo`} onClick={()=>setPhoto({src:chat.avatar,name:chat.name})}>{chat.avatar?<img src={chat.avatar} alt="" loading="lazy"/>:<i>{chat.group?<RailIcon name="users"/>:initials(chat.name)}</i>}</button>
        <Link href={chatHref(chat)} aria-current={isChatSelected(chat)?"page":undefined}><span className="conversationTop"><b>{chat.name}</b>{chat.time&&<time>{new Date(chat.time).toLocaleDateString()===new Date().toLocaleDateString()?new Date(chat.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):new Date(chat.time).toLocaleDateString([],{day:"numeric",month:"short"})}</time>}</span><span className="conversationBottom"><small>{chat.preview}</small>{!!chat.unread&&<b className="chatUnreadCount">{chat.unread>99?"99+":chat.unread}</b>}{(chat.mainGroup||pinnedChatKeys.includes(chatKey(chat)))&&<span title={chat.mainGroup?"Main workspace group":"Pinned chat"} aria-label={chat.mainGroup?"Main workspace group":"Pinned chat"}>⌖</span>}</span></Link>
       </div>)}
      </div>
    </aside>
    <section className="messagesDetail" aria-label={active?"Open conversation":"No conversation selected"}>{children}</section>
    {photo&&<PhotoPreview {...photo} onClose={()=>setPhoto(null)}/>}
    {open&&<div className="inboxModal" role="dialog" aria-modal="true" aria-label="Start a chat" onMouseDown={event=>event.target===event.currentTarget&&setOpen(false)}><section><header><div><small>WORKSPACE MEMBERS</small><h2>Start a conversation</h2></div><button aria-label="Close new chat" onClick={()=>setOpen(false)}>×</button></header>{members.length?members.map(member=><div className="newChatMember" key={member.id}><button className="conversationAvatar" aria-label={`View ${member.full_name||"member"} photo`} onClick={()=>setPhoto({src:member.avatar_url,name:member.full_name||"Member"})}>{member.avatar_url?<img src={member.avatar_url} alt=""/>:<i>{initials(member.full_name||"Member")}</i>}</button><span><b>{member.full_name||"Member"}{member.id===me?.id?" (You)":""}</b><small>{member.id===me?.id?"Message yourself":member.job_title||"Workspace member"}</small></span><button onClick={()=>{setOpen(false);router.push(base+"/"+member.id)}}>Chat</button></div>):<p>No workspace members yet.</p>}</section></div>}
  </div>;
}

function RailIcon({name}:{name:string}) {
 const paths:Record<string,ReactNode>={
  home:<><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
  chat:<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 0 1-1-5 9 9 0 0 1 18 0Z"/>,
  users:<><circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 5a3 3 0 0 1 0 6m2 3a6 6 0 0 1 3 7"/></>,
  grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  search:<><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
