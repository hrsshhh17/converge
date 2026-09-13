/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, "")]; }));
const accounts = fs.readFileSync(path.join(root, "test-accounts.local.csv"), "utf8").trim().split(/\r?\n/).slice(1)
  .map((line) => { const [email, password] = line.split(","); return { email, password }; });
const demo = "18e36a0c-c2f9-4fc4-b663-5c62d591e35b";
const denied = "0b7465f7-7992-47a7-aa90-0e434c154c48";

(async () => {
  const failures = [];
  for (const account of accounts) {
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await client.auth.signInWithPassword(account);
    if (authError) { failures.push(`${account.email}: login`); continue; }
    const checks = await Promise.all([
      client.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", demo).eq("user_id", authData.user.id),
      client.from("channels").select("id", { count: "exact", head: true }).eq("workspace_id", demo),
      client.from("posts").select("id", { count: "exact", head: true }).eq("workspace_id", demo),
      client.from("channel_messages").select("id", { count: "exact", head: true }).eq("workspace_id", demo),
      client.from("direct_messages").select("id", { count: "exact", head: true }).eq("workspace_id", demo),
      client.from("workspace_events").select("id", { count: "exact", head: true }).eq("workspace_id", demo),
      client.from("direct_messages").select("id", { count: "exact", head: true }).eq("workspace_id", denied),
      client.from("channel_messages").select("id", { count: "exact", head: true }).eq("workspace_id", denied),
      client.from("call_signals").select("id", { count: "exact", head: true }).eq("workspace_id", denied),
      client.rpc("get_workspace_chat_identities", { target_workspace_id: denied }),
    ]);
    const errors = checks.filter((check) => check.error);
    const [membership, channels, posts, groupMessages, directMessages, events, deniedDm, deniedGroup, deniedCalls, deniedIdentities] = checks;
    if (errors.length || membership.count !== 1 || !channels.count || !posts.count || !groupMessages.count || !directMessages.count || !events.count
      || deniedDm.count !== 0 || deniedGroup.count !== 0 || deniedCalls.count !== 0 || (deniedIdentities.data || []).length !== 0) {
      failures.push(`${account.email}: content/privacy`);
    }
    await client.auth.signOut();
  }
  const result = { accounts: accounts.length, loginAndContentPass: accounts.length - failures.length, crossWorkspacePrivacyPass: accounts.length - failures.length, failures };
  console.log(JSON.stringify(result));
  if (failures.length) process.exit(1);
})().catch((error) => { console.error(error.message || error); process.exit(1); });
