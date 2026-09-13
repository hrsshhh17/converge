"use client";

import Link from "next/link";
import {FormEvent,ReactNode,useEffect,useRef,useState} from "react";
import {createClient} from "../../lib/supabase/client";

type Source={id:string;kind:"Message"|"Post"|"Person"|"File"|"Group"|"Account"|"Workspace"|"Event";title:string;excerpt:string;href:string;createdAt:string;score:number;imageUrl?:string;citation?:number};
type PendingAction={type:"send_main_group_message"|"send_direct_message";message:string;recipientName?:string;status?:"sent"|"cancelled";error?:string};
type Turn={id:string;role:"user"|"assistant";text:string;sources?:Source[];attachmentName?:string;action?:PendingAction};
type Conversation={id:string;title:string;createdAt:string;updatedAt:string;turns:Turn[]};
type ConversationStore={activeId:string;conversations:Conversation[]};
const cleanStoredTurn=(turn:Turn)=>{if(turn.role!=="assistant"||!turn.sources?.length)return turn;const cited=new Set([...turn.text.matchAll(/\[(\d+)\]/g)].map(match=>Number(match[1])));return{...turn,sources:cited.size?turn.sources.filter((source,index)=>cited.has(source.citation||index+1)):[]}};

const stopWords=new Set(["a","an","and","are","about","did","do","does","for","from","hai","hain","i","in","is","it","ka","ke","ki","kis","ko","maine","me","mein","mera","meri","my","of","on","or","that","the","this","thi","tha","to","what","who","with","ye","your"]);
const terms=(value:string)=>[...new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[])].filter(word=>word.length>1&&!stopWords.has(word));
const excerpt=(value:string)=>value.replace(/\s+/g," ").trim().slice(0,260)||"Shared without a caption";
const recentIntent=(value:string)=>/\b(recent|recently|latest|today|miss|missed|update|updates|new|kal|aaj)\b/i.test(value);
const memberIntent=(value:string)=>/\b(member|members|membership|count|kitne|kitni|sadasya|log|people)\b/i.test(value);
const accountDateIntent=(value:string)=>/\b(id|account|profile)\b/i.test(value)&&/\b(ban|bana|bani|banai|bnai|create|created|join|joined|date|din|kab|when|wh+en)\b/i.test(value);
const workspaceIntent=(value:string)=>/\bworkspace\b.*\b(ban|bani|banai|create|created|date|din|kab|when)\b|\b(kab|when)\b.*\bworkspace\b/i.test(value);
const fileIntent=(value:string)=>/\b(file|files|document|documents|doc|docs|media|image|video|link|links)\b/i.test(value);
const messageIntent=(value:string)=>/\b(message|messages|chat|chats|dm|dms|said|bola|likha)\b/i.test(value);
const identityIntent=(value:string)=>/\b(my name|who am i|mera naam|meri identity|current user|profile name)\b/i.test(value);
const localNavigationIntent=(value:string)=>{
 const asksToMove=/\b(open|go|goto|navigate|take me|show me|khol|kholo|kholna|jao|jana|le chalo|dikhao|dikha do)\b/i.test(value);
 if(!asksToMove)return "";
 const destinations:[string,RegExp][]=[["messages",/\b(messages?|chats?|dm)\b/i],["groups",/\bgroups?\b/i],["files",/\b(files?|documents?|docs?)\b/i],["calendar",/\b(calendar|events?)\b/i],["meeting",/\b(meeting|screen share)\b/i],["profile",/\b(profile|account)\b/i],["ai",/\b(converge ai|assistant|ai page)\b/i],["home",/\b(home|main page|workspace page|feed)\b/i]];
 return destinations.find(([,pattern])=>pattern.test(value))?.[0]||"";
};
const localMessageIntent=(value:string):PendingAction|undefined=>{
 const english=value.match(/\b(?:send|write)\s+(?:a\s+)?(?:message|dm)\s+to\s+([\p{L}][\p{L}\s.'-]{0,70}?)(?:\s+(?:saying|that|with(?:\s+text)?)\s+|\s*[:,-]\s*)(.+)$/iu);
 if(english?.[1]&&english[2])return{type:"send_direct_message",recipientName:english[1].trim(),message:english[2].trim()};
 const hindi=value.match(/^([\p{L}][\p{L}\s.'-]{0,70}?)\s+ko\s+(?:message|dm)\s+(?:bhejo|bhej do|send karo|send krdo)(?:\s+ki)?\s+(.+)$/iu);
 if(hindi?.[1]&&hindi[2])return{type:"send_direct_message",recipientName:hindi[1].trim(),message:hindi[2].trim()};
 const main=value.match(/\b(?:main|all members?|workspace)\s+(?:group\s+)?(?:me|mein|par|group)?\s*(?:message|msg)\s+(?:bhejo|bhej do|send karo|send|post)(?:\s+ki|\s+that|\s*[:,-])?\s+(.+)$/iu);
 return main?.[1]?{type:"send_main_group_message",message:main[1].trim()}:undefined;
};
const richInline=(value:string):ReactNode[]=>value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part,index)=>part.startsWith("**")&&part.endsWith("**")?<strong key={index}>{part.slice(2,-2)}</strong>:part.startsWith("`")&&part.endsWith("`")?<code key={index}>{part.slice(1,-1)}</code>:part);
function AIAnswerText({text}:{text:string}){const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);return <div className="aiAnswerText">{lines.map((line,index)=>/^[-*]\s+/.test(line)?<div className="aiAnswerBullet" key={index}><i/><p>{richInline(line.replace(/^[-*]\s+/,""))}</p></div>:<p key={index}>{richInline(line.replace(/^#{1,4}\s+/,""))}</p>)}</div>}

async function collectWorkspaceSources(workspaceId:string,meId:string,myName:string,question:string,accountCreatedAt:string){
 const client=createClient();
 const [{data:workspace},{data:workspaceMembers},{data:channels},{data:memberships},{data:profiles},{data:posts},{data:events}]=await Promise.all([
  client.from("workspaces").select("id,name,personality,privacy,created_at,owner_id").eq("id",workspaceId).single(),
  client.from("workspace_members").select("user_id,role,joined_at").eq("workspace_id",workspaceId),
  client.from("channels").select("id,name,is_workspace_group,avatar_url,created_at").eq("workspace_id",workspaceId).eq("kind","group"),
  client.from("channel_members").select("channel_id").eq("user_id",meId),
  client.from("workspace_profiles").select("id,full_name,bio,job_title,avatar_url").eq("workspace_id",workspaceId),
  client.from("posts").select("id,body,attachment_name,attachment_url,post_type,author_id,created_at").eq("workspace_id",workspaceId).is("archived_at",null).order("created_at",{ascending:false}).limit(240),
  client.from("workspace_events").select("id,title,starts_at,visibility,creator_id").eq("workspace_id",workspaceId).order("starts_at",{ascending:false}).limit(100)
 ]);
 const joined=new Set((memberships||[]).map(row=>row.channel_id));
 const allowed=(channels||[]).filter(row=>row.is_workspace_group||joined.has(row.id));
 const allowedIds=allowed.map(row=>row.id);
 const postIds=(posts||[]).map(post=>post.id);
 const [{data:channelMembers},{data:groupRows},{data:directRows},{data:comments}]=await Promise.all([
  allowedIds.length?client.from("channel_members").select("channel_id,user_id").in("channel_id",allowedIds):Promise.resolve({data:[]}),
  allowedIds.length?client.from("channel_messages").select("id,channel_id,sender_id,body,message_type,attachment_name,created_at").in("channel_id",allowedIds).neq("message_type","system").order("created_at",{ascending:false}).limit(240):Promise.resolve({data:[]}),
  client.from("direct_messages").select("id,sender_id,recipient_id,body,message_type,attachment_name,created_at").eq("workspace_id",workspaceId).or(`sender_id.eq.${meId},recipient_id.eq.${meId}`).order("created_at",{ascending:false}).limit(240),
  postIds.length?client.from("post_comments").select("id,post_id,author_id,body,created_at").in("post_id",postIds).order("created_at",{ascending:false}).limit(240):Promise.resolve({data:[]})
 ]);
 const people=new Map((profiles||[]).map(person=>[person.id,person]));
 const groupNames=new Map(allowed.map(channel=>[channel.id,channel.name||"Group"]));
 const words=terms(question),wantsRecent=recentIntent(question),wantsMembers=memberIntent(question),wantsAccountDate=accountDateIntent(question),wantsIdentity=identityIntent(question),wantsWorkspaceDate=workspaceIntent(question),wantsFiles=fileIntent(question),wantsMessages=messageIntent(question);
 const score=(value:string,date:string)=>{const hay=new Set(terms(value));const matches=words.reduce((total,word)=>total+(hay.has(word)?3:0),0);const age=Math.max(0,(Date.now()-new Date(date).getTime())/86400000);return matches+(wantsRecent?Math.max(0,4-age/7):0)};
 const candidates:Source[]=[];
 const myProfile=people.get(meId),myMembership=(workspaceMembers||[]).find(member=>member.user_id===meId),now=new Date().toISOString(),postById=new Map((posts||[]).map(post=>[post.id,post]));
 candidates.push({id:`account-${meId}`,kind:"Account",title:`${myProfile?.full_name||myName} account`,excerpt:`The current signed-in member is ${myProfile?.full_name||myName}. Workspace role: ${myMembership?.role||"member"}. Account created on ${new Date(accountCreatedAt).toLocaleString()}${myMembership?.joined_at?`; joined this workspace on ${new Date(myMembership.joined_at).toLocaleString()}`:""}.`,href:`/profile?workspace=${workspaceId}`,createdAt:accountCreatedAt,score:(wantsAccountDate||wantsIdentity)?100:score(`${myProfile?.full_name||myName} current signed in user name account profile ID created joined`,accountCreatedAt),imageUrl:myProfile?.avatar_url||undefined});
 if(workspace)candidates.push({id:`workspace-${workspace.id}`,kind:"Workspace",title:workspace.name||"Workspace",excerpt:`${workspace.name} is a ${workspace.personality||"team"} workspace with ${workspace.privacy||"workspace"} privacy. It was created on ${new Date(workspace.created_at).toLocaleString()} and currently has ${(workspaceMembers||[]).length} members.`,href:`/workspace/${workspaceId}`,createdAt:workspace.created_at,score:(wantsWorkspaceDate||wantsMembers)?90:score(`${workspace.name||""} ${workspace.personality||""} ${workspace.privacy||""} workspace created members`,workspace.created_at),imageUrl:allowed.find(channel=>channel.is_workspace_group)?.avatar_url||undefined});
 for(const channel of allowed){const count=channel.is_workspace_group?(workspaceMembers||[]).length:(channelMembers||[]).filter(member=>member.channel_id===channel.id).length;candidates.push({id:`group-meta-${channel.id}`,kind:"Group",title:channel.name||"Group",excerpt:`${count} ${count===1?"member":"members"} in this group${channel.is_workspace_group?". This is the main workspace group.":"."}`,href:`/workspace/${workspaceId}/messages/group?channel=${channel.id}`,createdAt:channel.created_at||"",score:wantsMembers?(channel.is_workspace_group?98:88):score(`${channel.name||""} group members count`,channel.created_at||now),imageUrl:channel.avatar_url||undefined})}
 for(const row of posts||[]){const authorProfile=people.get(row.author_id),author=authorProfile?.full_name||"Member",value=`${row.body||""} ${row.attachment_name||""} ${author}`;candidates.push({id:`post-${row.id}`,kind:row.attachment_name?"File":"Post",title:row.attachment_name||`Post by ${author}`,excerpt:excerpt(row.body||row.attachment_name||"Post"),href:`/workspace/${workspaceId}#post-${row.id}`,createdAt:row.created_at,score:score(value,row.created_at),imageUrl:authorProfile?.avatar_url||undefined})}
 for(const row of groupRows||[]){if(row.body==="This message was deleted")continue;const senderProfile=people.get(row.sender_id),sender=senderProfile?.full_name||"Member",groupName=groupNames.get(row.channel_id)||"Group",label=row.message_type==="voice"?"Voice message":row.attachment_name||row.body||"Message",kind:Source["kind"]=row.message_type==="file"||row.message_type==="media"?"File":"Message";candidates.push({id:`group-${row.id}`,kind,title:`${sender} in ${groupName}`,excerpt:excerpt(label),href:`/workspace/${workspaceId}/messages/group?channel=${row.channel_id}`,createdAt:row.created_at,score:score(`${label} ${sender} ${groupName}`,row.created_at),imageUrl:senderProfile?.avatar_url||undefined})}
 for(const row of directRows||[]){if(row.body==="This message was deleted")continue;const other=row.sender_id===meId?row.recipient_id:row.sender_id,senderProfile=people.get(row.sender_id),sender=senderProfile?.full_name||"Member",label=row.message_type==="voice"?"Voice message":row.attachment_name||row.body||"Message",kind:Source["kind"]=row.message_type==="file"||row.message_type==="media"?"File":"Message";candidates.push({id:`direct-${row.id}`,kind,title:`${sender} · Direct message`,excerpt:excerpt(label),href:`/workspace/${workspaceId}/messages/${other}`,createdAt:row.created_at,score:score(`${label} ${sender} ${people.get(other)?.full_name||""}`,row.created_at),imageUrl:senderProfile?.avatar_url||undefined})}
 for(const row of comments||[]){const authorProfile=people.get(row.author_id),post=postById.get(row.post_id);candidates.push({id:`comment-${row.id}`,kind:"Post",title:`Comment by ${authorProfile?.full_name||"Member"}`,excerpt:excerpt(`${row.body} · On post: ${post?.body||post?.attachment_name||"Post"}`),href:`/workspace/${workspaceId}#post-${row.post_id}`,createdAt:row.created_at,score:score(`${row.body} ${post?.body||""} ${authorProfile?.full_name||""}`,row.created_at),imageUrl:authorProfile?.avatar_url||undefined})}
 for(const row of events||[]){const creator=people.get(row.creator_id);candidates.push({id:`event-${row.id}`,kind:"Event",title:row.title||"Workspace event",excerpt:`Starts ${new Date(row.starts_at).toLocaleString()}. Visibility: ${row.visibility||"workspace"}. Created by ${creator?.full_name||"Member"}.`,href:`/workspace/${workspaceId}?view=calendar`,createdAt:row.starts_at,score:score(`${row.title||""} event calendar meeting ${creator?.full_name||""}`,row.starts_at),imageUrl:creator?.avatar_url||undefined})}
 for(const person of profiles||[]){const value=`${person.full_name||""} ${person.job_title||""} ${person.bio||""}`;candidates.push({id:`person-${person.id}`,kind:"Person",title:person.full_name||"Member",excerpt:excerpt([person.job_title,person.bio].filter(Boolean).join(" · ")||"Workspace member"),href:`/profile/${person.id}?workspace=${workspaceId}`,createdAt:"",score:score(value,now),imageUrl:person.avatar_url||undefined})}
 const byRelevance=(a:Source,b:Source)=>b.score-a.score||(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0);
 const matches=candidates.filter(item=>item.score>0).sort(byRelevance);
 const recent=candidates.slice().sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
 const namedGroups=allowed.filter(channel=>question.toLowerCase().includes(String(channel.name||"").toLowerCase())),defaultGroup=allowed.find(channel=>channel.is_workspace_group),memberGroupIds=new Set((namedGroups.length?namedGroups:defaultGroup?[defaultGroup]:[]).map(channel=>`group-meta-${channel.id}`));
 const targeted=(wantsAccountDate||wantsIdentity)?matches.filter(item=>item.kind==="Account"):wantsWorkspaceDate?matches.filter(item=>item.kind==="Workspace"):wantsMembers?matches.filter(item=>memberGroupIds.has(item.id)||(!memberGroupIds.size&&item.kind==="Workspace")):wantsFiles?matches.filter(item=>item.kind==="File"):wantsMessages?matches.filter(item=>item.kind==="Message"):wantsRecent?recent:matches;
 return targeted.filter((item,index,list)=>list.findIndex(other=>other.id===item.id)===index).slice(0,30);
}

export default function WorkspaceAI({workspaceId,meId,myName}:{workspaceId:string;meId:string;myName:string}){
 const [chatStore,setChatStore]=useState<ConversationStore>({activeId:"",conversations:[]});
 const [historyLoaded,setHistoryLoaded]=useState(false);
 const [query,setQuery]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [billingRequired,setBillingRequired]=useState(false);
 const [configured,setConfigured]=useState<boolean|null>(null);
 const [model,setModel]=useState("");
 const [provider,setProvider]=useState("");
 const [attachedFile,setAttachedFile]=useState<File|null>(null);
 const [mobileHistoryOpen,setMobileHistoryOpen]=useState(false);
 const conversationRef=useRef<HTMLDivElement>(null);
 const fileInputRef=useRef<HTMLInputElement>(null);
 const stickToBottom=useRef(true);
 const storageKey=`converge:ai-conversations:v1:${workspaceId}:${meId}`;
 const legacyStorageKey=`converge:ai-history:${workspaceId}:${meId}`;
 const activeConversation=chatStore.conversations.find(chat=>chat.id===chatStore.activeId);
 const turns=activeConversation?.turns||[];

 useEffect(()=>{const timer=window.setTimeout(()=>void(async()=>{try{
   const client=createClient(),{data:remote}=await client.from("workspace_ai_conversations").select("id,title,turns,created_at,updated_at").eq("workspace_id",workspaceId).eq("user_id",meId).order("updated_at",{ascending:false}).limit(30);
   if(remote?.length){const conversations=remote.map(row=>({id:row.id,title:row.title,createdAt:row.created_at,updatedAt:row.updated_at,turns:((row.turns||[])as Turn[]).map(cleanStoredTurn)}));setChatStore({activeId:"",conversations});return}
   const saved=JSON.parse(localStorage.getItem(storageKey)||"null") as ConversationStore|null;
   if(saved&&Array.isArray(saved.conversations)){setChatStore({activeId:"",conversations:saved.conversations.map(chat=>({...chat,turns:chat.turns.map(cleanStoredTurn)}))});}
   else{
    const legacy=JSON.parse(localStorage.getItem(legacyStorageKey)||"[]") as Turn[];
    if(legacy.length){const id=crypto.randomUUID(),first=legacy.find(turn=>turn.role==="user")?.text||"Workspace conversation",stamp=new Date().toISOString();setChatStore({activeId:"",conversations:[{id,title:first.slice(0,52),createdAt:stamp,updatedAt:stamp,turns:legacy.map(cleanStoredTurn)}]});}
   }
  }catch{setChatStore({activeId:"",conversations:[]})}
  finally{setHistoryLoaded(true)}})(),0);return()=>window.clearTimeout(timer)},[legacyStorageKey,meId,storageKey,workspaceId]);

 useEffect(()=>{
  void fetch("/api/workspace-ai")
   .then(response=>response.json())
   .then(data=>{setConfigured(Boolean(data.configured));setModel(data.model||"");setProvider(data.provider||"")})
   .catch(()=>setConfigured(false));
 },[]);

 useEffect(()=>{if(!historyLoaded)return;const client=createClient(),refresh=async()=>{const{data}=await client.from("workspace_ai_conversations").select("id,title,turns,created_at,updated_at").eq("workspace_id",workspaceId).eq("user_id",meId).order("updated_at",{ascending:false}).limit(30);if(!data?.length)return;setChatStore(current=>{const conversations=data.map(row=>({id:row.id,title:row.title,createdAt:row.created_at,updatedAt:row.updated_at,turns:((row.turns||[])as Turn[]).map(cleanStoredTurn)}));if(JSON.stringify(conversations)===JSON.stringify(current.conversations))return current;return{activeId:current.activeId&&conversations.some(chat=>chat.id===current.activeId)?current.activeId:"",conversations}})},channel=client.channel(`ai-history:${workspaceId}:${meId}`).on("postgres_changes",{event:"*",schema:"public",table:"workspace_ai_conversations",filter:`workspace_id=eq.${workspaceId}`},()=>void refresh()).subscribe();return()=>{void client.removeChannel(channel)}},[historyLoaded,meId,workspaceId]);

 useEffect(()=>{
  if(!historyLoaded)return;
  const stored={activeId:chatStore.activeId,conversations:chatStore.conversations.slice(0,30).map(chat=>({...chat,turns:chat.turns.slice(-60)}))};
  localStorage.setItem(storageKey,JSON.stringify(stored));
  const saveTimer=window.setTimeout(()=>{if(!stored.conversations.length)return;const client=createClient();void client.from("workspace_ai_conversations").upsert(stored.conversations.map(chat=>({id:chat.id,workspace_id:workspaceId,user_id:meId,title:chat.title.slice(0,80),turns:chat.turns,created_at:chat.createdAt,updated_at:chat.updatedAt})),{onConflict:"id"})},650);
  if(stickToBottom.current)requestAnimationFrame(()=>{
   const pane=conversationRef.current;
   if(pane)pane.scrollTo({top:pane.scrollHeight,behavior:"smooth"});
  });return()=>window.clearTimeout(saveTimer);
 },[chatStore,historyLoaded,meId,storageKey,workspaceId]);

 const ask=async(raw:string)=>{
  const file=attachedFile;
  const question=raw.trim()||(file?"Summarize this file and highlight the important details.":"");
  if(!question||busy)return;
  const chatId=activeConversation?.id||crypto.randomUUID();
  const earlier=(activeConversation?.turns||[]).slice(-8);
  const stamp=new Date().toISOString(),userTurn:Turn={id:crypto.randomUUID(),role:"user",text:question,attachmentName:file?.name};
  stickToBottom.current=true;
  setQuery("");setError("");setBillingRequired(false);setBusy(true);
  setChatStore(current=>{
   const existing=current.conversations.find(chat=>chat.id===chatId);
   const conversation=existing?{...existing,updatedAt:stamp,turns:[...existing.turns,userTurn]}:{id:chatId,title:question.replace(/\s+/g," ").slice(0,52),createdAt:stamp,updatedAt:stamp,turns:[userTurn]};
   return{activeId:chatId,conversations:[conversation,...current.conversations.filter(chat=>chat.id!==chatId)]};
  });
  try{
   const authClient=createClient();
   const {data:{user},error:userError}=await authClient.auth.getUser();
   if(userError||!user)throw new Error("Your browser session could not be verified. Refresh the workspace; sign-in is only needed if the session has actually expired.");
   let {data:{session}}=await authClient.auth.getSession();
   if(!session?.access_token){const refreshed=await authClient.auth.refreshSession();session=refreshed.data.session}
    if(!session?.access_token)throw new Error("Your browser session is missing. Refresh the workspace; sign-in is only needed if the session has actually expired.");
    const sources=await collectWorkspaceSources(workspaceId,meId,myName,question,user.created_at);
    let attachment:null|{name:string;mimeType:string;data?:string;text?:string}=null;
    if(file){
     if(file.size>8*1024*1024)throw new Error("Choose a file smaller than 8 MB for AI analysis.");
     const textFile=/^(text\/|application\/(json|xml))/.test(file.type)||/\.(txt|md|csv|json|xml|html|css|js|ts|tsx)$/i.test(file.name);
     if(textFile)attachment={name:file.name,mimeType:file.type||"text/plain",text:(await file.text()).slice(0,1_000_000)};
     else if(file.type==="application/pdf"||/^(image|audio|video)\//.test(file.type)){
      const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
      for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));
      attachment={name:file.name,mimeType:file.type,data:btoa(binary)};
     }else throw new Error("This file type is not supported yet. Use PDF, text, CSV, JSON, image, audio or video.");
    }
    const response=await fetch("/api/workspace-ai",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
    body:JSON.stringify({workspaceId,question,sources,attachment,history:earlier.map(turn=>({role:turn.role,text:turn.text}))})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok){if(data.code==="ai_credits_exhausted")setBillingRequired(true);throw new Error(data.error||"Converge AI could not answer right now.")}
   const destination=String(data.pendingAction?.type==="navigate_workspace"?data.pendingAction.destination:localNavigationIntent(question));
   const messageAction:PendingAction|undefined=!destination&&(data.pendingAction?.type==="send_main_group_message"||data.pendingAction?.type==="send_direct_message"?data.pendingAction:localMessageIntent(question));
   const routes:Record<string,string>={home:`/workspace/${workspaceId}`,messages:`/workspace/${workspaceId}/messages`,groups:`/workspace/${workspaceId}/groups`,files:`/workspace/${workspaceId}/files`,calendar:`/workspace/${workspaceId}?view=calendar`,meeting:`/workspace/${workspaceId}?view=screen`,ai:`/workspace/${workspaceId}?view=ai`,profile:`/profile?workspace=${workspaceId}`};
   setAttachedFile(null);
   setChatStore(current=>({...current,conversations:current.conversations.map(chat=>chat.id===chatId?{...chat,updatedAt:new Date().toISOString(),turns:[...chat.turns,{id:crypto.randomUUID(),role:"assistant",text:data.answer,sources:data.sources||[],action:messageAction}]}:chat)}));
   if(routes[destination])window.setTimeout(()=>location.assign(routes[destination]),250);
  }catch(cause){
   setError(cause instanceof Error?cause.message:"Converge AI could not answer right now.");
  }finally{setBusy(false)}
 };

 const submit=(event:FormEvent)=>{event.preventDefault();void ask(query)};
 const reset=()=>{setChatStore(current=>({...current,activeId:""}));setError("");setBillingRequired(false);setQuery("");setMobileHistoryOpen(false);stickToBottom.current=true};
 const openConversation=(id:string)=>{setChatStore(current=>({...current,activeId:id}));setError("");setBillingRequired(false);setMobileHistoryOpen(false);stickToBottom.current=true};
 const updateAction=(turnId:string,next:PendingAction)=>setChatStore(current=>({...current,conversations:current.conversations.map(chat=>({...chat,turns:chat.turns.map(turn=>turn.id===turnId?{...turn,action:next}:turn)}))}));
 const sendMessageAction=async(turnId:string,action:PendingAction)=>{
  const client=createClient();let sendError:{message:string}|null=null;
  if(action.type==="send_main_group_message"){
   const {data:group,error:groupError}=await client.from("channels").select("id").eq("workspace_id",workspaceId).eq("kind","group").eq("is_workspace_group",true).maybeSingle();
   if(groupError||!group){updateAction(turnId,{...action,error:"Main workspace group is unavailable."});return}
   ({error:sendError}=await client.from("channel_messages").insert({workspace_id:workspaceId,channel_id:group.id,sender_id:meId,message_type:"text",body:action.message,attachment_url:null,attachment_name:null}));
  }else{
   const recipientName=action.recipientName?.trim();
   if(!recipientName){updateAction(turnId,{...action,error:"Recipient name is missing."});return}
   const {data:people,error:profileError}=await client.from("workspace_profiles").select("id,full_name").eq("workspace_id",workspaceId).ilike("full_name",recipientName);
   if(profileError){updateAction(turnId,{...action,error:profileError.message});return}
   const exact=(people||[]).filter(person=>(person.full_name||"").localeCompare(recipientName,undefined,{sensitivity:"accent"})===0),matches=exact.length?exact:(people||[]);
   if(matches.length!==1){updateAction(turnId,{...action,error:matches.length?`More than one member matches ${recipientName}. Use their exact full name.`:`No workspace member named ${recipientName} was found.`});return}
   ({error:sendError}=await client.from("direct_messages").insert({workspace_id:workspaceId,sender_id:meId,recipient_id:matches[0].id,message_type:"text",body:action.message,attachment_url:null,attachment_name:null}));
  }
  if(sendError){updateAction(turnId,{...action,error:sendError.message});return}
  updateAction(turnId,{...action,status:"sent",error:undefined});window.dispatchEvent(new CustomEvent("converge:unread-chats"));
 };
 const suggestions=["What did I miss recently?","Summarize our next meeting details","What decisions were made about the project?"];

 return <section className="workspaceAI" aria-label="Converge AI">
  <aside className={`aiSide ${mobileHistoryOpen?"mobileOpen":""}`}>
   <header><i>✦</i><span><b>Converge AI</b><small>Grounded workspace assistant</small></span></header>
   <button onClick={reset}>＋ New chat</button>
   <div><small>RECENT CHATS</small>{chatStore.conversations.slice().sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).map(chat=><button className={`aiChatItem ${chat.id===chatStore.activeId?"active":""}`} key={chat.id} onClick={()=>openConversation(chat.id)}><b>{chat.title}</b><small>{chat.turns.filter(turn=>turn.role==="user").length} questions</small></button>)}</div>
  </aside>
  {mobileHistoryOpen&&<button className="aiMobileScrim" aria-label="Close AI chat history" onClick={()=>setMobileHistoryOpen(false)}/>}
  <main className="aiMain">
   <header><button className="aiHistoryToggle" aria-label="Open AI chat history" aria-expanded={mobileHistoryOpen} onClick={()=>setMobileHistoryOpen(true)}>☰</button><div><small>WORKSPACE AI · BETA</small><b>Ask this workspace</b></div><span className={`aiReady ${configured===false?"needsSetup":""}`}><i/>{configured===null?"Checking…":configured?`${provider} · ${model}`:"Setup required"}</span></header>
   <div ref={conversationRef} onScroll={event=>{const pane=event.currentTarget;stickToBottom.current=pane.scrollHeight-pane.scrollTop-pane.clientHeight<80}} className={`aiConversation ${turns.length?"hasTurns":""}`}>
    {!turns.length&&<section className="aiWelcome">
     <i>✦</i><small>HELLO, {myName.split(" ")[0].toUpperCase()}</small>
     <h1>What can I help you understand?</h1>
     <p>Ask a question and get a grounded answer from messages, posts, files and people you are allowed to access.</p>
     {configured===false&&<p className="aiSetupNotice"><b>Gemini is not configured yet.</b> Add <code>GEMINI_API_KEY</code> to <code>.env.local</code> and restart the app.</p>}
     <div>{suggestions.map(item=><button onClick={()=>void ask(item)} disabled={configured===false} key={item}>{item}<span>↗</span></button>)}</div>
    </section>}
    {turns.map(turn=><article className={`aiTurn ${turn.role}`} key={turn.id}>
     {turn.role==="assistant"&&<i>✦</i>}
     <div><small>{turn.role==="user"?"YOU":"CONVERGE AI"}</small>{turn.attachmentName&&<span className="aiTurnAttachment">📎 {turn.attachmentName}</span>}{turn.role==="assistant"?<AIAnswerText text={turn.text}/>:<p>{turn.text}</p>}
      {turn.sources?.length?<section className="aiSources">{turn.sources.map((source,index)=><Link href={source.href} key={source.id}><i className={source.imageUrl?"hasImage":""}>{source.imageUrl?<img src={source.imageUrl} alt=""/>:source.kind==="Message"?"◌":source.kind==="Person"?"♙":source.kind==="File"?"□":source.kind==="Group"?"♧":source.kind==="Account"?"◎":"↗"}</i><span><small>[{source.citation||index+1}] {source.kind}{source.createdAt?` · ${new Date(source.createdAt).toLocaleDateString([],{day:"numeric",month:"short"})}`:""}</small><b>{source.title}</b><em>{source.excerpt}</em></span><strong>›</strong></Link>)}</section>:null}
      {turn.action&&<section className={`aiActionCard ${turn.action.status||"pending"}`}><small>{turn.action.type==="send_direct_message"?`DIRECT MESSAGE · ${turn.action.recipientName}`:"MAIN WORKSPACE GROUP"}</small><p>{turn.action.message}</p>{turn.action.error&&<em>{turn.action.error}</em>}{turn.action.status==="sent"?<b>✓ Message sent</b>:turn.action.status==="cancelled"?<b>Cancelled</b>:<div><button onClick={()=>updateAction(turn.id,{...turn.action!,status:"cancelled"})}>Cancel</button><button onClick={()=>void sendMessageAction(turn.id,turn.action!)}>Send message</button></div>}</section>}
     </div>
    </article>)}
    {busy&&<article className="aiTurn assistant thinking"><i>✦</i><div><small>READING WORKSPACE</small><p><span/><span/><span/></p></div></article>}
    {error&&<div className={`aiError ${billingRequired?"billing":""}`} role="alert"><span>{error}</span>{billingRequired&&provider==="OpenAI"&&<a href="https://platform.openai.com/settings/organization/billing/" target="_blank" rel="noreferrer">Manage API billing ↗</a>}</div>}
   </div>
   <form className="aiComposer" onSubmit={submit}>
    {attachedFile&&<div className="aiAttachedFile"><span>📎 <b>{attachedFile.name}</b><small>{(attachedFile.size/1024/1024).toFixed(1)} MB</small></span><button type="button" aria-label="Remove attached file" onClick={()=>setAttachedFile(null)}>×</button></div>}
    <div><input ref={fileInputRef} hidden type="file" accept="application/pdf,text/*,application/json,application/xml,image/*,audio/*,video/*,.csv,.md,.tsx,.ts,.js" onChange={event=>{const file=event.target.files?.[0]||null;setAttachedFile(file);event.target.value=""}}/><button type="button" className="aiAttachButton" aria-label="Attach a file for AI analysis" onClick={()=>fileInputRef.current?.click()}>＋</button><textarea rows={1} aria-label="Ask Converge AI" placeholder="Ask about the workspace or attach a file…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void ask(query)}}}/><button disabled={busy||(!query.trim()&&!attachedFile)||configured===false} aria-label="Ask workspace">↑</button></div>
    <small>Answers are generated from matching workspace sources and can make mistakes. Check linked context.</small>
   </form>
  </main>
 </section>;
}
