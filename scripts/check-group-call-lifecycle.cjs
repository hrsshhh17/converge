/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-this-alias */
const fs = require("fs");
const ts = require("typescript");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.goto("http://localhost:3000");
    const code = ts.transpileModule(
      fs.readFileSync("src/app/components/group-call.ts", "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
    ).outputText;
    const result = await page.evaluate(async (compiled) => {
      let signalHandler;
      let peer;
      let trackStopped = false;
      const sent = [];
      const channel = {
        on(type, filter, handler) { if (type === "broadcast") signalHandler = handler; return this; },
        subscribe(handler) { handler?.("SUBSCRIBED"); return this; },
        async send(message) { sent.push(message.payload); return "ok"; },
      };
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
        async maybeSingle() { return { data: { id: "main-group", full_name: "QA Host" }, error: null }; },
        async insert() { return { error: null }; },
        then(resolve) { return Promise.resolve({ data: { full_name: "QA Host" }, error: null }).then(resolve); },
      };
      const client = { channel: () => channel, from: () => query, removeChannel: async () => {} };
      const track = { id: "audio-track", kind: "audio", enabled: true, stop() { trackStopped = true; } };
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
        getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] }),
      } });
      Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, set() {}, get() { return null; } });
      window.RTCPeerConnection = class {
        constructor() { peer = this; this.connectionState = "new"; }
        addTrack() {}
        async createOffer() { return { type: "offer", sdp: "test" }; }
        async setLocalDescription() {}
        close() { this.connectionState = "closed"; }
      };
      const exports = {};
      new Function("require", "exports", compiled)(
        (name) => name.includes("supabase") ? { createClient: () => client }
          : name.includes("ringtone") ? { callDuration: () => "0:01", startRingtone: () => () => {} } : {},
        exports,
      );
      const detach = exports.attachGroupCallRuntime({ workspaceId: "workspace", meId: "me" });
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Voice call");
      document.body.append(button);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 25));
      await signalHandler({ payload: { type: "join", from: "peer", name: "QA Peer" } });
      peer.connectionState = "connected";
      peer.onconnectionstatechange();
      await signalHandler({ payload: { type: "leave", from: "peer", name: "QA Peer" } });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const autoEnded = !document.querySelector(".groupCallOverlay") && trackStopped;
      const leaveSent = sent.some((signal) => signal.type === "leave");
      detach();
      if (!autoEnded || !leaveSent) throw new Error("Group call did not auto-end after the last peer left");
      return { connected: true, lastPeerLeft: true, autoEnded, mediaStopped: trackStopped };
    }, code);
    console.log(result);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
