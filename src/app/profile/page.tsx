"use client";
import Link from "next/link";
import PhotoPreview from "../components/PhotoPreview";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import ProfilePostCard, { ProfileFeedPost } from "../components/ProfilePostCard";
import WorkspaceThemeScope from "../components/WorkspaceThemeScope";
import { RailGlyph, RailDestination } from "../components/WorkspaceIconRail";
import "./profile.css";
import "./profile-refine.css";
import "./profile-final.css";
import "./profile-sidebar-feed.css";
import "./profile-logo-scroll.css";
import "./profile-feed-posts.css";
import "./profile-bio.css";
import "./profile-sidebar-polish.css";
type Profile = {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    job_title: string | null;
    bio?: string | null;
};
type Post = ProfileFeedPost;
type WorkspaceOption = { id: string; name: string; avatar: string | null };
const initials = (name: string) => (name.split(" ").map(x => x[0]).join("").slice(0, 2) || "U").toUpperCase();
const SidebarIcon = ({ name }: { name: RailDestination | "notifications" | "workspaces" }) => name === "notifications" ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg> : name === "workspaces" ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> : <RailGlyph name={name}/>;
export default function ProfilePage() {
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [view, setView] = useState<"posts" | "saved" | "archive">("posts");
    const [menu, setMenu] = useState(false);
    const [photo, setPhoto] = useState(false);
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState("");
    const [title, setTitle] = useState("");
    const [bio, setBio] = useState("");
    const [message, setMessage] = useState("");
    const [uploading, setUploading] = useState(false);
    const [home, setHome] = useState<string | null>(null);
    const [workspaceName, setWorkspaceName] = useState("Your workspace");
    const [workspaceAvatar, setWorkspaceAvatar] = useState<string | null>(null);
    const [workspaceOpen, setWorkspaceOpen] = useState(false);
    const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
    const [postMenu, setPostMenu] = useState<string | null>(null);
    const [postEditing, setPostEditing] = useState<Post | null>(null);
    const [postBody, setPostBody] = useState("");
    const [leaving, setLeaving] = useState(false);
    useEffect(() => { if (!menu && !postMenu) return; const close = (event: PointerEvent) => { const target = event.target as Element; if (!target.closest(".moreButton,.profileMenu,.profilePostMenu")) { setMenu(false); setPostMenu(null); } }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, [menu, postMenu]);
    useEffect(() => { if (!workspaceOpen) return; const close = (event: PointerEvent) => { if (!(event.target as Element).closest(".profileSpacePicker,.profileWorkspaceDrawer")) setWorkspaceOpen(false); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, [workspaceOpen]);
    const load = useCallback(async () => { const s = createClient(); const { data: { user } } = await s.auth.getUser(); if (!user) {
        router.replace("/auth");
        return;
    } const workspaceId = new URLSearchParams(window.location.search).get("workspace"); if (!workspaceId) {
        router.replace("/dashboard");
        return;
    } const { data: membership } = await s.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("workspace_id", workspaceId).limit(1).maybeSingle(); if (!membership) {
        setMessage("This workspace is unavailable.");
        return;
    } setHome(membership.workspace_id); if (membership?.workspace_id) {
        const { data: memberships } = await s.from("workspace_members").select("workspace_id").eq("user_id", user.id);
        const workspaceIds = [...new Set((memberships || []).map(item => item.workspace_id))];
        const [{ data: availableWorkspaces }, { data: workspaceGroups }] = await Promise.all([
            workspaceIds.length ? s.from("workspaces").select("id,name").in("id", workspaceIds) : Promise.resolve({ data: [] }),
            workspaceIds.length ? s.from("channels").select("workspace_id,avatar_url").in("workspace_id", workspaceIds).eq("kind", "group").eq("is_workspace_group", true) : Promise.resolve({ data: [] })
        ]);
        const photos = new Map((workspaceGroups || []).map(group => [group.workspace_id, group.avatar_url]));
        const options = (availableWorkspaces || []).map(item => ({ id: item.id, name: item.name || "Workspace", avatar: photos.get(item.id) || null }));
        const currentWorkspace = options.find(item => item.id === membership.workspace_id);
        setWorkspaceOptions(options);
        setWorkspaceName(currentWorkspace?.name || "Your workspace");
        setWorkspaceAvatar(currentWorkspace?.avatar || null);
    } const { data: p, error: profileError } = await s.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id", workspaceId).eq("id", user.id).single(); const { data: bioRow } = await s.from("workspace_profiles").select("bio").eq("workspace_id", workspaceId).eq("id", user.id).maybeSingle(); if (profileError || !p) {
        setMessage(profileError?.message || "Workspace profile unavailable. Apply workspace-profiles-migration.sql.");
        return;
    } const current: Profile = { ...p, bio: bioRow?.bio || null }; setProfile(current); setName(current.full_name || ""); setTitle(current.job_title || ""); setBio(current.bio || ""); const [{ data: ownPosts }, { data: mySaveRows }] = await Promise.all([s.from("posts").select("id,workspace_id,author_id,body,created_at,archived_at,post_type,attachment_url,attachment_name,poll_options").eq("author_id", user.id).eq("workspace_id", workspaceId), s.from("post_saves").select("post_id").eq("user_id", user.id)]); const savedIds = (mySaveRows || []).map(x => x.post_id); const { data: savedPosts } = savedIds.length ? await s.from("posts").select("id,workspace_id,author_id,body,created_at,archived_at,post_type,attachment_url,attachment_name,poll_options").in("id", savedIds).eq("workspace_id", workspaceId) : { data: [] }; const raw = [...new Map([...(ownPosts || []), ...(savedPosts || [])].map(post => [post.id, post])).values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); if (!raw.length) {
        setPosts([]);
        return;
    } const ids = raw.map(x => x.id), authorIds = [...new Set(raw.map(x => x.author_id))]; const [{ data: likes }, { data: comments }, { data: shares }, { data: saves }, { data: votes }, { data: people }] = await Promise.all([s.from("post_likes").select("post_id,user_id").in("post_id", ids), s.from("post_comments").select("post_id").in("post_id", ids), s.from("post_shares").select("post_id").in("post_id", ids), s.from("post_saves").select("post_id,user_id").in("post_id", ids), s.from("poll_votes").select("post_id,user_id,option_index").in("post_id", ids), s.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id", workspaceId).in("id", authorIds)]); const personMap = new Map((people || []).map(person => [person.id, person])); setPosts(raw.map(x => ({ ...x, post_type: x.post_type || "update", attachment_url: x.attachment_url || null, attachment_name: x.attachment_name || null, poll_options: x.poll_options || null, author: personMap.get(x.author_id) || { id: x.author_id, full_name: "Member", avatar_url: null, job_title: null }, likes: (likes || []).filter(v => v.post_id === x.id).length, liked: (likes || []).some(v => v.post_id === x.id && v.user_id === user.id), comments: (comments || []).filter(v => v.post_id === x.id).length, shares: (shares || []).filter(v => v.post_id === x.id).length, saves: (saves || []).filter(v => v.post_id === x.id).length, saved: (saves || []).some(v => v.post_id === x.id && v.user_id === user.id), votes: ((x.poll_options as string[] || [])).map((_, index) => (votes || []).filter(v => v.post_id === x.id && v.option_index === index).length), voted: (votes || []).find(v => v.post_id === x.id && v.user_id === user.id)?.option_index ?? null }))); }, [router]);
    useEffect(() => { const timer=window.setTimeout(()=>void load(),0),client=createClient(),channel=client.channel("own-profile-feed").on("postgres_changes",{event:"*",schema:"public",table:"posts"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"post_likes"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"post_comments"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"post_saves"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"channels"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"workspaces"},()=>void load()).subscribe();return()=>{window.clearTimeout(timer);void client.removeChannel(channel)}; }, [load]);
    async function saveProfile(e: FormEvent) { e.preventDefault(); if (!profile)
        return; const { error } = await createClient().from("workspace_profiles").update({ full_name: name.trim(), job_title: title.trim(), bio: bio.trim() || null }).eq("workspace_id", home).eq("id", profile.id); if (error) {
        setMessage(error.message);
        return;
    } setEditing(false); setMessage("Profile saved."); load(); }
    async function upload(e: ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; if (!file || !profile)
        return; if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
        setMessage("Choose a JPG, PNG or WEBP image below 2 MB.");
        return;
    } setUploading(true); const s = createClient(); const ext = file.name.split(".").pop() || "jpg"; const path = `${profile.id}/${home}/avatar-${Date.now()}.${ext}`; const { error } = await s.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type }); if (error) {
        setMessage(error.message);
        setUploading(false);
        return;
    } const { data } = s.storage.from("avatars").getPublicUrl(path); const { error: profilePhotoError } = await s.from("workspace_profiles").update({ avatar_url: `${data.publicUrl}?v=${Date.now()}` }).eq("id", profile.id).eq("workspace_id", home); setUploading(false); if (profilePhotoError) {
        setMessage(profilePhotoError.message);
        return;
    } setPhoto(false); setMessage("Profile picture updated."); load(); }
    async function removePhoto() { if (!profile)
        return; const { error } = await createClient().from("workspace_profiles").update({ avatar_url: null }).eq("id", profile.id).eq("workspace_id", home); if (error) {
        setMessage(error.message);
        return;
    } setPhoto(false); setMessage("Profile picture removed."); load(); }
    async function savePost(e: FormEvent) { e.preventDefault(); if (!postEditing || !postBody.trim())
        return; const { error } = await createClient().from("posts").update({ body: postBody.trim(), updated_at: new Date().toISOString() }).eq("id", postEditing.id); if (error) {
        setMessage(error.message);
        return;
    } setPostEditing(null); load(); }
    async function leaveWorkspace() { if (!profile || !home)
        return; const s = createClient(); const { data: space } = await s.from("workspaces").select("owner_id").eq("id", home).single(); if (space?.owner_id === profile.id) {
        setLeaving(false);
        setMessage("You own this workspace. Transfer ownership to another member before leaving it.");
        return;
    } const { error } = await s.from("workspace_members").delete().eq("workspace_id", home).eq("user_id", profile.id); if (error) {
        setMessage("Leaving needs the workspace-leave-migration.sql database step.");
        return;
    } router.replace("/dashboard"); router.refresh(); }
    async function signOut() { await createClient().auth.signOut(); router.replace("/"); router.refresh(); }
    if (!profile)
        return <main className="profileLoad">{message || "Loading profile..."}</main>;
    const shown = posts.filter(p => view === "archive" ? !!p.archived_at : view === "saved" ? p.saved : !p.archived_at && p.author_id === profile.id);
    const live = posts.filter(p => !p.archived_at && p.author_id === profile.id);
    return <main className="profileShell"><WorkspaceThemeScope workspaceId={home}/><aside className="profileSidebar"><Link className="profileBrand" href={home ? `/workspace/${home}` : "/dashboard"}><svg viewBox="0 0 64 58" aria-label="Converge logo"><path d="M32 29C22 11 7 11 7 24c0 11 11 15 25 5"/><path d="M32 29C52 11 59 24 54 35c-4 9-16 6-22-6"/><path d="M32 29C29 53 14 52 13 39c0-11 11-14 19-10"/><circle cx="32" cy="29" r="4"/></svg><span>CONVERGE</span></Link><div className="profileWorkspaceSwitcher"><button className="profileSpacePicker" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen(value => !value)}><i>{workspaceAvatar ? <img src={workspaceAvatar} alt={`${workspaceName} group`}/> : initials(workspaceName)}</i><span><small>WORKSPACE</small><b>{workspaceName}</b></span><em>{workspaceOpen ? "⌃" : "⌄"}</em></button>{workspaceOpen&&<aside className="profileWorkspaceDrawer" role="menu"><header><small>YOUR WORKSPACES</small><b>Switch workspace</b></header><div>{workspaceOptions.map(item=><Link role="menuitem" className={item.id===home?"active":""} href={`/workspace/${item.id}`} key={item.id}><i>{item.avatar?<img src={item.avatar} alt=""/>:initials(item.name)}</i><span><b>{item.name}</b><small>{item.id===home?"Current workspace":"Open workspace"}</small></span>{item.id===home&&<em>✓</em>}</Link>)}</div><Link className="allSpaces" href="/dashboard">View all workspaces →</Link></aside>}</div><nav><small>MENU</small><Link href={home ? `/workspace/${home}` : "/dashboard"}><SidebarIcon name="home"/><span>Home</span></Link><Link href={home ? `/workspace/${home}/messages` : "/dashboard"}><SidebarIcon name="messages"/><span>Messages</span></Link><Link href={home ? `/workspace/${home}/groups` : "/dashboard"}><SidebarIcon name="groups"/><span>Groups</span></Link><Link href={home ? `/workspace/${home}/files` : "/dashboard"}><SidebarIcon name="files"/><span>Files</span></Link><Link href={home ? `/workspace/${home}?view=calendar` : "/dashboard"}><SidebarIcon name="calendar"/><span>Calendar</span></Link><Link href={home ? `/workspace/${home}?view=screen` : "/dashboard"}><SidebarIcon name="screen"/><span>Meeting</span></Link><Link href={home ? `/workspace/${home}?view=ai` : "/dashboard"}><SidebarIcon name="ai"/><span>Converge AI</span></Link></nav><footer><Link href={home ? `/workspace/${home}#notifications` : "/dashboard"}><SidebarIcon name="notifications"/><span>Notifications</span></Link><Link href="/dashboard"><SidebarIcon name="workspaces"/><span>All workspaces</span></Link><button className="profileAccount active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span className="avatarButton">{profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : initials(profile.full_name || "Member")}</span><span><b>{profile.full_name}</b><small>{profile.job_title || "Member"}</small></span></button></footer></aside><section className="profileMain"><header className="profileTop"><Link href={home ? `/workspace/${home}` : "/dashboard"}>← Back to workspace</Link><div><button className="editButton" onClick={() => setEditing(true)}>Edit profile</button><button className="moreButton" aria-label="Profile options" onClick={() => setMenu(!menu)}>•••</button>{menu && <aside className="profileMenu"><button onClick={() => { setView("saved"); setMenu(false); }}>Saved posts</button><button onClick={() => { setView("archive"); setMenu(false); }}>Archive <b>{posts.filter(p => p.archived_at).length}</b></button><button onClick={signOut}>Log out</button><button className="danger" onClick={() => { setMenu(false); setLeaving(true); }}>Leave workspace</button></aside>}</div></header><section className="profileHero"><button className="heroAvatar" onClick={() => setPhoto(true)}>{profile.avatar_url ? <img src={profile.avatar_url} alt={profile.full_name || "Profile"}/> : initials(profile.full_name || "Member")}</button><div><h1>{profile.full_name || "Member"}</h1><p>{profile.job_title || "Workspace member"}</p><p className="profileBio">{profile.bio || "No bio added yet"}</p><div className="profileStats"><b>{live.length}<small>Posts</small></b></div></div></section>{message && <p className="profileMessage" role="status">{message}</p>}{editing && <div className="profileModal"><form onSubmit={saveProfile}><header><h2>Edit profile</h2><button type="button" onClick={() => setEditing(false)}>×</button></header><label>Display name<input value={name} onChange={e => setName(e.target.value)} required/></label><label>Job role<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Product designer"/></label><label>Bio<textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={150} placeholder="Tell your workspace something about you…"/></label><small className="profileBioCount">{bio.length}/150</small><button className="primary">Save changes</button></form></div>}<section className="profilePosts"><header><div><p>{view === "posts" ? "YOUR POSTS" : view === "saved" ? "SAVED POSTS" : "ARCHIVE"}</p></div>{view !== "posts" && <button className="backPosts" onClick={() => setView("posts")}>View posts</button>}</header>{!shown.length ? <div className="profileEmpty">{view === "saved" ? "Save a post from your workspace and it will appear here." : view === "archive" ? "No archived posts yet." : "Your posts will appear here."}</div> : <div className="postGrid">{shown.map(post => <ProfilePostCard key={post.id} post={post} me={profile} refresh={load}/>)}</div>}</section></section>{postEditing && <div className="profileModal"><form onSubmit={savePost}><header><h2>Edit post</h2><button type="button" onClick={() => setPostEditing(null)}>×</button></header><label>Post text<textarea value={postBody} onChange={e => setPostBody(e.target.value)} maxLength={3000}/></label><button className="primary">Save changes</button></form></div>}{leaving && <div className="profileModal"><section className="leaveConfirm"><h2>Leave this workspace?</h2><p>You will lose access to its feed, files, and conversations. Your account will remain active and you can sign in again.</p><div><button onClick={() => setLeaving(false)}>Cancel</button><button className="danger primary" onClick={leaveWorkspace}>Leave workspace</button></div></section></div>}{photo && <PhotoPreview src={profile.avatar_url} name={profile.full_name || "Profile"} onClose={() => setPhoto(false)} actions={<><label>{uploading ? "Uploading..." : "Change picture"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label><button onClick={removePhoto}>Delete picture</button></>}/>} </main>;
}
