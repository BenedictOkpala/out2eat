import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { offlineBrowserAssets } from './offline-browser-assets.mjs';
const locationName=process.argv[2]??'West Village';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await offlineBrowserAssets(page);
 const pageErrors=[];page.on('pageerror',()=>pageErrors.push('Uncaught browser error'));
 let dinnerSubmissions=0;
 page.on('request',request=>{if(request.url().includes('/_serverFn/') && request.method()==='POST')dinnerSubmissions++;});
 await page.goto('http://127.0.0.1:8080/');
 await page.locator('.app-shell[data-ready="true"]').waitFor();
 await page.getByRole('button',{name:'Try example profiles',exact:true}).click();
 await page.getByRole('button',{name:locationName,exact:true}).click();
 await page.getByRole('button',{name:'$$ Mid',exact:true}).click();
 const locationSelected=await page.getByRole('button',{name:locationName,exact:true}).getAttribute('aria-pressed')==='true';
 const budgetSelected=await page.getByRole('button',{name:'$$ Mid',exact:true}).getAttribute('aria-pressed')==='true';
 const started=Date.now();
 await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('button[aria-label="Send"]')?.disabled,undefined,{timeout:90000});
 const responseTimeMs=Date.now()-started;
 const text=await page.locator('body').innerText();
 const result={fixtureOnly:false,searchMode:text.includes('Profile-based search')?'profile':text.includes('AI-guided search')?'ai':'unknown',location:locationName,budget:'Mid (price level <= 2)',responseTimeMs,locationSelected,budgetSelected,dinnerSubmissions,configured:!text.includes('Dining recommendations are unavailable'),shortlistRendered:await page.locator('.card-best h3').count()>0,pageErrors};
 if(!result.shortlistRendered)result.outcomeText=await page.locator('section[aria-live="polite"]').innerText();
 // Let existing entrance animations finish; this does not issue another search.
 await page.waitForTimeout(700);
 await page.screenshot({path:'screenshots/qloo-live-browser.png',fullPage:true});
 if(result.shortlistRendered){result.renderedResults=await page.locator('article').filter({has:page.locator('h3')}).allInnerTexts();}
 writeFileSync('artifacts/qloo-live-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(!result.configured || !result.shortlistRendered || !locationSelected || !budgetSelected || dinnerSubmissions!==1 || pageErrors.length)process.exitCode=1;
} finally {await browser.close();}
