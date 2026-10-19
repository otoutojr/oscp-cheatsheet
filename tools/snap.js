#!/usr/bin/env node
// snap.js — ヘッドレス Chromium でページを開き、スクリーンショット・DOM 検査・コンソールエラー確認を行う検証用ツール。
//
// 使い方:
//   node tools/snap.js <url> [--out shot.png] [--width 1400] [--height 1000] [--mobile] [--dark|--light]
//                      [--js "<ページ内で評価する JS 式>"] [--pre "<読み込み前に評価する JS（localStorage 設定など）>"]
//                      [--wait 500] [--full] [--text "<CSS セレクタ>"] [--html "<CSS セレクタ>"]
// 例:
//   node tools/snap.js "file:///…/docs/index.html#/n/nmap" --out /tmp/x.png
//   node tools/snap.js "file:///…/docs/index.html#/n/nmap" --pre "localStorage.setItem('cs.vars.v1', JSON.stringify({values:{VICTIM_IP:'10.0.0.5'},enabled:{VICTIM_IP:true},extra:[],inlineApply:true}))" --js "document.querySelectorAll('.ph-set').length"
//   node tools/snap.js "<url>" --mobile --out /tmp/m.png
//
// 出力: console のエラー/警告、--js の評価結果（JSON）、--text / --html の内容。終了コードはページエラーがあれば 1。
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  return v;
}

(async () => {
  const url = process.argv[2];
  if (!url || url.startsWith('--')) {
    console.error('usage: node tools/snap.js <url> [options]  (see header comment)');
    process.exit(2);
  }
  const out = arg('--out', null);
  const mobile = arg('--mobile', false) === true;
  const width = parseInt(arg('--width', mobile ? 390 : 1400), 10);
  const height = parseInt(arg('--height', mobile ? 844 : 1000), 10);
  const wait = parseInt(arg('--wait', 400), 10);
  const js = arg('--js', null);
  const pre = arg('--pre', null);
  const textSel = arg('--text', null);
  const htmlSel = arg('--html', null);
  const full = arg('--full', false) === true;
  const scheme = arg('--light', false) === true ? 'light' : (arg('--dark', false) === true ? 'dark' : null);
  const exe = process.env.CHROME_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : '/usr/bin/google-chrome');
  const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'snap-'));

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--disable-dev-shm-usage'],
  });
  let exit = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    if (scheme) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    const logs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[console.${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => { logs.push(`[pageerror] ${e.message}`); exit = 1; });
    page.on('requestfailed', (r) => { logs.push(`[requestfailed] ${r.url()} ${r.failure() && r.failure().errorText}`); });
    if (pre) await page.evaluateOnNewDocument(pre);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await new Promise((r) => setTimeout(r, wait));
    if (js) {
      try {
        const v = await page.evaluate(js);
        console.log('JS =>', JSON.stringify(v, null, 1));
      } catch (e) {
        console.log('JS error =>', e.message);
        exit = 1;
      }
    }
    if (textSel) {
      const t = await page.$eval(textSel, (el) => el.innerText).catch((e) => `(not found: ${e.message})`);
      console.log(`TEXT ${textSel} =>\n${t}`);
    }
    if (htmlSel) {
      const h = await page.$eval(htmlSel, (el) => el.outerHTML).catch((e) => `(not found: ${e.message})`);
      console.log(`HTML ${htmlSel} =>\n${h.slice(0, 20000)}`);
    }
    if (out) {
      await page.screenshot({ path: out, fullPage: full });
      console.log('screenshot =>', out);
    }
    const title = await page.title();
    console.log('title =>', title);
    if (logs.length) console.log(logs.join('\n'));
    else console.log('console: clean');
  } finally {
    await browser.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  process.exit(exit);
})().catch((e) => { console.error(e); process.exit(1); });
