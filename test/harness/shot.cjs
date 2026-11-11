const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1220, height: 580 }, deviceScaleFactor: 2 });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://127.0.0.1:8801/index.html');
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({
    url: location.href,
    frames: [...document.querySelectorAll('iframe')].map(f => ({ sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow'), ref: f.getAttribute('referrerpolicy') })),
    js: window.jsDecision,
    texts: [...document.querySelectorAll('.tile')].map(t => t.innerText.replace(/\s+/g,' ').slice(0,160)),
  }));
  const inner = [];
  for (const f of p.frames()) if (f !== p.mainFrame()) inner.push(await f.evaluate(() => document.getElementById('r')?.textContent).catch(e=>'ERR '+e.message));
  console.log(JSON.stringify({ ...r, inner, errors }, null, 1));
  await p.screenshot({ path: require('path').join(__dirname, 'states.png') });
  // click-to-activate
  const veil = p.locator('.dbse-veil--click');
  console.log('veil before click:', await veil.count()); await veil.click(); console.log('veil after click:', await veil.count());
  await b.close();
})();
