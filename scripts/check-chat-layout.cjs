// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const css = ['src/app/components/chat.css', 'src/app/components/group-message-actions.css', 'src/app/responsive-ui.css'].map(p => fs.readFileSync(p, 'utf8')).join('\n');
    const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240"><rect width="160" height="240" fill="#886644"/></svg>');
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font-family:Arial}${css}</style><main class="chatPage"><header class="chatTop"><button>←</button><i>G</i><button class="chatTitle"><b>A very long workspace group title</b></button><span></span><button class="chatCallButton">☎</button><button class="chatCallButton">▣</button><button class="chatMenuButton">⋮</button></header><section class="chatMessages"><div data-message-id="call"><article class="chatMessage callHistoryMessage mine"><div class="callHistoryCard"><i>☎</i><span><b>Voice call</b><small>Duration · 02:30</small></span></div><div class="messageMeta">10:42</div></article></div><div data-message-id="media"><article class="chatMessage mine"><img src="${image}"><div class="messageMeta">10:42</div></article></div><div data-message-id="poll"><article class="chatMessage theirs"><div class="chatPoll"><b>Where shall we meet?</b><button aria-pressed="false"><span>Office</span><small>0</small></button><button aria-pressed="true"><span>A longer option that must wrap safely on small phones</span><small>1</small></button></div></article></div></section><form class="chatComposer"><button>+</button><button>☺</button><textarea placeholder="Write a message…"></textarea><button>➤</button><button>◉</button></form></main>`);
      const metrics = await page.evaluate(() => ({
        width: innerWidth, page: document.documentElement.scrollWidth,
        call: document.querySelector('.callHistoryMessage').getBoundingClientRect().width,
        media: document.querySelector('[data-message-id="media"] article').getBoundingClientRect().width,
        image: document.querySelector('[data-message-id="media"] img').getBoundingClientRect().width,
        overflow: [...document.querySelectorAll('.chatTop,.chatComposer,.chatMessage')].some(el => el.scrollWidth > el.clientWidth + 2),
        input: document.querySelector('textarea').getBoundingClientRect().width
      }));
      assert.ok(metrics.page <= width, JSON.stringify(metrics));
      assert.ok(!metrics.overflow, JSON.stringify(metrics));
      assert.ok(metrics.media - metrics.image < 75, JSON.stringify(metrics));
      assert.ok(metrics.call < 280, JSON.stringify(metrics));
      assert.ok(metrics.input >= 100, JSON.stringify(metrics));
      console.log(JSON.stringify(metrics));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
