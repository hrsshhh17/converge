"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import "./join.css";

export default function JoinWorkspacePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [message, setMessage] = useState("Checking your invitation…");
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) setMessage("Sign in or create an account to join this workspace.");
      else setMessage("You are ready to join this workspace.");
    });
  }, []);
  const join = async () => {
    setJoining(true);
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) { router.push(`/auth?next=${encodeURIComponent(`/join/${token}`)}`); return; }
    const { data, error } = await client.rpc("join_workspace_by_invite", { invite_token: token });
    if (error || !data) { setJoining(false); setMessage(error?.message || "This invite could not be used."); return; }
    router.replace(`/workspace/${data}`); router.refresh();
  };
  return <main className="joinPage"><section><Link href="/" className="joinBrand">◌ CONVERGE</Link><p className="joinLabel">WORKSPACE INVITATION</p><h1>Join your team’s space.</h1><p>{message}</p><form action={`/join/${token}/submit`} method="post"><button onClick={join} disabled={joining}>{joining ? "Joining…" : "Join workspace"}</button></form></section></main>;
}
