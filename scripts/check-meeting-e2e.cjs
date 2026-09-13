/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);

const accounts = fs.readFileSync("test-accounts.local.csv", "utf8").trim().split(/\r?\n/).slice(1).map((line) => {
  const [email, password] = line.split(",");
  return { email, password };
});
const workspaceId = "18e36a0c-c2f9-4fc4-b663-5c62d591e35b";
const base = "http://localhost:3000";

async function login(page, account) {
  await page.goto(`${base}/auth?mode=signin`);
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in →" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    await hostContext.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", { configurable: true, value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640; canvas.height = 360;
        canvas.getContext("2d").fillRect(0, 0, 640, 360);
        return canvas.captureStream(5);
      } });
    });
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await Promise.all([login(host, accounts[0]), login(guest, accounts[1])]);
    await guest.goto(`${base}/workspace/${workspaceId}`);
    await host.goto(`${base}/workspace/${workspaceId}?view=screen`);
    await host.getByRole("button", { name: "Start meeting" }).click();
    await host.getByText("You are hosting the meeting").waitFor({ timeout: 15000 });
    await guest.getByRole("dialog", { name: "Meeting invitation" }).waitFor({ timeout: 15000 });
    await guest.getByRole("button", { name: "Join meeting" }).click();
    await guest.waitForURL(/view=screen/);
    await guest.getByText(/Joined .* meeting/).waitFor({ timeout: 15000 });
    await guest.getByPlaceholder("Message everyone").fill("meeting-private-probe");
    await guest.locator(".meetingChat form button").click();
    await host.getByText("meeting-private-probe").waitFor({ timeout: 15000 });
    await guest.getByRole("button", { name: "Leave" }).click();
    await guest.getByText("No meeting is live").waitFor({ timeout: 10000 });
    await host.getByRole("button", { name: "End", exact: true }).click();
    await host.getByText("No meeting is live").waitFor({ timeout: 10000 });
    console.log(JSON.stringify({ invite: true, join: true, privateChat: true, guestLeaveCleanup: true, hostStopCleanup: true }));
  } finally {
    await hostContext.close();
    await guestContext.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
