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
      const sent = [], inserts = [];
      const channel = {
        on(type, filter, handler) { if (type === "broadcast") signalHandler = handler; return this; },
        subscribe(handler) { handler?.("SUBSCRIBED"); return this; },
        async send(message) { sent.push(message.payload); return "ok"; },
      };
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
        async maybeSingle() { return { data: { id: "main-group", full_name: "QA Host" }, error: null }; },
        async insert(payload) { inserts.push(payload); return { error: null }; },
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
        async setRemoteDescription() { this.remoteDescription = true; }
        async addIceCandidate() {}
        close() { this.connectionState = "closed"; }
      };
      const exports = {};
      new Function("require", "exports", compiled)(
        (name) => name.includes("supabase") ? { createClient: () => client }
          : name.includes("ringtone") ? { callDuration: () => "0:01", startRingtone: () => () => {} } : {},
        exports,
      );
      const detach = exports.attachGroupCallRuntime({ workspaceId: "workspace", channelId: "target-group", meId: "me" });
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Voice call");
      document.body.append(button);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 25));
      const ring = sent.find((signal) => signal.type === "ring");
      if (!ring?.callId || ring.channelId !== "target-group") throw new Error("Ring was not scoped to the exact group session");
      await signalHandler({ payload: { type: "join", from: "peer", name: "QA Peer", workspaceId: "workspace", channelId: "wrong-group", callId: ring.callId } });
      if (peer) throw new Error("A participant from another group entered the call");
      await signalHandler({ payload: { type: "join", from: "peer", name: "QA Peer", workspaceId: "workspace", channelId: "target-group", callId: ring.callId } });
      await signalHandler({ payload: { type: "join", from: "peer-2", name: "QA Peer Two", workspaceId: "workspace", channelId: "target-group", callId: ring.callId } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const offerTargets = sent.filter((signal) => signal.type === "offer").map((signal) => signal.to).sort();
      if (offerTargets.join(",") !== "peer,peer-2") throw new Error(`Every participant did not join the same call mesh: ${JSON.stringify(offerTargets)}`);
      peer.connectionState = "connected";
      peer.onconnectionstatechange();
      await signalHandler({ payload: { type: "leave", from: "peer", name: "QA Peer", workspaceId: "workspace", channelId: "target-group", callId: ring.callId } });
      await signalHandler({ payload: { type: "leave", from: "peer-2", name: "QA Peer Two", workspaceId: "workspace", channelId: "target-group", callId: ring.callId } });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const autoEnded = !document.querySelector(".groupCallOverlay") && trackStopped;
      const leaveSent = sent.some((signal) => signal.type === "leave");
      detach();
      await new Promise((resolve) => setTimeout(resolve, 25));
      const log = inserts.find((payload) => payload?.body?.startsWith?.("Group voice call"));
      if (!autoEnded || !leaveSent) throw new Error("Group call did not auto-end after the last peer left");
      if (log?.channel_id !== "target-group") throw new Error("Call log was not saved to the originating group");
      return { sessionScoped: true, multiParticipantMesh: offerTargets.length === 2, connected: true, lastPeerLeft: true, autoEnded, mediaStopped: trackStopped, logChannel: log.channel_id };
    }, code);
    console.log(result);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
