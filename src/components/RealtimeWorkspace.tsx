"use client";

import { useEffect } from "react";
import { createClient } from "../lib/supabase/client";
import WorkspaceEnhancements from "../app/components/WorkspaceEnhancements";

export default function RealtimeWorkspace({ workspaceId, refresh }: { workspaceId: string; refresh: () => void }) {
  useEffect(() => {
    const supabase = createClient();
    let refreshTimer:number|undefined;
    const sync=()=>{window.clearTimeout(refreshTimer);refreshTimer=window.setTimeout(refresh,120)};
    const channel = supabase.channel(`workspace:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts", filter: `workspace_id=eq.${workspaceId}` }, sync)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, sync)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, sync)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_shares" }, sync)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, sync)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_profiles", filter: `workspace_id=eq.${workspaceId}` }, sync)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` }, sync)
      .on("postgres_changes", { event: "*", schema: "public", table: "channels", filter: `workspace_id=eq.${workspaceId}` }, sync)
      .subscribe();
    const visible=()=>{if(document.visibilityState==="visible")sync()};
    const fallback=window.setInterval(visible,30000);
    window.addEventListener("focus",sync);document.addEventListener("visibilitychange",visible);
    return () => { window.clearTimeout(refreshTimer);window.clearInterval(fallback);window.removeEventListener("focus",sync);document.removeEventListener("visibilitychange",visible);void supabase.removeChannel(channel); };
  }, [workspaceId, refresh]);
  useEffect(() => {
    const supabase=createClient();
    const touch=()=>void supabase.rpc("touch_workspace_presence",{target_workspace_id:workspaceId});
    touch();
    const heartbeat=window.setInterval(touch,20000);
    const visible=()=>{if(document.visibilityState==="visible")touch()};
    document.addEventListener("visibilitychange",visible);
    return()=>{window.clearInterval(heartbeat);document.removeEventListener("visibilitychange",visible)};
  },[workspaceId]);
  return <WorkspaceEnhancements workspaceId={workspaceId}/>;
}
