import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const base='http://127.0.0.1:4173/';
const server=spawn(process.execPath,['scripts/dev-server.mjs','--host','127.0.0.1','--port','4173'],{stdio:'pipe'});
let browser;
const ready=async () => {
  for(let i=0;i<70;i++){
    try{const r=await fetch(base);if(r.ok)return}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw new Error('Preview server was not ready');
};
try {
  await ready();
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const [width,color] of [[320,'dark'],[390,'light'],[1280,'dark']]){
    const context=await browser.newContext({viewport:{width,height:850},colorScheme:color});
    const page=await context.newPage();
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.evaluate(() => localStorage.setItem('hackcal.quality-sentinel','preserved'));
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(() => localStorage.getItem('hackcal.quality-sentinel')),'preserved');
    assert.equal(await page.locator('main.workspace').count(),1);
    assert.equal(await page.locator('#addBtn').count(),1);
    await page.locator('#addBtn').click();
    const dialog=page.locator('#modal[role="dialog"][aria-modal="true"]');
    assert.equal(await dialog.isVisible(),true);
    assert.equal(await dialog.getAttribute('aria-labelledby'),'hackcal-modal-heading');
    assert.equal(await dialog.locator('h2').evaluate(el=>el===document.activeElement),true);
    assert.equal(await dialog.getByLabel('Name',{exact:true}).count(),1);
    assert.equal(await dialog.getByLabel('Start date').count(),1);
    // Shift+Tab from the focused heading must wrap to the final dialog control.
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.locator('button').last().evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.locator('button').first().evaluate(el=>el===document.activeElement),true);
    await dialog.getByLabel('Name',{exact:true}).fill('Unsaved keyboard test');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(),false);
    assert.equal(await page.locator('#addBtn').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.evaluate(() => localStorage.getItem('hackcal.quality-sentinel')),'preserved');

    await page.locator('#themeBtn').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.locator('#themeBtn').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.locator('#viewSeg [data-view="list"]').click();
    assert.equal(await page.locator('#listView').isVisible(),true);
    await page.locator('#viewSeg [data-view="month"]').click();
    assert.equal(await page.locator('#monthView').isVisible(),true);
    await page.locator('#addBtn').hover();
    assert.equal(await page.locator('#addBtn').evaluate(el=>getComputedStyle(el).cursor),'pointer');
    const overflow=await page.evaluate(() => ({
      viewport:innerWidth,document:document.documentElement.scrollWidth,
      offenders:[...document.querySelectorAll('body *')].filter(el=>{
        const r=el.getBoundingClientRect();
        return r.right>innerWidth+2 && r.left>=0 && getComputedStyle(el).position!=='fixed';
      }).slice(0,18).map(el=>({
        tag:el.tagName,id:el.id,cls:String(el.className).slice(0,80),
        right:Math.round(el.getBoundingClientRect().right),scroll:el.scrollWidth,client:el.clientWidth
      }))
    }));
    if(overflow.document>overflow.viewport+2) console.log('RESPONSIVE_OVERFLOW '+JSON.stringify(overflow));
    assert.equal(overflow.document<=overflow.viewport+2,true,
      'Horizontal page overflow at '+width+'px');
    await context.close();
  }
  console.log('HackCal isolated Chromium UI: passed (320/390/1280, modal keyboard focus, labels, data, theme and view)');
} finally {
  if(browser) await browser.close();
  server.kill();
}
