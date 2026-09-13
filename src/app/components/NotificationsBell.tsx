"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";

type Notification = { id: string; actor_id: string; post_id: string | null; comment_id: string | null; kind: "post_like" | "post_comment" | "comment_reply" | "comment_like" | "mention" | "group_join"; created_at: string; read_at: string | null };
type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type CommentDetail = { body: string; reply_to_id: string | null };

const textFor = (notification: Notification, actor: string, comment = "") => {
  if (notification.kind === "post_like") return `${actor} liked your post.`;
  if (notification.kind === "post_comment") return comment ? <>{actor} commented <em className="notificationQuoted">“{comment}”</em> on your post.</> : `${actor} commented on your post.`;
  if (notification.kind === "comment_reply") return comment ? <>{actor} replied <em className="notificationQuoted">“{comment}”</em> to your comment.</> : `${actor} replied to your comment.`;
  if (notification.kind === "comment_like") return comment ? <>{actor} liked your comment <em className="notificationQuoted">“{comment}”</em>.</> : `${actor} liked your comment.`;
  if (notification.kind === "group_join") return `${actor} joined the All members chat.`;
  return `${actor} mentioned you in this post.`;
};

export default function NotificationsBell({ userId, workspaceId, sidebar = false }: { userId: string; workspaceId: string; sidebar?: boolean }) {
  const instanceId = useId();
  const bellRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [postLabels, setPostLabels] = useState<Record<string, string>>({});
  const [commentDetails, setCommentDetails] = useState<Record<string, CommentDetail>>({});
  const [open, setOpen] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [error, setError] = useState("");
  const unread = items.filter((item) => !item.read_at).length;
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const olderItems = items.filter((item) => new Date(item.created_at).getTime() < cutoff);
  const visibleItems = showOlder ? items : items.filter((item) => new Date(item.created_at).getTime() >= cutoff);
  const load = async () => {
    const client = createClient();
    const { data, error: loadError } = await client.from("activity_notifications").select("id,actor_id,post_id,comment_id,kind,created_at,read_at").eq("recipient_id", userId).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(40);
    if (loadError) { setError(`Notifications could not load: ${loadError.message}`); return; }
    setError("");
    const rows = (data || []) as Notification[];
    setItems(rows);
    const ids = [...new Set(rows.map((row) => row.actor_id))];
    if (ids.length) {
      const { data: profiles } = await client.from("workspace_profiles").select("id,full_name,avatar_url").eq("workspace_id",workspaceId).in("id", ids);
      setPeople(Object.fromEntries((profiles || []).map((profile) => [profile.id, profile as Profile])));
    }
    const postIds = [...new Set(rows.flatMap((row) => row.post_id ? [row.post_id] : []))];
    if (postIds.length) { const { data: posts } = await client.from("posts").select("id,body,post_type,attachment_name").in("id", postIds); setPostLabels(Object.fromEntries((posts || []).map((post) => [post.id, post.body?.trim().slice(0, 70) || post.attachment_name || (post.post_type === "poll" ? "Poll" : "Untitled post")]))); }
    const commentIds = [...new Set(rows.flatMap((row) => row.comment_id ? [row.comment_id] : []))];
    if (commentIds.length) { const { data: comments } = await client.from("post_comments").select("id,body,reply_to_id").in("id", commentIds); const parentIds = [...new Set((comments || []).flatMap((comment) => comment.reply_to_id ? [comment.reply_to_id] : []))]; const { data: parents } = parentIds.length ? await client.from("post_comments").select("id,body,reply_to_id").in("id", parentIds) : { data: [] }; setCommentDetails(Object.fromEntries([...(comments || []), ...(parents || [])].map((comment) => [comment.id, { body: comment.body.trim().replace(/^@\S+\s+/, "").slice(0, 120), reply_to_id: comment.reply_to_id }]))); }
  };
  useEffect(() => {
    load();
    const client = createClient();
    const channel = client.channel(`activity-notifications:${userId}:${instanceId}`).on("postgres_changes", { event: "*", schema: "public", table: "activity_notifications", filter: `recipient_id=eq.${userId}` }, load).subscribe();
    return () => { client.removeChannel(channel); };
  }, [userId]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!bellRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => {
    if (!open || !items.some((item) => !item.read_at)) return;
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    createClient().from("activity_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", userId).eq("workspace_id", workspaceId).is("read_at", null).then();
  }, [open, items, userId]);
  const visit = async (item: Notification) => {
    await createClient().from("activity_notifications").update({ read_at: new Date().toISOString() }).eq("id", item.id);
    setOpen(false);
    if (item.kind === "group_join") window.location.assign(`/workspace/${workspaceId}/groups`);
    else if (item.post_id && item.comment_id) window.location.assign(`/workspace/${workspaceId}?comment=${item.comment_id}#post-${item.post_id}`);
    else if (item.post_id) { const target = `post-${item.post_id}`; if(location.pathname!==`/workspace/${workspaceId}`)window.location.assign(`/workspace/${workspaceId}#${target}`);else{history.replaceState(null, "", `#${target}`); document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });} }
    load();
  };
  return <div ref={bellRef} className={`notificationsBell ${sidebar ? "sidebarBell" : ""} ${open ? "isOpen" : ""}`} onClick={(event) => { if (sidebar && !(event.target as Element).closest(".notificationPanel")) setOpen((current) => !current); }}><button type="button" className="notificationTrigger" aria-label="Notifications" onClick={() => { if (!sidebar) setOpen((current) => !current); }}><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 13h4"/></svg>{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</button>{sidebar && <span>Notifications</span>}{open && <aside className="notificationPanel"><header><strong>Notifications</strong></header>{error ? <p>{error}</p> : items.length ? <>{visibleItems.map((item) => { const person = people[item.actor_id]; const label = item.post_id ? postLabels[item.post_id] : ""; const detail = item.comment_id ? commentDetails[item.comment_id] : undefined; const parent = detail?.reply_to_id ? commentDetails[detail.reply_to_id] : undefined; return <button className={item.read_at ? "" : "unread"} key={item.id} onClick={() => visit(item)}>{person?.avatar_url ? <img src={person.avatar_url} alt=""/> : <i>{(person?.full_name || "M").slice(0, 1)}</i>}<span>{textFor(item, person?.full_name || "A member", detail?.body)}{item.kind === "comment_reply" && parent && label ? <em className="notificationContext">“{parent.body}” on the post “{label}”</em> : label && <em className="notificationContext">“{label}”</em>}<small>{new Date(item.created_at).toLocaleString()}</small></span></button>; })}{!showOlder && olderItems.length > 0 && <button type="button" className="notificationMore" onClick={() => setShowOlder(true)}>---------------- show more ----------------</button>}</> : <p>No notifications yet.</p>}</aside>}</div>;
}
