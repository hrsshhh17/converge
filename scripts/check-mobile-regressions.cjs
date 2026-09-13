const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);

(async () => {
  const source = {
    meeting: fs.readFileSync("src/app/components/WorkspaceScreenShare.tsx", "utf8"),
    comments: fs.readFileSync("src/app/components/CommentThread.tsx", "utf8"),
    navigation: fs.readFileSync("src/app/components/WorkspaceEnhancements.tsx", "utf8"),
  };
  if (!source.meeting.includes("getUserMedia({video:{facingMode:\"user\"},audio:true})")) throw new Error("Mobile meeting fallback missing");
  if (!source.comments.includes("comment_likes\").insert(")) throw new Error("Comment like still uses upsert");
  if (!source.navigation.includes("useSearchParams") || !source.navigation.includes("searchParams.get(\"view\")")) throw new Error("Query navigation sync missing");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto("http://localhost:3000");
    await page.addStyleTag({ path: "src/app/workspace/[workspaceId]/members.css" });
    await page.addStyleTag({ path: "src/app/components/chat.css" });
    await page.addStyleTag({ path: "src/app/components/group-message-actions.css" });
    await page.addStyleTag({ path: "src/app/components/chat-emoji-overrides.css" });
    const layout = await page.evaluate(() => {
      document.body.innerHTML = `<div class="modal membersDialog"><section><header>Members</header><div></div><div></div><div class="memberList">${Array.from({length:21},(_,i)=>`<div>Member ${i+1}</div>`).join("")}</div></section></div><form class="chatComposer"><aside class="chatEmoji"></aside></form><article class="chatMessage"><button class="messageOptionsButton">...</button></article>`;
      const list = document.querySelector(".memberList"), section = document.querySelector(".membersDialog>section"), emoji = document.querySelector(".chatEmoji"), dots = document.querySelector(".messageOptionsButton");
      return { memberScrollable:list.scrollHeight>list.clientHeight, modalFits:section.getBoundingClientRect().height<=innerHeight, emojiAboveDots:Number(getComputedStyle(emoji).zIndex)>Number(getComputedStyle(dots).zIndex), dotsSubtle:Number(getComputedStyle(dots).opacity)<.5 };
    });
    if (Object.values(layout).some(value => !value)) throw new Error(JSON.stringify(layout));
    console.log(JSON.stringify({ mobileMeetingFallback:true,commentLikeInsert:true,navigationQuerySync:true,...layout },null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
