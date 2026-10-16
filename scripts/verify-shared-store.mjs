import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadLocalEnv,projectRoot} from './with-app-env.mjs';

// Explicit live Redis-only QA. Rewrite every app key to a unique, expiring
// namespace; never alter production counters, salts, or provider allowances.
Object.assign(process.env,loadLocalEnv(projectRoot()));
const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
if(!url||!token||!process.env.USAGE_CALLER_SALT)throw Error('Shared store configuration incomplete');
process.env.NODE_ENV='production';
const namespace=process.env.OUT2EAT_STORE_QA_NAMESPACE??`out2eat:qa:${randomUUID()}:`;
if(!/^out2eat:qa:[a-f0-9-]+:$/.test(namespace))throw Error('Invalid QA namespace');
const touched=new Set(),nativeFetch=globalThis.fetch;
globalThis.fetch=async(target,options)=>{
 if(new URL(String(target)).href!==new URL(url).href)throw Error('Provider calls forbidden in store verification');
 const command=JSON.parse(String(options.body));
 const mapped=command.map(value=>{
  if(typeof value==='string'&&value.startsWith('out2eat:v1:')){
   const key=namespace+value.slice('out2eat:v1:'.length);touched.add(key);touched.add(key+':window');return key;
  }
  return value;
 });
 return nativeFetch(target,{...options,body:JSON.stringify(mapped)});
};
const usage=await import('../src/lib/usage.server.ts');
const {checkDiningConfiguration}=await import('../src/lib/dining-config.server.ts');
checkDiningConfiguration();
async function redis(...command){
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw Error('Store request failed');const data=await response.json();if(data.error)throw Error('Store command failed');return data.result;
}
const caller='isolated-shared-store-qa';
const callerId=createHmac('sha256',process.env.USAGE_CALLER_SALT).update(caller).digest('hex');
const minute=`out2eat:v1:caller:${callerId}:minute`,day=`out2eat:v1:caller:${callerId}:day`;
function worker(operation){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(import.meta.url),'--worker',operation],{env:{...process.env,OUT2EAT_STORE_QA_NAMESPACE:namespace},stdio:['ignore','pipe','pipe'],timeout:20000});
 let output='';child.stdout.on('data',b=>output+=b);child.on('error',()=>reject(Error('QA worker unavailable')));child.on('close',code=>{try{if(code!==0)throw Error();resolve(JSON.parse(output));}catch{reject(Error('QA worker failed'));}});
});}
async function main(){
 if(process.argv[2]==='--worker'){
  if(process.argv[3]==='admit'){
   try{const reservation=await usage.admitCaller(caller);reservation.commit();console.log(JSON.stringify({admitted:true}));}
   catch(e){if(!(e instanceof usage.UsageError))throw e;console.log(JSON.stringify({admitted:false,limiter:e.limiter,resetAt:e.resetAt}));}
  }else if(process.argv[3]==='cache')console.log(JSON.stringify(await usage.cacheRead('qa-equivalent')));
  return;
 }
 const checks=[];
 try{
  // Register worker keys before spawning so even a failed assertion can clean up.
  for(const key of [minute,day]){const isolated=namespace+key.slice('out2eat:v1:'.length);touched.add(isolated);touched.add(isolated+':window');}
  const parallel=await Promise.all(Array.from({length:4},()=>worker('admit')));
  assert.equal(parallel.filter(r=>r.admitted).length,3);const denied=parallel.find(r=>!r.admitted);
  assert.equal(denied.limiter,'caller.minute');assert.ok(denied.resetAt>Date.now());
  assert.equal(Number(await redis('GET',minute)),3);assert.equal(Number(await redis('GET',day)),3);
  checks.push('Four independent processes: exactly three admitted; rejection has shared reset time; rejected attempt did not increment day counter');
  await redis('DEL',minute,minute+':window',day,day+':window');
  const pending=await usage.admitCaller(caller);await pending.release();await pending.release();
  assert.equal(Number(await redis('GET',minute)),0);assert.equal(Number(await redis('GET',day)),0);
  const committed=await usage.admitCaller(caller);committed.commit();await committed.release();assert.equal(Number(await redis('GET',minute)),1);
  checks.push('Unused caller reservations refund both windows exactly once; committed reservations remain charged');
  await redis('DEL',minute,minute+':window',day,day+':window');
  await redis('SET',day,20,'EX',30);
  await assert.rejects(()=>usage.admitCaller(caller),e=>e instanceof usage.UsageError&&e.limiter==='caller.day'&&e.resetAt>Date.now());
  assert.equal(await redis('GET',minute),null);checks.push('Daily caller cap rejects atomically without charging minute allowance');
  const model='out2eat:v1:provider:model:day';await redis('SET',model,99,'EX',30);
  const unused=await usage.reserveProvider('model');assert.equal(Number(await redis('GET',model)),100);await unused.release();await unused.release();assert.equal(Number(await redis('GET',model)),99);
  const used=await usage.reserveProvider('model');used.commit();await used.release();
  await assert.rejects(()=>usage.reserveProvider('model'),e=>e instanceof usage.UsageError&&e.limiter==='provider.model.day');
  checks.push('Global model cap and provider refunds verified with isolated counters; committed attempts remain charged');
  const qloo=await usage.reserveProvider('qloo');await qloo.release();
  assert.equal(Number(await redis('GET','out2eat:v1:provider:qloo:day')),0);assert.equal(Number(await redis('GET','out2eat:v1:provider:qloo:spacing')),0);
  const spaced=await usage.reserveProvider('qloo');
  await assert.rejects(()=>usage.reserveProvider('qloo'),e=>e instanceof usage.UsageError&&e.limiter==='provider.qloo.spacing');await spaced.release();
  await redis('SET','out2eat:v1:provider:qloo:day',300,'EX',30);
  await assert.rejects(()=>usage.reserveProvider('qloo'),e=>e instanceof usage.UsageError&&e.limiter==='provider.qloo.day');
  checks.push('Global Qloo cap, two-second spacing and unused day/spacing refunds verified without Qloo calls');
  const until=Date.now()+30000;await usage.recordQlooCooldown(until);await usage.recordQlooCooldown(Date.now()+1000);
  await assert.rejects(()=>usage.reserveProvider('qloo'),e=>e instanceof usage.UsageError&&e.limiter==='provider.qloo.cooldown'&&e.resetAt===until);
  checks.push('Shared provider cooldown cannot be shortened');
  await usage.cacheWrite('qa-equivalent',{synthetic:true,venues:[]},30);assert.deepEqual(await worker('cache'),{synthetic:true,venues:[]});
  await usage.cacheWrite('qa-expiry',true,1);await new Promise(r=>setTimeout(r,1150));assert.equal(await usage.cacheRead('qa-expiry'),null);
  checks.push('Synthetic cached empty result shared across processes; cache TTL expiry works');
  let finish;const lease=usage.withSearchLease('qa-lease',()=>new Promise(r=>finish=r));while(!finish)await new Promise(r=>setTimeout(r,20));
  await assert.rejects(()=>usage.withSearchLease('qa-lease',async()=>{}),/equivalent search/);finish();await lease;
  await assert.rejects(()=>usage.withSearchLease('qa-lease',async()=>{throw Error('simulated failure');}),/simulated failure/);
  assert.equal(await usage.withSearchLease('qa-lease',async()=>true),true);checks.push('Equivalent search lease blocks duplicates and releases after success and failure');
 }finally{
  // Delete only keys touched inside this unique QA namespace, never SCAN/FLUSH.
  const keys=[...touched];if(keys.length)await redis('DEL',...keys);
  checks.push('Isolated QA keys cleaned up; real app allowances untouched');
 }
 console.log(JSON.stringify({ok:true,checks,providerCalls:0,isolated:true},null,2));
}
main().catch(()=>{console.error('Shared-store verification failed; credential values suppressed.');process.exitCode=1;});
