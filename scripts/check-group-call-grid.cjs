const { chromium } = require(process.env.PLAYWRIGHT_MODULE);

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const results = [];
    for (const viewport of [{ name: "desktop", width: 1280, height: 800 }, { name: "mobile", width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto("http://localhost:3000");
      await page.addStyleTag({ path: "src/app/components/group-call.css" });
      const result = await page.evaluate(({ name }) => {
        const root = document.createElement("div");
        root.className = "groupCallOverlay active videoCall";
        root.innerHTML = `<section><header><p>CONVERGE · LIVE VIDEO CALL</p><h2>QA Group</h2><span class="groupCallCount">20 participants</span></header><div class="groupCallGrid">${Array.from({ length: 20 }, (_, index) => `<article><i>${index + 1}</i><b>Member ${index + 1}</b></article>`).join("")}</div><footer><button>Mute</button><button>Camera off</button><button class="leave">End call</button></footer></section>`;
        document.body.append(root);
        const boxes = [...root.querySelectorAll("article")].map(node => node.getBoundingClientRect());
        const overlaps = boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
        const grid = root.querySelector(".groupCallGrid");
        const controls = root.querySelector("footer").getBoundingClientRect();
        const stage = grid.getBoundingClientRect();
        return { name, tiles: boxes.length, overlaps: overlaps.length, scrollable: grid.scrollHeight > grid.clientHeight, controlsClear: stage.bottom <= controls.top };
      }, viewport);
      results.push(result);
      await page.close();
    }
    if (results.some(item => item.overlaps || !item.scrollable || !item.controlsClear)) throw new Error(JSON.stringify(results));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
