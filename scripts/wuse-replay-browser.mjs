// Recorded-response QA only. Never calls the live Qloo API.
import { chromium } from 'playwright';
import { toCrossJSONAsync } from 'seroval';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { offlineBrowserAssets } from './offline-browser-assets.mjs';
import { DEFAULT_A, DEFAULT_B, LOCATIONS } from '../src/lib/dining.ts';
import { recommendDinnerService, resetDiningState } from '../src/lib/dinner.service.ts';
const base=process.argv[2]??'http://127.0.0.1:8080/';
const synthetic=JSON.parse(readFileSync('tests/fixtures/dining-synthetic.json','utf8'));
resetDiningState(0);process.env.QLOO_API_KEY='test-recording-only';
const nativeFetch=globalThis.fetch;
globalThis.fetch=async url=>{
 const u=new URL(url);
 if(u.pathname==='/v2/tags'){const name=u.searchParams.get('filter.query');return Response.json({results:{tags:[{name,id:name==='restaurant'?'urn:tag:genre:place:restaurant':'urn:tag:cuisine:place:'+name,type:'urn:tag:cuisine:place'}]}});}
 assert.equal(u.pathname,'/v2/insights');return Response.json(synthetic);
};
let result;
try{result=await recommendDinnerService({a:DEFAULT_A,b:DEFAULT_B,location:LOCATIONS.find(l=>l.id==='wuse-ii'),budget:'mid',message:'Food tonight?',history:[],excludeIds:[]});}
finally{globalThis.fetch=nativeFetch;}
assert.equal(result.ok,true);
result.summary='SYNTHETIC TEST REPLAY - NOT LIVE. '+result.summary;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];let submissions=0;
 await offlineBrowserAssets(page);
 page.on('pageerror',e=>errors.push(e.message));
 // Keep visual QA offline; verify the existing photo error fallback as well.
 await page.route('https://example.com/**',route=>route.abort());
 await page.route('**/_serverFn/**',async route=>{
  submissions++;const data=route.request().postData()??'';
  assert.match(data,/wuse-ii/);
  const payload=await toCrossJSONAsync({result,error:undefined,context:{}});
  await route.fulfill({status:200,headers:{'content-type':'application/json','x-tss-serialized':'true'},body:JSON.stringify(payload)});
 });
 await page.goto(base);await page.locator('.app-shell[data-ready="true"]').waitFor();
 const wuse=page.getByRole('button',{name:'Wuse II, Abuja',exact:true});
 if(base.includes(':8080')){
  assert.equal(await wuse.getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'West Village',exact:true}).click();
  await page.reload();await page.locator('.app-shell[data-ready="true"]').waitFor();
  assert.equal(await page.getByRole('button',{name:'West Village',exact:true}).getAttribute('aria-pressed'),'true');
 }
 await wuse.click();await page.getByRole('button',{name:'Try example profiles',exact:true}).click();
 await page.reload();await page.locator('.app-shell[data-ready="true"]').waitFor();
 assert.equal(await wuse.getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.getByRole('heading',{name:'TEST FIXTURE Mutual Dinner',exact:true}).waitFor();
 assert.equal(await page.getByText('Best fit for both',{exact:true}).count(),1);
 const primary=page.getByRole('article',{name:'Primary dinner recommendation',exact:true});
 assert.equal(await primary.getByText('For you',{exact:true}).count(),1);
 assert.equal(await primary.getByText('For your friend',{exact:true}).count(),1);
 assert.equal(await primary.getByText('Why this comes first',{exact:true}).count(),1);
 assert.equal(await primary.getByText(/1.11 km from search centre/).isVisible(),false);
 await primary.getByText('Location details',{exact:true}).click();
 assert.equal(await primary.getByText(/1.11 km from search centre/).isVisible(),true);
 assert.equal(await primary.getByText('1 Synthetic Test Street',{exact:true}).count(),1);
 await primary.getByText('Location details',{exact:true}).click();
 assert.equal(await page.getByText('Food evidence is stronger for Maya. No direct food match for Leo; dinner compatibility is limited.',{exact:true}).count(),1);
 assert.equal(await page.getByText(/Avoids are preference exclusions, not allergy guarantees/).count(),1);
 assert.equal(await page.getByRole('heading',{name:/TEST FIXTURE Ice Cream|TEST FIXTURE Cake Shop/}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.getByRole('button',{name:'Your tastes',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Share',exact:true}).isVisible(),true);
 assert.equal(await page.getByRole('textbox',{name:'Ask for dinner',exact:true}).inputValue(),'');
 await page.getByRole('button',{name:'Edit setup',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Your tastes',exact:true}).isVisible(),true);
 await page.getByRole('button',{name:'Back to dinner',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Your tastes',exact:true}).count(),0);
 await page.waitForTimeout(800);
 await page.screenshot({path:'screenshots/wuse-synthetic-replay.png'});
 await primary.screenshot({path:'screenshots/primary-synthetic-card.png'});
 assert.equal(await primary.locator('img').count(),0);
 const bounds=await primary.boundingBox();assert.ok(bounds.height<=640,'Primary card should fit a mobile capture');
 await page.setViewportSize({width:320,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await primary.screenshot({path:'screenshots/primary-synthetic-card-320.png'});
 await page.setViewportSize({width:1280,height:800});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await primary.screenshot({path:'screenshots/primary-synthetic-card-desktop.png'});
 assert.equal(submissions,1);assert.deepEqual(errors,[]);
 const report={base,syntheticReplayOnly:true,liveQlooCalls:0,submissions,result,errors};
 writeFileSync('artifacts/wuse-synthetic-replay.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({base,syntheticReplayOnly:true,liveQlooCalls:0,submissions,primary:result.best.name,alternatives:result.alternatives.map(v=>v.name),errors}));
}finally{await browser.close();}
