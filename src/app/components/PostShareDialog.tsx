"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import "./post-share-dialog.css";

type Member = { id: string; full_name: string | null; avatar_url: string | null; job_title: string | null };
type Group = { id: string; name: string; kind: string; avatar_url: string | null };

export default function PostShareDialog({ postId, workspaceId, meId, onClose, onShared }: { postId: string; workspaceId: string; meId: string; onClose: () => void; onShared: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/workspace/${workspaceId}#post-${postId}`;

  useEffect(() => {
    const load = async () => {
      const client = createClient();
      const { data: memberRows, error: memberError } = await client.from("workspace_members").select("user_id").eq("workspace_id", workspaceId);
      if (memberError) { setNotice(memberError.message); return; }
      const ids = (memberRows || []).map(row => row.user_id).filter(id => id !== meId);
      const [{ data: people }, { data: channelRows, error: groupError }] = await Promise.all([
        ids.length ? client.from("workspace_profiles").select("id,full_name,avatar_url,job_title").eq("workspace_id",workspaceId).in("id", ids) : Promise.resolve({ data: [] as Member[] }),
        client.from("channels").select("id,name,kind,avatar_url").eq("workspace_id", workspaceId).eq("kind", "group").order("name"),
      ]);
      setMembers((people || []) as Member[]);
      setGroups((channelRows || []) as Group[]);
      if (groupError) setNotice(groupError.message);
    };
    load();
  }, [workspaceId, meId]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", close);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", close); };
  }, [onClose]);

  const recordShare = async () => createClient().from("post_shares").insert({ post_id: postId, user_id: meId });
  const deliver = async (targetId: string, kind: "member" | "group") => {
    setSending(`${kind}:${targetId}`); setNotice("");
    const client = createClient();
    const payload = { workspace_id: workspaceId, sender_id: meId, post_id: postId, body: link, message_type: "shared_post" };
    const { error } = kind === "member"
      ? await client.from("direct_messages").insert({ ...payload, recipient_id: targetId })
      : await client.from("channel_messages").insert({ ...payload, channel_id: targetId });
    if (error) { setNotice(`${error.message} Run post-share-delivery-migration.sql in Supabase if this is a new setup.`); setSending(null); return; }
    const { error: shareError } = await recordShare();
    if (shareError) { setNotice("Message sent, but the share count could not be updated."); } else { setNotice(kind === "member" ? "Post sent in a direct message." : "Post sent to the group."); onShared(); }
    setSending(null);
  };
  const copy = async () => {
    setSending("copy"); setNotice("");
    try { await navigator.clipboard.writeText(link); const { error } = await recordShare(); setNotice(error ? "Link copied, but the share count could not be updated." : "Link copied."); if (!error) onShared(); }
    catch { setNotice("Could not copy automatically. Select the link and copy it manually."); }
    finally { setSending(null); }
  };

  return <div className="modal workspaceDialog shareDialog" role="dialog" aria-modal="true" aria-label="Share post" onMouseDown={event => event.target === event.currentTarget && onClose()}><section><header><span><p>SHARE POST</p><h2>Send to workspace</h2></span><button aria-label="Close share dialog" onClick={onClose}>×</button></header><div className="shareLink"><input aria-label="Post link" readOnly value={link} onFocus={event => event.target.select()}/><button onClick={copy} disabled={sending === "copy"} aria-label="Copy post link" title="Copy post link">⧉</button></div><p className="shareHelp">Send a full post card to a member or group. Only workspace members can open it.</p><div className="shareRecipients"><div className="shareSection"><b>MEMBERS</b>{members.length ? members.map(member => <div className="shareRecipient" key={member.id}>{member.avatar_url ? <img src={member.avatar_url} alt=""/> : <i>{(member.full_name || "M").slice(0, 1)}</i>}<span><strong>{member.full_name || "Member"}</strong><small>{member.job_title || "Workspace member"}</small></span><button onClick={() => deliver(member.id, "member")} disabled={!!sending}>{sending === `member:${member.id}` ? "Sending..." : "Send"}</button></div>) : <p className="shareEmpty">No other members yet.</p>}</div><div className="shareSection"><b>GROUPS</b>{groups.length ? groups.map(group => <div className="shareRecipient" key={group.id}>{group.avatar_url?<img src={group.avatar_url} alt=""/>:<i>♧</i>}<span><strong>{group.name}</strong><small>Group</small></span><button onClick={() => deliver(group.id, "group")} disabled={!!sending}>{sending === `group:${group.id}` ? "Sending..." : "Send"}</button></div>) : <p className="shareEmpty">No groups have been created yet. They will appear here automatically.</p>}</div></div>{notice && <p className="shareNotice" role="status">{notice}</p>}</section></div>;
}
