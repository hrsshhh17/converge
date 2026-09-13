/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const parseEnv = (name) => Object.fromEntries(
  fs.readFileSync(path.join(root, name), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const parseCsv = () => fs.readFileSync(path.join(root, "test-accounts.local.csv"), "utf8")
  .trim().split(/\r?\n/).slice(1).map((line) => {
    const [email, password] = line.split(",");
    return { email, password };
  });

const env = parseEnv(".env.local");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const allowedWorkspace = "18e36a0c-c2f9-4fc4-b663-5c62d591e35b";
const deniedWorkspace = "ff1f9736-f96e-47e6-bf10-9c15064c1871";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(account) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword(account);
  if (error) throw error;
  return client;
}

async function subscribe(client, topic, expectSuccess = true) {
  const channel = client.channel(topic, { config: { private: true } });
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 10000);
    channel.subscribe((value) => {
      if (value === "SUBSCRIBED" || value === "CHANNEL_ERROR" || value === "TIMED_OUT") {
        clearTimeout(timer);
        resolve(value);
      }
    });
  });
  if (expectSuccess && status !== "SUBSCRIBED") throw new Error(`${topic}: expected SUBSCRIBED, got ${status}`);
  if (!expectSuccess && status === "SUBSCRIBED") throw new Error(`${topic}: non-member subscribed`);
  return { channel, status };
}

async function exchange(sender, receiver, topic, event) {
  const received = new Promise(async (resolve, reject) => {
    const channel = receiver.channel(topic, { config: { private: true } })
      .on("broadcast", { event }, ({ payload }) => resolve(payload));
    const timer = setTimeout(() => reject(new Error(`${topic}: broadcast not received`)), 10000);
    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      const sending = sender.channel(topic, { config: { private: true } });
      sending.subscribe(async (senderStatus) => {
        if (senderStatus !== "SUBSCRIBED") return;
        const result = await sending.send({ type: "broadcast", event, payload: { probe: topic } });
        if (result !== "ok") reject(new Error(`${topic}: send returned ${result}`));
      });
    });
    resolve.cleanup = () => clearTimeout(timer);
  });
  const payload = await received;
  if (payload.probe !== topic) throw new Error(`${topic}: payload mismatch`);
}

(async () => {
  const accounts = parseCsv();
  const a = await login(accounts[0]);
  const b = await login(accounts[1]);
  const topics = [
    `call:${allowedWorkspace}:qa-private-pair`,
    `group-call:${allowedWorkspace}`,
    `workspace-meeting:${allowedWorkspace}`,
  ];
  for (const [index, topic] of topics.entries()) await exchange(a, b, topic, `probe-${index}`);
  const denied = [];
  for (const topic of [`call:${deniedWorkspace}:blocked`, `group-call:${deniedWorkspace}`, `workspace-meeting:${deniedWorkspace}`]) {
    const result = await subscribe(a, topic, false);
    denied.push({ topic: topic.split(":")[0], status: result.status });
    await a.removeChannel(result.channel);
  }
  await wait(100);
  await a.removeAllChannels();
  await b.removeAllChannels();
  await a.auth.signOut();
  await b.auth.signOut();
  console.log(JSON.stringify({ authorizedBroadcasts: topics.length, deniedSubscriptions: denied.length, denied }));
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
