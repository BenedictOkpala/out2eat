// Explicit, two-submission live verification. Never run as an automated test.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { offlineBrowserAssets } from './offline-browser-assets.mjs';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await offlineBrowserAssets(page);
 const errors=[],results=[];let submissions=0;
 page.on('pageerror',()=>errors.push('Uncaught browser error'));
 page.on('request',r=>{if(r.url().includes('/_serverFn/')&&r.method()==='POST')submissions++;});
 await page.goto('http://127.0.0.1:8080/');
 await page.locator('.app-shell[data-ready="true"]').waitFor();
 await page.getByRole('button',{name:'Try example profiles',exact:true}).click();
 await page.getByRole('button',{name:'Wuse II, Abuja',exact:true}).click();
 await page.getByRole('button',{name:'$$ Mid',exact:true}).click();
 for(const message of ['Food tonight?','food tonight, somewhere cheaper.']) {
  await page.getByRole('textbox',{name:'Ask for dinner',exact:true}).fill(message);
  const before=submissions,start=Date.now();
  const finished=page.waitForResponse(r=>r.url().includes('/_serverFn/')&&r.request().method()==='POST',{timeout:100000});
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const response=await finished;await response.finished();
  await page.waitForFunction(()=>!document.querySelector('button[aria-label="Send"]')?.disabled,undefined,{timeout:100000});
  const body=await page.locator('body').innerText();
  const result={message,responseTimeMs:Date.now()-start,submissions:submissions-before,httpStatus:response.status(),mode:body.includes('Profile-based search')?'profile':body.includes('AI-guided search')?'ai':'no-result-see-server-tool-diagnostics',restaurants:await page.locator('article h3').allTextContents(),outcome:await page.locator('section[aria-live="polite"]').innerText()};
  results.push(result);
  await page.screenshot({path:`screenshots/ai-live-${results.length}.png`,fullPage:true});
  console.log(JSON.stringify(result));
  // Sequential requests, no retry loops. Qloo transport retains provider pacing.
 }
 writeFileSync('artifacts/ai-live-browser.json',JSON.stringify({fixtureOnly:false,submissions,results,errors},null,2));
 if(submissions!==2||errors.length)process.exitCode=1;
} finally {await browser.close();}
