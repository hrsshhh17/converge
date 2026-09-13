"use client";

import Link from "next/link";
import PhotoPreview from "./PhotoPreview";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import "./group-info-sheet.css";
import "./group-permissions.css";
import "./group-info-refine.css";

type Member={id:string;full_name:string|null;avatar_url:string|null;job_title:string|null;bio?:string|null;group_role:"admin"|"member"};
type WorkspacePerson=Omit<Member,"group_role">;
type SharedMessage={id:string;body:string;attachment_url:string|null;attachment_name:string|null;post_id:string|null;created_at:string;message_type:string};
type View="main"|"add"|"search"|"media"|"starred"|"notifications"|"permissions"|"admins"|"report"|"confirm-clear"|"confirm-exit";
type PermissionKey="members_edit_settings"|"members_send_messages"|"members_add_members"|"members_share_history"|"members_invite_link"|"admins_approve_members";
type Permissions=Record<PermissionKey,boolean>;
const defaultPermissions:Permissions={members_edit_settings:false,members_send_messages:true,members_add_members:true,members_share_history:true,members_invite_link:false,admins_approve_members:false};
type GroupIconName="users"|"edit"|"phone"|"video"|"add"|"search"|"media"|"star"|"bell"|"settings"|"clear"|"exit"|"report";
const GroupIcon=({name}:{name:GroupIconName})=><svg className="groupUiIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{{
  users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  edit:<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
  phone:<path d="M7 3H3v3c0 8.3 6.7 15 15 15h3v-4l-5-2-2 2a15 15 0 0 1-7-7l2-2Z"/>,
  video:<><rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-4v12l-6-4Z"/></>,
  add:<><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  media:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
  star:<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>,
  bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.36.38.7.6 1 .29.31.68.49 1.1.5h.1v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></>,
  clear:<><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></>,
  exit:<><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 4h6v16h-6"/></>,
  report:<><path d="M5 21V4"/><path d="M5 5h12l-2 4 2 4H5"/></>
}[name]}</svg>;

export default function GroupInfoSheet({workspaceId,channelId,meId,name,avatarUrl,isMainGroup,onClose,initialView="main"}:{workspaceId:string;channelId:string;meId:string;name:string;avatarUrl:string|null;isMainGroup:boolean;onClose:()=>void;initialView?:View}){
  const [members,setMembers]=useState<Member[]>([]);
  const [workspacePeople,setWorkspacePeople]=useState<WorkspacePerson[]>([]);
  const [messages,setMessages]=useState<SharedMessage[]>([]);
  const [view,setView]=useState<View>(initialView);
  const [query,setQuery]=useState("");
  const [selectedPeople,setSelectedPeople]=useState<Set<string>>(new Set());
  const [addingPeople,setAddingPeople]=useState(false);
  const [status,setStatus]=useState("");
  const [reportReason,setReportReason]=useState("");
  const [muted,setMuted]=useState(false);
  const [starred,setStarred]=useState<Set<string>>(new Set());
  const [permissions,setPermissions]=useState<Permissions>(defaultPermissions);
  const [groupName,setGroupName]=useState(name);
  const [groupAvatar,setGroupAvatar]=useState<string|null>(avatarUrl);
  const [editingName,setEditingName]=useState(false);
  const [draftName,setDraftName]=useState(name);
  const [photoOpen,setPhotoOpen]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [description,setDescription]=useState("Every workspace member joins automatically.");
  const [editingDescription,setEditingDescription]=useState(false);
  const [draftDescription,setDraftDescription]=useState("");
  const starKey=`converge:group-stars:${workspaceId}:${meId}`;
  const muteKey=`converge:group-muted:${workspaceId}:${meId}`;

  const load=useCallback(async()=>{
    const client=createClient();
    const [{data:rows},{data:chatRows},{data:roleRows},{data:permissionRow},{data:workspace},{data:channelInfo}]=await Promise.all([
      client.from("workspace_members").select("user_id").eq("workspace_id",workspaceId),
      client.from("channel_messages").select("id,body,attachment_url,attachment_name,post_id,created_at,message_type").eq("channel_id",channelId).order("created_at",{ascending:false}),
      client.from("channel_members").select("user_id,role,left_at").eq("channel_id",channelId),
      client.from("channel_permissions").select("members_edit_settings,members_send_messages,members_add_members,members_share_history,members_invite_link,admins_approve_members").eq("channel_id",channelId).maybeSingle(),
      client.from("workspaces").select("owner_id").eq("id",workspaceId).single(),
      client.from("channels").select("name,avatar_url,description").eq("id",channelId).single()
    ]);
    const workspaceIds=(rows||[]).map(row=>row.user_id);
    let allPeople:WorkspacePerson[]=[];
    if(workspaceIds.length){const rich=await client.from("workspace_profiles").select("id,full_name,avatar_url,job_title,bio").eq("workspace_id",workspaceId).in("id",workspaceIds);allPeople=(rich.data||[])as WorkspacePerson[];if(rich.error){const basic=await client.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id",workspaceId).in("id",workspaceIds);allPeople=(basic.data||[]).map(person=>({...person,bio:null}))}}
    allPeople.sort((a,b)=>(a.full_name||"").localeCompare(b.full_name||""));
    setWorkspacePeople(allPeople);
    const activeRoles=(roleRows||[]).filter(row=>!row.left_at);
    const activeIds=new Set((isMainGroup?rows||[]:activeRoles).map(row=>row.user_id));
    const roles=new Map(activeRoles.map(row=>[row.user_id,row.role as "admin"|"member"]));
    const nextMembers=allPeople.filter(person=>activeIds.has(person.id)).map(person=>({...person,group_role:roles.get(person.id)||(person.id===workspace?.owner_id?"admin":"member")}))as Member[];
    nextMembers.sort((a,b)=>a.group_role===b.group_role?(a.full_name||"").localeCompare(b.full_name||""):a.group_role==="admin"?-1:1);
    setMembers(nextMembers);
    setMessages((chatRows||[])as SharedMessage[]);
    if(permissionRow)setPermissions(permissionRow as Permissions);
    if(channelInfo){setGroupName(channelInfo.name);setDraftName(channelInfo.name);setGroupAvatar(channelInfo.avatar_url||null);setDescription(channelInfo.description||"")}
  },[channelId,isMainGroup,workspaceId]);

  // Initial remote and device preferences must be synchronised when this sheet opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();const frame=requestAnimationFrame(()=>{setMuted(localStorage.getItem(muteKey)==="1");setStarred(new Set<string>(JSON.parse(localStorage.getItem(starKey)||"[]")))});return()=>cancelAnimationFrame(frame)},[load,muteKey,starKey]);

  const addSelectedPeople=async()=>{if(!selectedPeople.size||addingPeople)return;setAddingPeople(true);setStatus("Adding members…");const {data,error}=await createClient().rpc("add_channel_members",{target_channel_id:channelId,target_user_ids:[...selectedPeople]});setAddingPeople(false);if(error){setStatus(error.message);return}setSelectedPeople(new Set());setStatus(`${Number(data)||0} ${Number(data)===1?"member":"members"} added.`);await load();window.dispatchEvent(new CustomEvent("converge:group-membership"))};
  const toggleMute=()=>{const next=!muted;setMuted(next);localStorage.setItem(muteKey,next?"1":"0");setStatus(next?"Group notifications muted.":"Group notifications enabled.")};
  const clearChat=()=>{setStatus("");setView("confirm-clear")};
  const performClearChat=()=>{localStorage.setItem(`converge:group-clear:${workspaceId}:${meId}:${channelId}`,new Date().toISOString());window.dispatchEvent(new CustomEvent("converge:group-chat-cleared",{detail:{workspaceId,channelId}}));setStatus("Chat cleared on this device.");setView("main")};
  const exitGroup=()=>{setStatus("");setView("confirm-exit")};
  const performExitGroup=async()=>{const client=createClient();if(!isMainGroup){const {error}=await client.rpc("leave_channel",{target_channel_id:channelId});if(error){setStatus(error.message);return}window.dispatchEvent(new CustomEvent("converge:group-membership"));onClose();return}const {data:workspace}=await client.from("workspaces").select("owner_id").eq("id",workspaceId).single();if(workspace?.owner_id===meId){setStatus("Workspace owner cannot leave. Transfer ownership first.");return}const {error}=await client.from("workspace_members").delete().eq("workspace_id",workspaceId).eq("user_id",meId);if(error){setStatus(error.message);return}location.assign("/dashboard")};
  const reportGroup=()=>{setReportReason("");setStatus("");setView("report")};
  const submitReport=()=>{const reason=reportReason.trim();if(!reason){setStatus("Please tell us what went wrong.");return}const reports=JSON.parse(localStorage.getItem("converge:group-reports")||"[]") as unknown[];reports.push({workspaceId,channelId,reason,reportedBy:meId,createdAt:new Date().toISOString()});localStorage.setItem("converge:group-reports",JSON.stringify(reports));setStatus("Report recorded. Thank you.");setReportReason("")};
  const myRole=members.find(member=>member.id===meId)?.group_role||"member";
  const isParticipant=isMainGroup||members.some(member=>member.id===meId);
  const isAdmin=myRole==="admin";
  const canEditSettings=isParticipant&&(isAdmin||permissions.members_edit_settings);
  const updatePermission=async(key:PermissionKey)=>{if(!isAdmin)return;const enabled=!permissions[key];setPermissions(current=>({...current,[key]:enabled}));const {error}=await createClient().rpc("update_channel_permission",{target_channel_id:channelId,permission_name:key,enabled});if(error){setPermissions(current=>({...current,[key]:!enabled}));setStatus(`${error.message}. Run group-permissions-migration.sql if needed.`);return}window.dispatchEvent(new CustomEvent("converge:group-permissions"))};
  const changeRole=async(member:Member)=>{if(!isAdmin||member.id===meId)return;const nextRole=member.group_role==="admin"?"member":"admin";const {error}=await createClient().rpc("set_channel_member_role",{target_channel_id:channelId,target_user_id:member.id,next_role:nextRole});if(error){setStatus(`${error.message}. Run group-permissions-migration.sql if needed.`);return}setMembers(current=>current.map(item=>item.id===member.id?{...item,group_role:nextRole}:item))};
  const saveName=async()=>{const next=draftName.trim();if(next.length<2)return;const {error}=await createClient().rpc("rename_channel",{target_channel_id:channelId,next_name:next});if(error){setStatus(`${error.message}. Run group-permissions-migration.sql if needed.`);return}setGroupName(next);setEditingName(false);window.dispatchEvent(new CustomEvent("converge:group-details"))};
  const uploadPhoto=async(file?:File)=>{if(!file||!canEditSettings)return;if(!file.type.startsWith("image/")||file.size>3*1024*1024){setStatus("Choose a JPG, PNG or WEBP image below 3 MB.");return}setUploading(true);const client=createClient();const ext=file.name.split(".").pop()||"jpg";const path=`${meId}/${workspaceId}/groups/${channelId}.${ext}`;const {error:uploadError}=await client.storage.from("workspace-media").upload(path,file,{upsert:true,contentType:file.type});if(uploadError){setStatus(uploadError.message);setUploading(false);return}const publicUrl=`${client.storage.from("workspace-media").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;const {error}=await client.rpc("set_channel_avatar",{target_channel_id:channelId,next_avatar_url:publicUrl});setUploading(false);if(error){setStatus(`${error.message}. Run group-permissions-migration.sql if needed.`);return}setGroupAvatar(publicUrl);setPhotoOpen(false);window.dispatchEvent(new CustomEvent("converge:group-details"))};
  const removePhoto=async()=>{if(!canEditSettings)return;const {error}=await createClient().rpc("set_channel_avatar",{target_channel_id:channelId,next_avatar_url:null});if(error){setStatus(`${error.message}. Run group-permissions-migration.sql if needed.`);return}setGroupAvatar(null);setPhotoOpen(false);window.dispatchEvent(new CustomEvent("converge:group-details"))};
  const saveDescription=async()=>{const next=draftDescription.trim();const {error}=await createClient().rpc("update_channel_description",{target_channel_id:channelId,next_description:next});if(error){setStatus(`${error.message}. Run group-permissions-migration.sql if needed.`);return}setDescription(next);setEditingDescription(false)};
  const filteredMembers=members.filter(member=>(member.full_name||"Member").toLowerCase().includes(query.toLowerCase()));
  const searchableMessages=messages.filter(message=>message.message_type!=="system");
  const filteredMessages=searchableMessages.filter(message=>`${message.body} ${message.attachment_name||""}`.toLowerCase().includes(query.toLowerCase()));
  const media=messages.filter(message=>message.attachment_url||message.post_id);
  const back=()=>initialView!=="main"&&view===initialView?onClose():setView("main");
  const panel=(title:string,content:ReactNode)=><><header><button onClick={back}>←</button><b>{title}</b></header><section className="groupSubpanel">{content}</section></>;

  const availablePeople=workspacePeople.filter(person=>!members.some(member=>member.id===person.id));
  if(view==="add")return <aside className="groupInfoSheet">{panel("Add members",<>{isMainGroup?<p>Every workspace member is already included in this main group.</p>:!isParticipant?<p>You are no longer a participant in this group.</p>:<><p>Select existing workspace members to add directly to {groupName}.</p><div className="groupMemberPicker">{availablePeople.length?availablePeople.map(person=><button type="button" className={selectedPeople.has(person.id)?"selected":""} key={person.id} onClick={()=>setSelectedPeople(current=>{const next=new Set(current);if(next.has(person.id))next.delete(person.id);else next.add(person.id);return next})}>{person.avatar_url?<img src={person.avatar_url} alt=""/>:<i>{(person.full_name||"M")[0]}</i>}<span><b>{person.full_name||"Member"}</b><small>{person.job_title||"Workspace member"}</small></span><em>{selectedPeople.has(person.id)?"✓":"＋"}</em></button>):<p>All workspace members are already in this group.</p>}</div>{availablePeople.length>0&&<button className="groupPrimary" disabled={!selectedPeople.size||addingPeople} onClick={()=>void addSelectedPeople()}>{addingPeople?"Adding…":`Add ${selectedPeople.size||"selected"}`}</button>}</>}{status&&<p className="groupStatus">{status}</p>}</>)}</aside>;
  if(view==="search")return <aside className="groupInfoSheet">{panel("Search group",<><input className="groupSearch" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search members and messages"/><b className="groupLabel">MEMBERS</b>{filteredMembers.map(member=><Link className="groupResult" key={member.id} href={`/profile/${member.id}?workspace=${workspaceId}`}>{member.avatar_url?<img src={member.avatar_url} alt=""/>:<i>{(member.full_name||"M")[0]}</i>}<span>{member.full_name||"Member"}</span></Link>)}<b className="groupLabel">MESSAGES</b>{filteredMessages.map(message=><button className="messageResult" key={message.id} onClick={()=>{onClose();setTimeout(()=>document.querySelector(`[data-message-id="${message.id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}),80)}}>{message.body||message.attachment_name||"Shared item"}<small>{new Date(message.created_at).toLocaleString()}</small></button>)}</>)}</aside>;
  if(view==="media")return <aside className="groupInfoSheet">{panel("Media, links and docs",media.length?<div className="sharedGrid">{media.map(message=>message.attachment_url?<a key={message.id} href={message.attachment_url} target="_blank" rel="noreferrer">{message.attachment_name?.match(/\.(png|jpe?g|gif|webp)$/i)?<img src={message.attachment_url} alt=""/>:<i>▣</i>}<span>{message.attachment_name||"Open media"}</span></a>:<Link key={message.id} href={`/workspace/${workspaceId}#post-${message.post_id}`}><i>↗</i><span>Shared post</span></Link>)}</div>:<p>No shared media, links or documents yet.</p>)}</aside>;
  if(view==="starred")return <aside className="groupInfoSheet">{panel("Starred messages",messages.filter(message=>starred.has(message.id)).length?<div className="starredList">{messages.filter(message=>starred.has(message.id)).map(message=><button key={message.id} onClick={()=>{onClose();setTimeout(()=>document.querySelector(`[data-message-id="${message.id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}),80)}}>☆ {message.body||message.attachment_name||"Shared item"}<small>{new Date(message.created_at).toLocaleString()}</small></button>)}</div>:<p>No starred messages yet. Use the star beside a group message to save it here.</p>)}</aside>;
  if(view==="notifications")return <aside className="groupInfoSheet">{panel("Notification settings",<><button className="notificationChoice" onClick={toggleMute}><span><b>{muted?"Notifications are muted":"Notifications are on"}</b><small>{muted?"Tap to receive group updates again.":"Tap to mute group updates on this device."}</small></span><i>{muted?"Off":"On"}</i></button>{status&&<p className="groupStatus">{status}</p>}</>)}</aside>;
  if(view==="confirm-clear")return <aside className="groupInfoSheet">{panel("Clear chat",<div className="groupConfirm"><GroupIcon name="clear"/><h3>Clear this chat?</h3><p>Messages will only be hidden for you on this device. Other members will still see them.</p><div><button onClick={()=>setView("main")}>Cancel</button><button className="dangerAction" onClick={performClearChat}>Clear chat</button></div></div>)}</aside>;
  if(view==="confirm-exit")return <aside className="groupInfoSheet">{panel(isMainGroup?"Leave workspace":"Exit group",<div className="groupConfirm"><GroupIcon name="exit"/><h3>{isMainGroup?`Leave ${groupName} workspace?`:`Exit ${groupName}?`}</h3><p>{isMainGroup?"You will leave this workspace and lose access to its conversations, files and events.":"You will leave only this group. Your workspace membership and all other groups will stay unchanged."}</p>{status&&<p className="groupStatus">{status}</p>}<div><button onClick={()=>setView("main")}>Cancel</button><button className="dangerAction" onClick={()=>void performExitGroup()}>{isMainGroup?"Leave workspace":"Exit group"}</button></div></div>)}</aside>;
  if(view==="report")return <aside className="groupInfoSheet">{panel("Report group",<div className="groupReportForm"><div><GroupIcon name="report"/><span><b>Tell us what happened</b><small>Your report is private and will not be shown to other group members.</small></span></div><label htmlFor="group-report-reason">Reason</label><textarea id="group-report-reason" autoFocus maxLength={500} value={reportReason} onChange={event=>setReportReason(event.target.value)} placeholder="Describe the problem with this group…"/><small>{reportReason.length}/500</small><div className="groupReportActions"><button onClick={()=>setView("main")}>Cancel</button><button className="groupPrimary" onClick={submitReport} disabled={!reportReason.trim()}>Submit report</button></div>{status&&<p className="groupStatus">{status}</p>}</div>)}</aside>;
  const permissionRows:[PermissionKey,string,string][]=[
    ["members_edit_settings","Edit group settings","Name, icon, description and message settings"],
    ["members_send_messages","Send new messages","Allow members to send messages"],
    ["members_add_members","Add other members","Allow members to add people"],
    ["members_share_history","Send message history","New members can see earlier messages"],
    ["members_invite_link","Invite via link","Allow members to create invite links"],
    ["admins_approve_members","Approve new members","Admins must approve new members"]
  ];
  if(view==="permissions")return <aside className="groupInfoSheet">{panel("Group permissions",<><p className="permissionIntro">Members can:</p><div className="permissionList">{permissionRows.slice(0,5).map(([key,label,help])=><button key={key} disabled={!isAdmin} onClick={()=>updatePermission(key)}><span><b>{label}</b><small>{help}</small></span><i className={permissions[key]?"on":""}>{permissions[key]?"●":"○"}</i></button>)}</div><p className="permissionIntro">Admins can:</p><div className="permissionList">{permissionRows.slice(5).map(([key,label,help])=><button key={key} disabled={!isAdmin} onClick={()=>updatePermission(key)}><span><b>{label}</b><small>{help}</small></span><i className={permissions[key]?"on":""}>{permissions[key]?"●":"○"}</i></button>)}</div><button className="editAdmins" onClick={()=>setView("admins")}>♙ <span><b>Edit group admins</b><small>{members.filter(member=>member.group_role==="admin").length} admins</small></span>›</button>{!isAdmin&&<p>Only a group admin can change these permissions.</p>}{status&&<p className="groupStatus">{status}</p>}</>)}</aside>;
  if(view==="admins")return <aside className="groupInfoSheet">{panel("Edit group admins",<><p>Group admins can manage permissions and promote or dismiss other admins.</p><div className="adminList">{members.map(member=><article key={member.id}>{member.avatar_url?<img src={member.avatar_url} alt=""/>:<i>{(member.full_name||"M")[0]}</i>}<span><b>{member.full_name||"Member"}{member.id===meId?" (You)":""}</b><small>{member.group_role==="admin"?"Group admin":"Member"}</small></span>{isAdmin&&member.id!==meId&&<button onClick={()=>changeRole(member)}>{member.group_role==="admin"?"Dismiss admin":"Make admin"}</button>}</article>)}</div>{status&&<p className="groupStatus">{status}</p>}</>)}</aside>;

  return <aside className="groupInfoSheet"><header><button onClick={onClose}>×</button><b>Group info</b></header><section className="groupHero"><button className="groupAvatarButton" onClick={()=>setPhotoOpen(true)}>{groupAvatar?<img src={groupAvatar} alt={groupName}/>:<i><GroupIcon name="users"/></i>}</button><div className="groupNameRow">{editingName?<><input autoFocus value={draftName} maxLength={60} onChange={event=>setDraftName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void saveName();if(event.key==="Escape")setEditingName(false)}}/><button onClick={saveName}>✓</button><button onClick={()=>setEditingName(false)}>×</button></>:<><h2>{groupName}</h2>{canEditSettings&&<button aria-label="Edit group name" onClick={()=>{setDraftName(groupName);setEditingName(true)}}><GroupIcon name="edit"/></button>}</>}</div><p>Workspace group · <strong>{members.length} members</strong></p><div>{isParticipant&&(isAdmin||permissions.members_send_messages)&&<><button data-group-call="voice"><GroupIcon name="phone"/><small>Voice</small></button><button data-group-call="video"><GroupIcon name="video"/><small>Video</small></button></>}<button onClick={()=>setView("add")} disabled={!isParticipant||(!isAdmin&&!permissions.members_add_members)}><GroupIcon name="add"/><small>Add</small></button><button onClick={()=>setView("search")}><GroupIcon name="search"/><small>Search</small></button></div></section><section className="groupAbout"><div><b>ABOUT THIS GROUP</b>{canEditSettings&&<button aria-label="Edit group description" onClick={()=>{setDraftDescription(description);setEditingDescription(true)}}><GroupIcon name="edit"/></button>}</div>{editingDescription?<div className="descriptionEditor"><textarea autoFocus value={draftDescription} maxLength={500} onChange={event=>setDraftDescription(event.target.value)}/><button onClick={saveDescription}>Save</button><button onClick={()=>setEditingDescription(false)}>Cancel</button></div>:<p>{description||"No group description"}</p>}</section><section className="groupActions"><button onClick={()=>setView("media")}><GroupIcon name="media"/><span>Media, links and docs<small>{media.length} shared items</small></span>›</button><button onClick={()=>setView("starred")}><GroupIcon name="star"/><span>Starred messages</span>›</button><button onClick={()=>setView("notifications")}><GroupIcon name="bell"/><span>Notification settings<small>{muted?"Muted":"On"}</small></span>›</button><button onClick={()=>setView("permissions")}><GroupIcon name="settings"/><span>Group permissions<small>{isAdmin?"Manage member access":"View member access"}</small></span>›</button></section><section className="groupMembers"><b>MEMBERS · {members.length}</b>{members.map(member=><Link key={member.id} href={`/profile/${member.id}?workspace=${workspaceId}`}>{member.avatar_url?<img src={member.avatar_url} alt=""/>:<i>{(member.full_name||"M")[0]}</i>}<span><strong>{member.full_name||"Member"}{member.id===meId?" (You)":""}</strong><small>{member.bio?.trim()||"No bio added yet"}</small></span>{member.group_role==="admin"&&<em>Admin</em>}</Link>)}</section><section className="groupDanger"><button onClick={clearChat}><GroupIcon name="clear"/><span>Clear chat</span></button>{isParticipant&&<button onClick={exitGroup}><GroupIcon name="exit"/><span>{isMainGroup?"Leave workspace":"Exit group"}</span></button>}<button onClick={reportGroup}><GroupIcon name="report"/><span>Report group</span></button>{status&&<p className="groupStatus">{status}</p>}</section>{photoOpen&&<PhotoPreview src={groupAvatar} name={groupName} onClose={()=>setPhotoOpen(false)} actions={canEditSettings?<><label>{uploading?"Uploading…":"Change group picture"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void uploadPhoto(event.target.files?.[0])}/></label>{groupAvatar&&<button onClick={removePhoto}>Delete group picture</button>}</>:undefined}/>} </aside>;
}
