"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import NotificationsBell from "./NotificationsBell";
import WorkspaceMembers from "./WorkspaceMembers";
import WorkspaceSearch from "./WorkspaceSearch";
import "../workspace/[workspaceId]/members.css";
import "../workspace/[workspaceId]/notifications.css";
import "./mobile-workspace-chrome.css";

type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type ChromeData = { me: Profile; owner: boolean; cachedAt: number };
const chromeCache = new Map<string, ChromeData>();
type IconName = "home" | "message" | "folder" | "calendar" | "screen" | "grid" | "plus" | "search" | "more" | "spark";
const paths: Record<IconName, string> = {
  home: "M3 11 12 3l9 8v10h-6v-7H9v7H3V11Z",
  message: "M21 15a4 4 0 0 1-4 4H8l-5 3v-4a4 4 0 0 1-1-3V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4v8Z",
  folder: "M3 5h6l2 2h10v13H3V5Z",
  calendar: "M4 5h16v16H4V5Zm0 5h16M8 2v6m8-6v6",
  screen: "M3 4h18v13H3V4Zm5 17h8m-4-4v4m0-13v6m-3-3 3 3 3-3",
  grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
  plus: "M12 5v14M5 12h14",
  search: "m21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  spark: "m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z",
};
const initials = (name: string) => (name.split(" ").map((part) => part[0]).join("").slice(0, 2) || "M").toUpperCase();
const mobileThemes = [
  { id: "ember", name: "Ember", colors: ["#100c0a", "#ff6748"] },
  { id: "light", name: "Light", colors: ["#f7f3ef", "#d85c3f"] },
  { id: "midnight", name: "Midnight", colors: ["#080d19", "#6987ff"] },
  { id: "forest", name: "Forest", colors: ["#08130f", "#4fc487"] },
  { id: "ocean", name: "Ocean", colors: ["#07151a", "#40b8cf"] },
  { id: "plum", name: "Plum", colors: ["#160b19", "#c873de"] },
];
function Icon({ name }: { name: IconName }) { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]}/></svg>; }
function Mark() { return <svg className="mobileConvergeMark" viewBox="0 0 64 58" aria-hidden="true"><path d="M32 29C22 11 7 11 7 24c0 11 11 15 25 5"/><path d="M32 29C52 11 59 24 54 35c-4 9-16 6-22-6"/><path d="M32 29C29 53 14 52 13 39c0-11 11-14 19-10"/><circle cx="32" cy="29" r="4"/></svg>; }

export default function MobileWorkspaceChrome({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [owner, setOwner] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState("ember");
  const load = useCallback(async (force = false) => {
    const cached = chromeCache.get(workspaceId);
    if (!force && cached && Date.now() - cached.cachedAt < 30_000) {
      setMe(cached.me);
      setOwner(cached.owner);
      return;
    }
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    const [{ data: profile }, { data: workspace }] = await Promise.all([
      client.from("workspace_profiles").select("id,full_name,avatar_url").eq("workspace_id", workspaceId).eq("id", user.id).maybeSingle(),
      client.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle(),
    ]);
    const nextMe = (profile || { id: user.id, full_name: user.email?.split("@")[0] || "Member", avatar_url: null }) as Profile;
    const nextOwner = workspace?.owner_id === user.id;
    chromeCache.set(workspaceId, { me: nextMe, owner: nextOwner, cachedAt: Date.now() });
    setMe(nextMe);
    setOwner(nextOwner);
  }, [workspaceId]);
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);
  useEffect(() => {
    const client = createClient();
    const channel = client.channel(`mobile-chrome:${workspaceId}`).on("postgres_changes", { event: "*", schema: "public", table: "workspace_profiles", filter: `workspace_id=eq.${workspaceId}` }, () => void load(true)).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load, workspaceId]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest(".mobileWorkspaceMenu,[aria-label='Workspace menu']")) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [menuOpen]);
  useEffect(() => {
    if (!searchOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest(".mobileWorkspaceSearch,[aria-label='Search workspace']")) return;
      setSearchOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [searchOpen]);
  const chatRoot = `/workspace/${workspaceId}/messages`;
  const chatDetail = pathname.startsWith(`${chatRoot}/`);
  const createPost = () => {
    setMenuOpen(false);
    sessionStorage.setItem(`converge:open-compose:${workspaceId}`, "1");
    if (pathname === `/workspace/${workspaceId}`) window.dispatchEvent(new CustomEvent("converge:open-compose"));
    else router.push(`/workspace/${workspaceId}`);
  };
  const openThemePicker = () => {
    if (!me) return;
    const key = `converge:workspace-theme:${workspaceId}:${me.id}`;
    setTheme(localStorage.getItem(key) || "ember");
    setMenuOpen(false);
    setThemeOpen(true);
  };
  const applyTheme = (next: string) => {
    if (!me) return;
    localStorage.setItem(`converge:workspace-theme:${workspaceId}:${me.id}`, next);
    setTheme(next);
    window.requestAnimationFrame(() => {
      document.documentElement.dataset.workspaceTheme = next;
      const shell = document.querySelector<HTMLElement>(".workspaceShell");
      if (shell) shell.dataset.workspaceTheme = next;
      window.dispatchEvent(new CustomEvent("converge:theme-change", { detail: { workspaceId, theme: next } }));
    });
    setThemeOpen(false);
  };
  if (chatDetail) return null;
  return <>
    <div className="mobileWorkspaceChrome">
    <header className="mobileWorkspaceTop">
      <Link className="mobileWorkspaceBrand" href={`/workspace/${workspaceId}`} aria-label="Converge workspace home"><Mark/><b>CONVERGE</b></Link>
      <button aria-label="Search workspace" aria-expanded={searchOpen} onClick={() => { setSearchOpen((value) => !value); setMenuOpen(false); }}><Icon name="search"/></button>
      {me && <NotificationsBell userId={me.id} workspaceId={workspaceId}/>}
      <button aria-label="Workspace menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen((value) => !value); setSearchOpen(false); }}><Icon name="more"/></button>
      {searchOpen && <div className="mobileWorkspaceSearch"><WorkspaceSearch workspaceId={workspaceId} onPost={(id) => { setSearchOpen(false); router.push(`/workspace/${workspaceId}#post-${id}`); }}/></div>}
      {menuOpen && <aside className="mobileWorkspaceMenu">
        <strong>Workspace menu</strong>
        {owner && <WorkspaceMembers workspaceId={workspaceId} owner variant="menu"/>}
        <button onClick={createPost}><Icon name="plus"/>Create post</button>
        <Link onClick={() => setMenuOpen(false)} href={`/workspace/${workspaceId}/files`}><Icon name="folder"/>Files</Link>
        <Link onClick={() => setMenuOpen(false)} href={`/workspace/${workspaceId}?view=calendar`}><Icon name="calendar"/>Calendar</Link>
        <Link onClick={() => setMenuOpen(false)} href={`/workspace/${workspaceId}?view=screen`}><Icon name="screen"/>Meeting</Link>
        <Link onClick={() => setMenuOpen(false)} href="/dashboard"><Icon name="grid"/>All workspaces</Link>
        <button disabled={!me} onClick={openThemePicker}><Icon name="spark"/>Change theme</button>
      </aside>}
    </header>
    {themeOpen && <div className="mobileThemeDialog" role="dialog" aria-modal="true" aria-label="Choose workspace theme" onPointerDown={(event) => event.target === event.currentTarget && setThemeOpen(false)}>
      <section>
        <header><span><small>APPEARANCE</small><b>Choose workspace theme</b></span><button aria-label="Close theme picker" onClick={() => setThemeOpen(false)}>×</button></header>
        <div>{mobileThemes.map((item) => <button className={theme === item.id ? "active" : ""} onClick={() => applyTheme(item.id)} key={item.id}><i style={{ background: `linear-gradient(135deg,${item.colors[0]} 50%,${item.colors[1]} 50%)` }}/><span>{item.name}</span>{theme === item.id && <em>✓</em>}</button>)}</div>
      </section>
    </div>}
    </div>
    <nav className="mobileWorkspaceBottom" aria-label="Workspace navigation">
      <Link className={pathname === `/workspace/${workspaceId}` ? "active" : ""} href={`/workspace/${workspaceId}`} aria-label="Home"><Icon name="home"/></Link>
      <Link className={pathname.startsWith(chatRoot) ? "active" : ""} href={chatRoot} aria-label="Messages"><Icon name="message"/></Link>
      <Link className="mobileWorkspaceAi" href={`/workspace/${workspaceId}?view=ai`} aria-label="Converge AI"><Icon name="spark"/></Link>
      <Link className={pathname.endsWith("/files") ? "active" : ""} href={`/workspace/${workspaceId}/files`} aria-label="Files"><Icon name="folder"/></Link>
      <Link className={pathname.startsWith("/profile") ? "active" : ""} href={`/profile?workspace=${workspaceId}`} aria-label="Profile">{me?.avatar_url ? <Image src={me.avatar_url} alt="Your profile" width={28} height={28} unoptimized/> : <i>{initials(me?.full_name || "Member")}</i>}</Link>
    </nav>
  </>;
}
