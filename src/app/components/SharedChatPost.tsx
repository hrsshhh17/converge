"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import CommentThread, { type ThreadComment, type ThreadProfile } from "./CommentThread";
import PostShareDialog from "./PostShareDialog";
import "./shared-chat-post.css";

type PostPreview = {
  id: string;
  workspace_id: string;
  author_id: string;
  body: string;
  post_type: string;
  attachment_url: string | null;
  attachment_name: string | null;
  poll_options: string[] | null;
  created_at: string;
  author: ThreadProfile;
  likes: number;
  comments: number;
  liked: boolean;
  saved: boolean;
  votes: number[];
  voted: number | null;
};

const ActionIcon = ({ name }: { name: "heart" | "comment" | "share" | "save" }) => {
  const paths = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
    comment: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/></>,
    save: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

export default function SharedChatPost({ postId, workspaceId, me }: { postId: string; workspaceId: string; me: ThreadProfile }) {
  const [post, setPost] = useState<PostPreview | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<ThreadComment[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const client = createClient();
    const { data: row } = await client.from("posts").select("id,workspace_id,author_id,body,post_type,attachment_url,attachment_name,poll_options,created_at").eq("id", postId).eq("workspace_id", workspaceId).maybeSingle();
    if (!row) { setPost(null); return; }
    const [{ data: author }, { data: likes }, { count: commentCount }, { data: saveRow }, { data: pollVotes }] = await Promise.all([
      client.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id", workspaceId).eq("id", row.author_id).maybeSingle(),
      client.from("post_likes").select("user_id").eq("post_id", postId),
      client.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
      client.from("post_saves").select("post_id").eq("post_id", postId).eq("user_id", me.id).maybeSingle(),
      client.from("poll_votes").select("user_id,option_index").eq("post_id", postId),
    ]);
    const likeRows = likes || [];
    setPost({
      ...row,
      post_type: row.post_type || "update",
      attachment_url: row.attachment_url || null,
      attachment_name: row.attachment_name || null,
      author: (author || { id: row.author_id, full_name: "Member", avatar_url: null, job_title: null }) as ThreadProfile,
      likes: likeRows.length,
      comments: commentCount || 0,
      liked: likeRows.some(item => item.user_id === me.id),
      saved: !!saveRow,
      poll_options: row.poll_options || null,
      votes: (row.poll_options || []).map((_: string, index: number) => (pollVotes || []).filter(vote => vote.option_index === index).length),
      voted: (pollVotes || []).find(vote => vote.user_id === me.id)?.option_index ?? null,
    } as PostPreview);
  }, [me.id, postId, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!post) return;
    window.dispatchEvent(new Event("converge:chat-content-resized"));
  }, [post]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setExpanded(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [expanded]);

  const toggleLike = async () => {
    if (!post || busy) return;
    setBusy(true);
    const client = createClient();
    const result = post.liked
      ? await client.from("post_likes").delete().eq("post_id", post.id).eq("user_id", me.id)
      : await client.from("post_likes").upsert({ post_id: post.id, user_id: me.id }, { onConflict: "post_id,user_id" });
    setBusy(false);
    if (!result.error) await load();
  };

  const toggleSave = async () => {
    if (!post || busy) return;
    setBusy(true);
    const client = createClient();
    const result = post.saved
      ? await client.from("post_saves").delete().eq("post_id", post.id).eq("user_id", me.id)
      : await client.from("post_saves").insert({ post_id: post.id, user_id: me.id });
    setBusy(false);
    if (!result.error) await load();
  };

  const vote = async (index: number) => {
    if (!post || busy) return;
    setBusy(true);
    const { error } = await createClient().from("poll_votes").upsert({ post_id: post.id, user_id: me.id, option_index: index }, { onConflict: "post_id,user_id" });
    setBusy(false);
    if (!error) await load();
  };

  const openComments = async () => {
    if (!post) return;
    const client = createClient();
    const { data: rows } = await client.from("post_comments").select("id,author_id,body,created_at,parent_id,reply_to_id,pinned_at").eq("post_id", post.id).order("created_at");
    const ids = [...new Set((rows || []).map(row => row.author_id))];
    const { data: people } = ids.length
      ? await client.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id", workspaceId).in("id", ids)
      : { data: [] };
    const profiles = new Map((people || []).map(person => [person.id, person as ThreadProfile]));
    setComments((rows || []).map(row => ({ ...row, author: profiles.get(row.author_id) })));
  };

  if (!post) return <span className="sharedPostUnavailable">Post unavailable</span>;
  const video = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(post.attachment_name || post.attachment_url || "");

  return <>
    <article ref={root} className={`sharedPostCard ${expanded ? "isExpanded" : ""}`}>
      <div className="sharedPostSurface" role="button" tabIndex={0} onClick={() => setExpanded(value => !value)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpanded(value => !value); } }} aria-expanded={expanded}>
        <header>{post.author.avatar_url ? <img src={post.author.avatar_url} alt=""/> : <i>{(post.author.full_name || "M")[0]}</i>}<span><b>{post.author.full_name || "Member"}</b><small>{new Date(post.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</small></span></header>
        {post.attachment_url && post.post_type === "media" && (video ? <video muted playsInline preload="metadata" src={post.attachment_url}/> : <img className="sharedPostMedia" src={post.attachment_url} alt={post.attachment_name || "Shared post"}/>)}
        {post.body && <p>{post.body}</p>}
        {post.attachment_url && post.post_type === "file" && <span className="sharedPostFile">▣ {post.attachment_name || "Attached file"}</span>}
        {post.post_type === "poll" && post.poll_options && <div className="sharedPostPoll">{post.poll_options.map((option, index) => { const total = post.votes.reduce((sum, count) => sum + count, 0); const count = post.votes[index] || 0; const percent = total ? Math.round(count / total * 100) : 0; return <button type="button" className={post.voted === index ? "chosen" : ""} disabled={busy} key={`${option}-${index}`} onClick={event => { event.stopPropagation(); void vote(index); }}><i style={{ width: `${percent}%` }}/><span>{option}</span><b>{percent}%</b></button>; })}<small>{post.votes.reduce((sum, count) => sum + count, 0)} vote{post.votes.reduce((sum, count) => sum + count, 0) === 1 ? "" : "s"}</small></div>}
        <footer><span>♡ {post.likes}</span><span>○ {post.comments}</span><em>{expanded ? "Hide actions" : "Tap for actions"}</em></footer>
      </div>
      {expanded && <aside className="sharedPostActions" aria-label="Post actions">
        <button className={post.liked ? "active" : ""} disabled={busy} onClick={toggleLike} aria-label={post.liked ? "Unlike post" : "Like post"}><ActionIcon name="heart"/></button>
        <button onClick={openComments} aria-label="Comment on post"><ActionIcon name="comment"/></button>
        <button onClick={() => setSharing(true)} aria-label="Share post"><ActionIcon name="share"/></button>
        <button className={post.saved ? "active" : ""} disabled={busy} onClick={toggleSave} aria-label={post.saved ? "Remove saved post" : "Save post"}><ActionIcon name="save"/></button>
      </aside>}
    </article>
    {comments && <CommentThread workspaceId={workspaceId} postId={post.id} postAuthorId={post.author_id} me={me} comments={comments} onClose={() => setComments(null)} onRefresh={openComments}/>}
    {sharing && <PostShareDialog postId={post.id} workspaceId={workspaceId} meId={me.id} onClose={() => setSharing(false)} onShared={load}/>}
  </>;
}
