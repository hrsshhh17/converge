"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { DEMO_ACCOUNTS } from "../../lib/demo-accounts";
import "./auth.css";
import "./auth-mobile-fix.css";
import "./auth-tabs-links.css";

function Mark() {
  return <svg viewBox="0 0 64 58" aria-hidden="true">
    <path d="M32 29C22 11 7 11 7 24c0 11 11 15 25 5"/>
    <path d="M32 29C52 11 59 24 54 35c-4 9-16 6-22-6"/>
    <path d="M32 29C29 53 14 52 13 39c0-11 11-14 19-10"/>
    <circle cx="32" cy="29" r="4"/>
  </svg>;
}

export default function AuthForm({ initialMode, nextPage }: { initialMode: "signin" | "signup"; nextPage: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);
  const signup = initialMode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const client = createClient();
      const result = signup
        ? await client.auth.signUp({ email, password, options: { data: { full_name: name } } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        setMessage(result.error.message);
        window.alert(`Sign in failed: ${result.error.message}`);
        return;
      }
      if (signup && !result.data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
        return;
      }
      window.location.assign(nextPage);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not reach the sign-in service.";
      setMessage(detail);
      window.alert(`Sign in failed: ${detail}`);
    } finally {
      setLoading(false);
    }
  }

  return <main className="authPage">
    <Link className="authBrand" href="/"><Mark/><span>CONVERGE</span></Link>
    <section className="authPanel">
      <p className="eyebrow">YOUR TEAM SPACE STARTS HERE</p>
      <h1>{signup ? "Build your team's new home." : "Welcome back to the flow."}</h1>
      <p className="authIntro">{signup ? "Create your account, then shape a workspace around how your people work." : "Sign in to continue into your Converge workspace."}</p>
      <div className="authTabs">
        <Link className={signup ? "active" : ""} href={`/auth?mode=signup${nextPage !== "/dashboard" ? `&next=${encodeURIComponent(nextPage)}` : ""}`}>Create account</Link>
        <Link className={!signup ? "active" : ""} href="/auth?mode=signin">Sign in</Link>
      </div>
      {!signup && <aside className="demoAccess">
        <header><span><small>LIVE PRODUCT DEMO</small><b>Explore as a teammate</b></span><em>20 personas</em></header>
        <select aria-label="Choose demo teammate" value={demoIndex} onChange={(event) => setDemoIndex(Number(event.target.value))}>
          {DEMO_ACCOUNTS.map((account, index) => <option value={index} key={account.email}>{account.name} · {account.role}</option>)}
        </select>
        <div><span><small>Email</small><code>{DEMO_ACCOUNTS[demoIndex].email}</code></span><span><small>Password</small><code>{DEMO_ACCOUNTS[demoIndex].password}</code></span></div>
        <button type="button" onClick={() => { setEmail(DEMO_ACCOUNTS[demoIndex].email); setPassword(DEMO_ACCOUNTS[demoIndex].password); setMessage(""); }}>Use these credentials</button>
        <p>Opens the populated “Converge Demo Studio” workspace. Demo activity is isolated from real workspaces.</p>
      </aside>}
      <form action="/auth/submit" method="post" onSubmit={submit}>
        <input type="hidden" name="mode" value={signup ? "signup" : "signin"}/>
        <input type="hidden" name="next" value={nextPage}/>
        {signup && <label>Full name<input name="name" value={name} onChange={(event) => setName(event.target.value)} required placeholder="Your full name"/></label>}
        <label>Email address<input name="email" value={email} onChange={(event) => setEmail(event.target.value)} required type="email" placeholder="you@example.com"/></label>
        <label>Password<input name="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} type="password" placeholder="At least 6 characters"/></label>
        {message && <p className="authMessage">{message}</p>}
        <button className="authSubmit" disabled={loading}>{loading ? "Please wait..." : signup ? "Create account →" : "Sign in →"}</button>
      </form>
      <p className="authFoot">Human connection, clear context, and a workspace that feels like yours.</p>
    </section>
    <div className="authGlow" aria-hidden="true"><i/><i/><i/></div>
  </main>;
}
