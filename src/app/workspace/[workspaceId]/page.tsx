"use client";
import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import RealtimeWorkspace from "../../../components/RealtimeWorkspace";
import CommentThread, { ThreadComment } from "../../components/CommentThread";
import WorkspaceSearch from "../../components/WorkspaceSearch";
import "./workspace-search.css";
import MediaEditor, {MediaDraftPreview} from "../../components/MediaEditor";
import NotificationsBell from "../../components/NotificationsBell";
import WorkspaceMembers from "../../components/WorkspaceMembers";
import PostShareDialog from "../../components/PostShareDialog";
import "./workspace.css";
import "./workspace-fixes.css";
import "./navigation-refine.css";
import "./feed-width.css";
import "./rich-posts.css";
import "./media-controls.css";
import "./social-dialogs.css";
import "./reaction-row.css";
import "./comment-composer.css";
import "./notifications.css";
import "./members.css";
type IconName = "home" | "message" | "users" | "folder" | "calendar" | "screen" | "spark" | "bell" | "search" | "plus" | "heart" | "comment" | "share" | "more" | "grid";
const path: Record<IconName, string> = { home: "M3 11 12 3l9 8v10h-6v-7H9v7H3V11Z", message: "M21 15a4 4 0 0 1-4 4H8l-5 3v-4a4 4 0 0 1-1-3V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4v8Z", users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9", folder: "M3 5h6l2 2h10v13H3V5Z", calendar: "M4 5h16v16H4V5Zm0 5h16M8 2v6m8-6v6", screen:"M3 4h18v13H3V4Zm5 17h8m-4-4v4m-3-9 3-3 3 3m-3-3v6", spark: "m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z", bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 13h4", search: "m21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z", plus: "M12 5v14M5 12h14", heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z", comment: "M21 15a4 4 0 0 1-4 4H8l-5 3v-5a5 5 0 0 1-1-3V8a5 5 0 0 1 5-5h10a4 4 0 0 1 4 4v8Z", share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 14l6-4m-6 7 6 3", more: "M5 12h.01M12 12h.01M19 12h.01", grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" };
function Icon({ name }: {
    name: IconName;
}) { return <svg viewBox="0 0 24 24"><path d={path[name]}/></svg>; }
function Mark() { return <svg className="convergeMark" viewBox="0 0 64 58" aria-label="Converge logo"><path d="M32 29C22 11 7 11 7 24c0 11 11 15 25 5"/><path d="M32 29C52 11 59 24 54 35c-4 9-16 6-22-6"/><path d="M32 29C29 53 14 52 13 39c0-11 11-14 19-10"/><circle cx="32" cy="29" r="4"/></svg>; }
type Profile = {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    job_title: string | null;
};
type Comment = ThreadComment & {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
};
type Post = {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
    post_type: string;
    attachment_url: string | null;
    attachment_name: string | null;
    poll_options: string[] | null;
    votes: number[];
    voted: number | null;
    author: Profile;
    likes: string[];
    comments: number;
    shares: number;
    saves: number;
    saved: boolean;
};
const initials = (name: string) => (name.split(" ").map(x => x[0]).join("").slice(0, 2) || "U").toUpperCase();
function MediaPost({ url, name, onOpen }: {
    url: string;
    name: string | null;
    onOpen: (url: string, name: string | null) => void;
}) { const video = /\.(mp4|webm|ogg|mov)$/i.test(name || url); const [muted, setMuted] = useState(true); const [speed, setSpeed] = useState(1); const ref = useRef<HTMLVideoElement>(null); if (!video)
    return <button className="imageMedia" onClick={() => onOpen(url, name)}><img className="postMedia" src={url} alt={name || "Post attachment"}/><span>Expand</span></button>; return <div className="videoMedia"><video ref={ref} className="postMedia" src={url} controls muted={muted} playsInline onLoadedMetadata={() => { if (ref.current)
    ref.current.playbackRate = speed; }}/><button className="unmuteMedia" onClick={() => setMuted(!muted)}>{muted ? "Unmute" : "Mute"}</button><label className="speedMedia">Speed<select value={speed} onChange={e => { const next = Number(e.target.value); setSpeed(next); if (ref.current)
    ref.current.playbackRate = next; }}><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div>; }
function Avatar({ p, size = 40 }: {
    p: Profile;
    size?: number;
}) { return p.avatar_url ? <img className="avatar" style={{ width: size, height: size }} src={p.avatar_url} alt={p.full_name || "Member"}/> : <span className="avatar avatarFallback" style={{ width: size, height: size }}>{initials(p.full_name || "Member")}</span>; }
function relativeTime(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60)
    return `${seconds}s ago`; const minutes = Math.floor(seconds / 60); if (minutes < 60)
    return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24)
    return `${hours}h ago`; const days = Math.floor(hours / 24); if (days < 7)
    return `${days}d ago`; const weeks = Math.floor(days / 7); if (weeks < 52)
    return `${weeks}w ago`; return `${Math.floor(days / 365)}y ago`; }
export default function WorkspacePage() {
    const { workspaceId } = useParams<{
        workspaceId: string;
    }>();
    const router = useRouter();
    const [space, setSpace] = useState<{
        name: string;
        personality: string;
        owner_id: string;
    } | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [me, setMe] = useState<Profile | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [olderVisible, setOlderVisible] = useState(0);
    const [notice, setNotice] = useState("Loading workspace...");
    const [create, setCreate] = useState(false);
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);
    const [menu, setMenu] = useState<string | null>(null);
    const [editing, setEditing] = useState<Post | null>(null);
    const [editBody, setEditBody] = useState("");
    const [postType, setPostType] = useState<"update" | "media" | "file" | "poll">("update");
    const [attachment, setAttachment] = useState<File | null>(null);
    const [mediaDraft, setMediaDraft] = useState<File | null>(null);
    const [workspaceAvatar, setWorkspaceAvatar] = useState<string | null>(null);
    const [pollOptions, setPollOptions] = useState(["", ""]);
    const [sharing, setSharing] = useState<Post | null>(null);
    const [shareDialog, setShareDialog] = useState<Post | null>(null);
    const [dialogError, setDialogError] = useState("");
    const [shareStatus, setShareStatus] = useState("");
    const [mediaViewer, setMediaViewer] = useState<{
        url: string;
        name: string | null;
    } | null>(null);
    const [showIntro, setShowIntro] = useState(false);
    const [commentPost, setCommentPost] = useState<Post | null>(null);
    const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
    const [commentText, setCommentText] = useState("");
    const [commentRows, setCommentRows] = useState<Comment[]>([]);
    const [likesPost, setLikesPost] = useState<Post | null>(null);
    const [likePeople, setLikePeople] = useState<Profile[]>([]);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyParent, setReplyParent] = useState<string | null>(null);
    useEffect(() => { if (!menu) return; const close = (event: PointerEvent) => { if (!(event.target as Element).closest(".postMenu")) setMenu(null); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, [menu]);
    useEffect(() => { if (!create && !editing && !sharing)
        return; const before = document.body.style.overflow; document.body.style.overflow = "hidden"; const close = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) {
        setCreate(false);
        setEditing(null);
        setSharing(null);
    } }; document.addEventListener("keydown", close); return () => { document.body.style.overflow = before; document.removeEventListener("keydown", close); }; }, [create, editing, sharing, busy]);
    const load = useCallback(async () => { const s = createClient(); const { data: { user } } = await s.auth.getUser(); if (!user) {
        router.replace("/auth");
        return;
    } setShowIntro(Date.now() - new Date(user.created_at).getTime() < 172800000); const { data: w, error: we } = await s.from("workspaces").select("name,personality,owner_id").eq("id", workspaceId).single(); if (we || !w) {
        setNotice("Workspace not found or access denied.");
        return;
    } setSpace(w); const {data:workspaceGroup}=await s.from("channels").select("avatar_url").eq("workspace_id",workspaceId).eq("kind","group").eq("is_workspace_group",true).limit(1).maybeSingle();setWorkspaceAvatar(workspaceGroup?.avatar_url||null); const { data: profile } = await s.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id",workspaceId).eq("id", user.id).single(); setMe(profile || { id: user.id, full_name: user.user_metadata.full_name || user.email?.split("@")[0] || "Member", avatar_url: null, job_title: null }); const { data: rows, error } = await s.from("posts").select("id,author_id,body,created_at,post_type,attachment_url,attachment_name,poll_options").eq("workspace_id", workspaceId).is("archived_at", null).order("created_at", { ascending: false }); if (error) {
        setNotice(error.message);
        return;
    } if (!rows?.length) {
        setPosts([]);
        setNotice("");
        return;
    } const ids = rows.map(x => x.id), authors = [...new Set(rows.map(x => x.author_id))]; const [{ data: people }, { data: likes }, { data: comments }, { data: shares }, { data: saves }, { data: votes }] = await Promise.all([s.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id",workspaceId).in("id", authors), s.from("post_likes").select("post_id,user_id").in("post_id", ids), s.from("post_comments").select("post_id").in("post_id", ids), s.from("post_shares").select("post_id").in("post_id", ids), s.from("post_saves").select("post_id,user_id").in("post_id", ids), s.from("poll_votes").select("post_id,user_id,option_index").in("post_id", ids)]); const pm = new Map((people || []).map(x => [x.id, x as Profile])); setPosts(rows.map(x => ({ ...x, author: pm.get(x.author_id) || { id: x.author_id, full_name: "Member", avatar_url: null, job_title: null }, likes: (likes || []).filter(v => v.post_id === x.id).map(v => v.user_id), comments: (comments || []).filter(v => v.post_id === x.id).length, shares: (shares || []).filter(v => v.post_id === x.id).length, post_type: x.post_type || "update", attachment_url: x.attachment_url || null, attachment_name: x.attachment_name || null, poll_options: (x.poll_options as string[] | null) || null, votes: ((x.poll_options as string[] | null) || []).map((_, i) => (votes || []).filter(v => v.post_id === x.id && v.option_index === i).length), voted: (votes || []).find(v => v.post_id === x.id && v.user_id === user.id)?.option_index ?? null, saves: (saves || []).filter(v => v.post_id === x.id).length, saved: (saves || []).some(v => v.post_id === x.id && v.user_id === user.id) }))); setNotice(""); }, [router, workspaceId]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const targetComment = new URLSearchParams(window.location.search).get("comment");
        if (!targetComment) return;
        const postId = window.location.hash.replace("#post-", "");
        const post = posts.find((item) => item.id === postId);
        if (!post) return;
        setFocusCommentId(targetComment);
        openComments(post).then(() => history.replaceState(null, "", `${window.location.pathname}#post-${postId}`));
    }, [posts]);
    async function publish(e: FormEvent) { e.preventDefault(); if (!me)
        return; const options = pollOptions.map(x => x.trim()).filter(Boolean); if ((postType === "media" || postType === "file") && !attachment) {
        setDialogError("Choose a file to attach.");
        return;
    } if (postType === "poll" && options.length < 2) {
        setDialogError("Add at least two poll options.");
        return;
    } if (postType === "update" && !body.trim()) {
        return;
    } setBusy(true); const s = createClient(); let attachmentUrl: string | null = null; let attachmentName: string | null = null; if (attachment) {
        const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${me.id}/${workspaceId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await s.storage.from("workspace-media").upload(path, attachment, { contentType: attachment.type });
        if (uploadError) {
            setBusy(false);
            setDialogError(uploadError.message);
            return;
        }
        attachmentUrl = s.storage.from("workspace-media").getPublicUrl(path).data.publicUrl;
        attachmentName = attachment.name;
    } const { error } = await s.from("posts").insert({ workspace_id: workspaceId, author_id: me.id, body: body.trim(), post_type: postType, attachment_url: attachmentUrl, attachment_name: attachmentName, poll_options: postType === "poll" ? options : null }); setBusy(false); if (error) {
        setDialogError(error.message);
        return;
    } setDialogError(""); setBody(""); setAttachment(null); setPollOptions(["", ""]); setPostType("update"); setCreate(false); load(); }
    async function vote(p: Post, index: number) { if (!me)
        return; const { error } = await createClient().from("poll_votes").upsert({ post_id: p.id, user_id: me.id, option_index: index }, { onConflict: "post_id,user_id" }); if (error) {
        setNotice(error.message);
        return;
    } load(); }
    async function openComments(p: Post) { setCommentPost(p); const s = createClient(); const { data: rows, error } = await s.from("post_comments").select("id,author_id,body,created_at,parent_id,reply_to_id,pinned_at").eq("post_id", p.id).order("created_at", { ascending: true }); if (error) { setDialogError(error.message); return; } const ids = [...new Set((rows || []).map(x => x.author_id))]; const { data: people } = ids.length ? await s.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id",workspaceId).in("id", ids) : { data: [] }; const map = new Map((people || []).map(x => [x.id, x as Profile])); setCommentRows((rows || []).map(x => ({ ...x, author: map.get(x.author_id) }))); }
    useEffect(() => { if (!commentPost)
        return; const close = (event: MouseEvent) => { const section = document.querySelector(".commentDialog>section"); const picker = document.querySelector(".emojiPicker"); const trigger = document.querySelector(".emojiButton"); if (section && !section.contains(event.target as Node))
        setCommentPost(null); if (emojiOpen && picker && trigger && !picker.contains(event.target as Node) && !trigger.contains(event.target as Node))
        setEmojiOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [commentPost, emojiOpen]);
    useEffect(() => { if (!emojiOpen)
        return; const picker = document.querySelector<HTMLElement>(".emojiPicker"); if (!picker)
        return; ["😁", "😆", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😘", "😋", "😜", "🤪", "🤩", "😏", "😌", "😴", "🤗", "🫡", "🫶", "💪", "🎯", "💡", "📌", "🌟", "☀️", "🌈", "🍀", "🎵", "🎬", "📷", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "⭐", "⚡", "🥳", "🤝", "👋", "👌", "✌️", "🤞", "🫰", "😺", "🐶", "🦊", "🐼", "🌸", "🍕", "☕", "🎂", "🏆", "🚀", "✅", "❓"].forEach(emoji => { const button = document.createElement("button"); button.type = "button"; button.textContent = emoji; button.onclick = () => { setCommentText(text => text + emoji); setEmojiOpen(false); }; picker.append(button); }); }, [emojiOpen]);
    async function addComment(e: FormEvent) { e.preventDefault(); if (!me || !commentPost || !commentText.trim())
        return; const { error } = await createClient().from("post_comments").insert({ post_id: commentPost.id, author_id: me.id, body: commentText.trim(), parent_id: replyingTo ? replyParent : null }); if (error) {
        setDialogError(error.message);
        return;
    } setCommentText(""); setReplyingTo(null); setReplyParent(null); await openComments(commentPost); load(); }
    async function openLikes(p: Post) { setLikesPost(p); const { data } = p.likes.length ? await createClient().from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id",workspaceId).in("id", p.likes) : { data: [] }; setLikePeople((data || []) as Profile[]); }
    async function like(p: Post) { if (!me)
        return; const s = createClient(); const { error } = p.likes.includes(me.id)
        ? await s.from("post_likes").delete().eq("post_id", p.id).eq("user_id", me.id)
        : await s.from("post_likes").insert({ post_id: p.id, user_id: me.id }); if (error) { setNotice(error.message); return; } load(); }
    async function toggleSave(p: Post) { if (!me)
        return; const s = createClient(); const { error } = p.saved ? await s.from("post_saves").delete().eq("post_id", p.id).eq("user_id", me.id) : await s.from("post_saves").insert({ post_id: p.id, user_id: me.id }); if (error) {
        setNotice("Saving needs the profile-saves-migration.sql database step.");
        return;
    } load(); }
    function share(p: Post) { setShareDialog(p); }
    async function copyShare() { if (!sharing || !me)
        return; setBusy(true); try {
        await navigator.clipboard.writeText(location.origin + "/workspace/" + workspaceId + "#post-" + sharing.id);
        const { error } = await createClient().from("post_shares").insert({ post_id: sharing.id, user_id: me.id });
        setShareStatus(error ? "Link copied. Share count could not be saved." : "Link copied! Paste it into a message to share this post.");
        if (!error)
            await load();
    }
    catch {
        setShareStatus("Could not copy automatically. Select and copy the link above.");
    }
    finally {
        setBusy(false);
    } }
    async function archive(id: string) { await createClient().from("posts").update({ archived_at: new Date().toISOString() }).eq("id", id); setMenu(null); load(); }
    async function remove(id: string) { if (!confirm("Delete this post permanently?"))
        return; await createClient().from("posts").delete().eq("id", id); setMenu(null); load(); }
    async function saveEdit(e: FormEvent) { e.preventDefault(); if (!editing || !editBody.trim())
        return; await createClient().from("posts").update({ body: editBody.trim(), updated_at: new Date().toISOString() }).eq("id", editing.id); setEditing(null); load(); }
    useEffect(() => {
        const openMessages = (event: MouseEvent) => {
            const button = (event.target as HTMLElement).closest("button");
            if (button?.textContent?.trim() === "Messages") router.push(`/workspace/${workspaceId}/messages`);
        };
        document.addEventListener("click", openMessages);
        return () => document.removeEventListener("click", openMessages);
    }, [router, workspaceId]);
    useEffect(() => {
        const openComposer = () => {
            sessionStorage.removeItem(`converge:open-compose:${workspaceId}`);
            setDialogError("");
            setCreate(true);
        };
        window.addEventListener("converge:open-compose", openComposer);
        if (sessionStorage.getItem(`converge:open-compose:${workspaceId}`) === "1") openComposer();
        return () => window.removeEventListener("converge:open-compose", openComposer);
    }, [workspaceId]);
    if (!space || !me)
        return <main className="workspaceLoading"><b>C</b><p>{notice}</p></main>;
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const recentPosts = posts.filter((post) => new Date(post.created_at).getTime() >= twoDaysAgo);
    const olderPosts = posts.filter((post) => new Date(post.created_at).getTime() < twoDaysAgo);
    const feedPosts = [...recentPosts, ...olderPosts.slice(0, olderVisible)];
    const nav: [
        IconName,
        string
    ][] = [["home", "Home"], ["message", "Messages"], ["users", "Groups"], ["folder", "Files"], ["calendar", "Calendar"], ["screen", "Meeting"], ["spark", "Converge AI"]];
    return <><RealtimeWorkspace workspaceId={workspaceId} refresh={load}/>{mediaDraft&&<MediaEditor file={mediaDraft} onCancel={()=>setMediaDraft(null)} onApply={file=>{setAttachment(file);setMediaDraft(null)}}/>}{shareDialog && <PostShareDialog postId={shareDialog.id} workspaceId={workspaceId} meId={me.id} onClose={() => setShareDialog(null)} onShared={load}/>}<main className={`workspaceShell ${sidebarOpen ? "" : "sidebarClosed"}`}><button className="sidebarToggle" onClick={() => setSidebarOpen((current) => !current)} aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>{sidebarOpen ? "‹" : "›"}</button><aside className="proSidebar"><div className="wordmark"><Mark /><span>CONVERGE</span></div><button className="spacePicker"><i>{workspaceAvatar ? <img src={workspaceAvatar} alt={`${space.name} group`}/> : initials(space.name)}</i><span><small>WORKSPACE</small><b>{space.name}</b></span><em>⌄</em></button><nav><small>MENU</small>{nav.map(([icon, label], i) => label === "Groups" ? <Link key={label} href={`/workspace/${workspaceId}/groups`}><Icon name={icon}/><span>{label}</span></Link> : <button className={i === 0 ? "active" : ""} key={label}><Icon name={icon}/><span>{label}</span></button>)}</nav><footer><NotificationsBell userId={me.id} workspaceId={workspaceId} sidebar/><Link href="/dashboard"><Icon name="grid"/><span>All workspaces</span></Link><Link className="account" href={`/profile?workspace=${workspaceId}`}><Avatar p={me} size={34}/><span><b>{me.full_name}</b><small>{me.job_title || "Member"}</small></span></Link></footer></aside><section className="mainFeed"><header className="topbar"><WorkspaceSearch workspaceId={workspaceId} onPost={id=>{setOlderVisible(posts.length);window.setTimeout(()=>{document.getElementById(`post-${id}`)?.scrollIntoView({behavior:"smooth",block:"center"});history.replaceState(null,"",`#post-${id}`)},100)}}/>{space.owner_id === me.id && <WorkspaceMembers workspaceId={workspaceId} owner/>}<NotificationsBell userId={me.id} workspaceId={workspaceId}/><button className="iconButton createIcon" aria-label="Create post" onClick={() => { setDialogError(""); setCreate(true); }}><Icon name="plus"/></button></header>{showIntro && <div className="feedIntro"><p>WORKSPACE HOME</p><h1>Good to see you, {me.full_name?.split(" ")[0]}.</h1><span>Everything your team shares, in one calm place.</span></div>}{notice && <p className="notice">{notice}</p>}<section className="postStream">{!recentPosts.length && !olderVisible && !notice && <div className="emptyFeed"><i><Icon name="spark"/></i><p>YOUR FEED STARTS HERE</p><h2>{posts.length ? "No new posts." : "Nothing posted yet."}</h2><span>{posts.length ? "Posts older than two days are available below." : `Be the first person to share something useful with ${space.name}.`}</span><button onClick={() => { setDialogError(""); setCreate(true); }}><Icon name="plus"/>Create post</button></div>}{feedPosts.map(p => <article className="post" id={"post-" + p.id} key={p.id}><header><Avatar p={p.author}/><span><b>{p.author.full_name}</b><small>{p.author.job_title || "Workspace member"} · {new Date(p.created_at).toLocaleString()}</small></span>{p.author_id === me.id && <div className="postMenu"><button onClick={() => setMenu(menu === p.id ? null : p.id)}><Icon name="more"/></button>{menu === p.id && <aside><button onClick={() => { setEditing(p); setEditBody(p.body); setMenu(null); }}>Edit post</button><button onClick={() => archive(p.id)}>Archive</button><button className="danger" onClick={() => remove(p.id)}>Delete</button></aside>}</div>}</header>{p.post_type !== "media" && p.body && <p>{p.body}</p>}{p.attachment_url && (p.post_type === "media" ? <MediaPost url={p.attachment_url} name={p.attachment_name} onOpen={(url, name) => setMediaViewer({ url, name })}/> : <a className="postFile" href={p.attachment_url} target="_blank" rel="noreferrer"><Icon name="folder"/><span>{p.attachment_name || "Open attached file"}</span><b>Open</b></a>)}{p.post_type === "poll" && p.poll_options && <div className="postPoll">{p.poll_options.map((option, index) => { const total = p.votes.reduce((a, b) => a + b, 0); const count = p.votes[index] || 0; return <button className={p.voted === index ? "chosen" : ""} key={option} onClick={() => vote(p, index)}><span>{option}</span><i style={{ width: `${total ? count / total * 100 : 0}%` }}/><b>{count}</b></button>; })}</div>}{p.post_type === "media" && p.body && <p>{p.body}</p>}<footer><span className="reaction likeReaction"><button className={p.likes.includes(me.id) ? "liked" : ""} onClick={() => like(p)} aria-label="Like post"><Icon name="heart"/></button><i role="button" tabIndex={0} onClick={() => openLikes(p)} onKeyDown={e => e.key === "Enter" && openLikes(p)} title="See who liked this">{p.likes.length}</i></span><button onClick={() => openComments(p)} aria-label="Comments"><Icon name="comment"/><b>{p.comments}</b></button><button onClick={() => share(p)} aria-label="Share post"><Icon name="share"/><b>{p.shares}</b></button><button className={p.saved ? "liked" : ""} onClick={() => toggleSave(p)} title="Save post" aria-label="Save post">▱ <b>{p.saves}</b></button></footer></article>)}</section>{olderPosts.length > olderVisible && <button className="seeOlderPosts" onClick={() => setOlderVisible((count) => Math.min(count + 10, olderPosts.length))}>See older posts</button>}</section><nav className="mobileNav"><Link href={`/workspace/${workspaceId}`} aria-label="Home"><Icon name="home"/></Link><Link href={`/workspace/${workspaceId}/groups`} aria-label="Groups"><Icon name="users"/></Link><button className="mobileCreate" aria-label="Create post" onClick={() => { setDialogError(""); setCreate(true); }}><Icon name="plus"/></button><Link href={`/profile?workspace=${workspaceId}`} aria-label="Profile"><Avatar p={me} size={25}/></Link></nav></main>{create && <div className="modal workspaceDialog" role="dialog" aria-modal="true" aria-label="Post dialog" onMouseDown={e => e.target === e.currentTarget && setCreate(false)}><section><header><span><p>CREATE POST</p><h2>Share with {space.name}</h2></span><button onClick={() => setCreate(false)}>×</button></header><div className="postTypes"><button type="button" className={postType === "update" ? "active" : ""} onClick={() => setPostType("update")}><Icon name="message"/>Update</button><button type="button" className={postType === "media" ? "active" : ""} onClick={() => setPostType("media")}><Icon name="grid"/>Photo/video</button><button type="button" className={postType === "file" ? "active" : ""} onClick={() => setPostType("file")}><Icon name="folder"/>File</button><button type="button" className={postType === "poll" ? "active" : ""} onClick={() => setPostType("poll")}><Icon name="users"/>Poll</button></div>{dialogError && <p className="dialogError" role="alert">{dialogError}</p>}<form onSubmit={publish}>{postType !== "poll" && <textarea aria-label="Post text" autoFocus value={body} onChange={e => setBody(e.target.value)} placeholder={postType === "update" ? "What would you like your team to know?" : postType === "media" ? "Add a caption (optional)" : "Add a note (optional)"} maxLength={3000}/>} {(postType === "media" || postType === "file") && <label className="attachmentInput"><Icon name={postType === "media" ? "grid" : "folder"}/><span>{attachment ? attachment.name : postType === "media" ? "Choose photo or video" : "Choose a file"}</span><input type="file" accept={postType === "media" ? "image/*,video/*" : "*"} onChange={(e: ChangeEvent<HTMLInputElement>) => {const file=e.target.files?.[0]||null;if(file&&(file.type.startsWith("image/")||file.type.startsWith("video/")))setMediaDraft(file);else setAttachment(file);e.currentTarget.value="";}}/></label>}{postType==="media"&&attachment&&<MediaDraftPreview file={attachment} onEdit={()=>setMediaDraft(attachment)} onRemove={()=>setAttachment(null)}/>} {postType === "poll" && <div className="pollBuilder"><input value={body} onChange={e => setBody(e.target.value)} placeholder="Ask your question (optional)"/>{pollOptions.map((option, index) => <input key={index} value={option} onChange={e => setPollOptions(pollOptions.map((x, i) => i === index ? e.target.value : x))} placeholder={`Option ${index + 1}`}/>)}{pollOptions.length < 4 && <button type="button" onClick={() => setPollOptions([...pollOptions, ""])}>+ Add option</button>}</div>}<footer><span>{body.length}/3000</span><button type="button" onClick={() => setCreate(false)}>Cancel</button><button disabled={busy}>{busy ? "Publishing..." : "Publish post"}</button></footer></form></section></div>}{editing && <div className="modal workspaceDialog" role="dialog" aria-modal="true" aria-label="Post dialog"><section><header><span><p>EDIT POST</p><h2>Update your message</h2></span><button onClick={() => setEditing(null)}>×</button></header><form onSubmit={saveEdit}><textarea value={editBody} onChange={e => setEditBody(e.target.value)} maxLength={3000}/><footer><span>{editBody.length}/3000</span><button type="button" onClick={() => setEditing(null)}>Cancel</button><button>Save changes</button></footer></form></section></div>}{commentPost && <CommentThread workspaceId={workspaceId} postId={commentPost.id} postAuthorId={commentPost.author_id} me={me} comments={commentRows} focusCommentId={focusCommentId} onClose={() => { setCommentPost(null); setFocusCommentId(null); }} onRefresh={() => openComments(commentPost)}/>}{likesPost && <div className="modal workspaceDialog likesDialog"><section><header><span><p>LIKES</p><h2>Liked by</h2></span><button onClick={() => setLikesPost(null)}>×</button></header>{likePeople.length ? likePeople.map(person => <div className="likePerson" key={person.id}><Avatar p={person} size={34}/><span><b>{person.full_name}</b><small>{person.job_title || "Workspace member"}</small></span></div>) : <p className="shareHelp">No likes yet.</p>}</section></div>}{mediaViewer && <div className="modal workspaceDialog mediaViewer" onMouseDown={e => e.target === e.currentTarget && setMediaViewer(null)}><section><button className="closeViewer" aria-label="Close image" onClick={() => setMediaViewer(null)}>×</button><img src={mediaViewer.url} alt={mediaViewer.name || "Expanded attachment"}/></section></div>}{sharing && <div className="modal workspaceDialog" role="dialog" aria-modal="true" aria-label="Share post"><section><header><span><p>SHARE POST</p><h2>Send it to your team</h2></span><button aria-label="Close share dialog" onClick={() => setSharing(null)}>×</button></header><p className="shareHelp">Copy a link to this post and send it to a teammate. Only members of {space.name} can access it.</p><input className="shareUrl" aria-label="Post link" readOnly value={typeof location !== "undefined" ? location.origin + "/workspace/" + workspaceId + "#post-" + sharing.id : ""} onFocus={e => e.target.select()}/><button className="shareCopy" disabled={busy || shareStatus.startsWith("Link copied")} onClick={copyShare}>{busy ? "Copying..." : shareStatus.startsWith("Link copied") ? "Copied" : "Copy post link"}</button>{shareStatus && <p className="shareHelp" role="status">{shareStatus}</p>}</section></div>}</>;
}
