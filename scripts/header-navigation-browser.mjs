// Synthetic browser regression: no live model/Qloo/store requests.
import {chromium} from 'playwright';
import {toCrossJSONAsync} from 'seroval';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2]??'http://localhost:8080/';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
mkdirSync('screenshots',{recursive:true});
const venue={id:'synthetic-header',name:'TEST FIXTURE dinner',where:null,priceLabel:null,ratingLabel:null,imageUrl:null,tags:[],forA:'TEST FIXTURE seafood evidence.',forB:'TEST FIXTURE Italian evidence.',shared:'TEST FIXTURE mutual food match.',dinnerEvidence:'both',cuisines:[],address:null,distanceMeters:null,evidenceA:[],evidenceB:[]};
const success={ok:true,searchMode:'profile',summary:'TEST FIXTURE response',locationLabel:'within 2.5 km of Maitama, Abuja',budgetLabel:'$$ Mid',names:{a:'Maya',b:'Leo'},best:venue,alternatives:[],rankingReason:'TEST FIXTURE only qualifying candidate.'};
const report=[];
try{for(const [device,viewport]of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 let calls=0,next=success;const queued=[];
 await page.route('**/_serverFn/**',async route=>{calls++;const response=next;await new Promise(resolve=>queued.push(resolve));const body=await toCrossJSONAsync({result:response,error:undefined,context:{}});await route.fulfill({status:200,headers:{'content-type':'application/json','x-tss-serialized':'true'},body:JSON.stringify(body)});});
 await page.goto(base);await page.locator('.app-shell[data-ready="true"]').waitFor();const origin=await page.evaluate(()=>performance.timeOrigin);
 const header=page.getByRole('button',{name:/^Out2Eat.*return to setup$/});
 await page.keyboard.press('Tab');assert.equal(await header.evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Try example profiles',exact:true}).click();
 await page.getByRole('button',{name:'Maitama, Abuja',exact:true}).click();
 await page.getByRole('button',{name:'$$ Mid',exact:true}).click();
 const saved=await page.evaluate(()=>localStorage.getItem('out2eat.v1'));
 async function begin(response){next=response;const before=calls;await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByText('Looking for a place that suits both of you.',{exact:true}).waitFor();while(calls===before)await page.waitForTimeout(10);}
 async function home(key){const before=calls;if(key){await header.focus();await header.press(key)}else await header.click();await page.getByRole('button',{name:'Your tastes',exact:true}).waitFor({state:'visible'});assert.equal(calls,before);assert.equal(await page.evaluate(()=>performance.timeOrigin),origin);assert.equal(await page.evaluate(()=>localStorage.getItem('out2eat.v1')),saved);assert.equal(await page.getByRole('button',{name:'Maitama, Abuja',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:'$$ Mid',exact:true}).getAttribute('aria-pressed'),'true');}
 for(const [response,key]of [[success,null],[{ok:false,code:'empty',message:'TEST FIXTURE empty'},'Enter'],[{ok:false,code:'error',message:'TEST FIXTURE error'},'Space']]){
  await begin(response);queued.shift()();if(response.ok)await page.getByRole('heading',{name:venue.name,exact:true}).waitFor();else await page.getByText(response.message,{exact:true}).waitFor();
  await home(key);await page.getByRole('button',{name:'Your tastes',exact:true}).click();await page.getByRole('textbox',{name:'Name',exact:true}).waitFor();await page.getByRole('button',{name:'Done',exact:true}).click();
 }
 // Old result/failure must neither close setup nor unlock a newer search.
 await begin(success);await home(null);queued.shift()();await page.waitForTimeout(250);assert.equal(await page.getByRole('button',{name:'Your tastes',exact:true}).isVisible(),true);
 await begin({ok:false,code:'error',message:'TEST FIXTURE stale error must be ignored'});await home('Enter');
 const old=queued.shift();await begin(success);old();await page.waitForTimeout(250);assert.equal(await page.getByRole('button',{name:'Send',exact:true}).isDisabled(),true);assert.equal(await page.getByText('TEST FIXTURE stale error must be ignored',{exact:true}).count(),0);
 queued.shift()();await page.getByRole('heading',{name:venue.name,exact:true}).waitFor();await home('Space');
 assert.equal(await page.getByText('Looking for a place that suits both of you.',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);await page.screenshot({path:`screenshots/header-${device}.png`});report.push({device,resultsEmptyError:true,keyboardEnterSpace:true,tabReachable:true,savedInputs:true,noNavigationOrSearchOnHeader:true,staleResponsesIgnored:true,oldFinallyCannotUnlockNewSearch:true,requests:calls,errors});await page.close();
}console.log(JSON.stringify({ok:true,syntheticOnly:true,report},null,2));writeFileSync('screenshots/header-verdict.json',JSON.stringify(report,null,2));}finally{await browser.close()}
