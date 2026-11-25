// Opens every page for every role in both languages and reports script errors.
import puppeteer from 'puppeteer-core';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAV = { '1111': ['dashboard', 'schedule', 'staff', 'requests', 'timeclock', 'tips', 'payroll', 'reports', 'settings', 'audit'], '2222': ['dashboard', 'schedule', 'staff', 'requests', 'timeclock', 'tips', 'reports'], '3333': ['dashboard', 'schedule', 'staff', 'timeclock', 'tips', 'payroll', 'reports'], '4444': ['home', 'myschedule', 'requests', 'payslips'] };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
for (const lang of ['en', 'ar']) for (const [pin, pages] of Object.entries(NAV)) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${pin}/${lang}: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(`${pin}/${lang}: ${m.text()}`));
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top', { timeout: 15000 });
  for (const r of pages) { await p.evaluate((x) => (location.hash = '#/' + x), r); await sleep(250); const txt = await p.evaluate(() => document.querySelector('main')?.innerText || ''); if (/undefined|NaN|\[object/.test(txt)) errs.push(`${pin}/${lang}/${r}: bad text`); if (txt.length < 30) errs.push(`${pin}/${lang}/${r}: empty`); }
  await ctx.close();
}
await b.close(); console.log(errs.length ? errs.slice(0, 30) : 'smoke ok'); process.exit(errs.length ? 1 : 0);
