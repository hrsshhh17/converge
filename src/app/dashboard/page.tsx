"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import "./dashboard.css";
import "./dashboard-mobile-fix.css";
import "./dashboard-mobile-fix.css";

type Workspace = { id: string; name: string; personality: string; privacy: string; created_at: string; avatar_url: string | null };
const Mark = () => <svg viewBox="0 0 64 58" aria-label="Converge logo"><path d="M32 29C22 11 7 11 7 24c0 11 11 15 25 5"/><path d="M32 29C52 11 59 24 54 35c-4 9-16 6-22-6"/><path d="M32 29C29 53 14 52 13 39c0-11 11-14 19-10"/><circle cx="32" cy="29" r="4"/></svg>;

export default function DashboardPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("there");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/auth"); return; }
    setName(user.user_metadata.full_name || user.email?.split("@")[0] || "there");
    const { data } = await supabase.from("workspaces").select("id,name,personality,privacy,created_at").order("created_at", { ascending: false });
    const rows = data || [];
    const ids = rows.map((space) => space.id);
    const { data: groups } = ids.length ? await supabase.from("channels").select("workspace_id,avatar_url,created_at").in("workspace_id", ids).eq("kind", "group").eq("is_workspace_group", true).order("created_at", { ascending: true }) : { data: [] };
    const avatars = new Map<string, string | null>();
    for (const group of groups || []) if (!avatars.has(group.workspace_id)) avatars.set(group.workspace_id, group.avatar_url || null);
    setWorkspaces(rows.map((space) => ({ ...space, avatar_url: avatars.get(space.id) || null })));
    setLoading(false);
  }, [router]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const supabase = createClient();
    const channel = supabase.channel("dashboard-workspaces").on("postgres_changes", { event: "*", schema: "public", table: "channels" }, () => void load()).on("postgres_changes", { event: "*", schema: "public", table: "workspaces" }, () => void load()).on("postgres_changes", { event: "*", schema: "public", table: "workspace_members" }, () => void load()).subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [load]);
  return <main className="hubPage">
    <header className="hubHeader"><Link href="/" className="hubBrand"><Mark/><span>CONVERGE</span></Link><div><span>{name}</span><button onClick={async () => { await createClient().auth.signOut(); router.push("/"); }}>Sign out</button></div></header>
    <section className="hubHero"><p className="hubEyebrow">YOUR WORKSPACES</p><h1>Where do you want<br/>to <em>converge?</em></h1><p>Choose a team space, or create a new one around the work waiting for you.</p><Link className="hubCreate" href="/onboarding">+ Create workspace</Link></section>
    <section className="workspaceList"><div className="listHeader"><h2>{loading ? "Finding your spaces..." : `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`}</h2><span>Your spaces travel with you.</span></div>{!loading && !workspaces.length && <div className="emptySpaces"><b>No workspace yet.</b><p>Your first space is waiting.</p><Link href="/onboarding">Create your first workspace</Link></div>}<div className="workspaceCards">{workspaces.map((space, index) => <Link key={space.id} href={`/workspace/${space.id}`} className="workspaceCard"><span className={`cardMark mark${index % 4}`}>{space.avatar_url ? <Image src={space.avatar_url} alt={`${space.name} workspace`} width={46} height={46} unoptimized/> : space.name[0]?.toUpperCase()}</span><div><small>{space.personality} · {space.privacy}</small><h3>{space.name}</h3><p>Enter workspace</p></div></Link>)}</div></section>
  </main>;
}
