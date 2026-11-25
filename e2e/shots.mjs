// Captures README and case-study screenshots from a running Wardia.
import puppeteer from 'puppeteer-core';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function shot(name, pin, route, lang, w, h, full = false, pre) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top', { timeout: 15000 }); await sleep(400);
  if (route) { await p.evaluate((r) => (location.hash = '#/' + r), route); await sleep(600); }
  if (pre) { await pre(p); await sleep(500); }
  await p.screenshot({ path: `docs/${name}.png`, fullPage: full }); await ctx.close(); console.log(name);
}
const clickSel = async (p, sel) => { await p.waitForSelector(sel); await p.click(sel); };
await shot('dashboard-en', '1111', 'dashboard', 'en', 1440, 1000, true);
await shot('schedule-en', '2222', 'schedule', 'en', 1440, 1100, true);
await shot('shift-en', '2222', 'schedule', 'en', 1440, 1000, false, async (p) => { await clickSel(p, '.sh.open'); });
await shot('timeclock-en', '2222', 'timeclock', 'en', 1440, 1000, false);
await shot('requests-en', '2222', 'requests', 'en', 1440, 900, false);
await shot('tips-en', '2222', 'tips', 'en', 1440, 900, false);
await shot('payroll-en', '3333', 'payroll', 'en', 1440, 800, false);
await shot('run-en', '3333', 'payroll', 'en', 1440, 1100, false, async (p) => { await clickSel(p, 'tbody tr.click'); });
await shot('payslip-en', '3333', 'payroll', 'en', 1440, 1000, false, async (p) => { await clickSel(p, 'tbody tr.click'); await sleep(400); await clickSel(p, 'button[data-act="slip"]'); });
await shot('reports-en', '1111', 'reports', 'en', 1440, 1000, true);
await shot('schedule-ar', '2222', 'schedule', 'ar', 1440, 1000, false);
await shot('payroll-ar', '3333', 'payroll', 'ar', 1440, 800, false);
await shot('staff-home-ar-mobile', '4444', 'home', 'ar', 390, 1400, false);
await shot('staff-schedule-mobile', '4444', 'myschedule', 'en', 390, 1400, false);
await b.close(); if (errs.length) { console.log('ERRORS', errs); process.exit(1); }
