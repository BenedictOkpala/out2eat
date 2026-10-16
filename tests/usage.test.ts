import {test,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {admitCaller,reserveProvider,recordQlooCooldown,resetUsageState,cacheRead,cacheWrite,withSearchLease,LIMIT_SCRIPT,UsageError} from '../src/lib/usage.server.ts';
import {effectiveSearchKey} from '../src/lib/dinner.service.ts';
import {DEFAULT_A,DEFAULT_B,LOCATIONS,type DinnerRequest} from '../src/lib/dining.ts';
const env={...process.env};
afterEach(()=>{mock.restoreAll();resetUsageState();for(const key of ['VERCEL','NODE_ENV','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','USAGE_CALLER_SALT']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}});
test('per-caller admission precedes provider use and cannot be bypassed by wording',async()=>{for(let i=0;i<3;i++)await admitCaller('same-caller');await assert.rejects(()=>admitCaller('same-caller'),/limit reached/);await admitCaller('another-caller');});
test('daily model budget rejects attempt 101',async()=>{for(let i=0;i<100;i++)await reserveProvider('model');await assert.rejects(()=>reserveProvider('model'),/limit reached/);});
test('a shorter provider cooldown cannot erase a longer retry deadline',async()=>{await recordQlooCooldown(Date.now()+120000);await recordQlooCooldown(Date.now()+1000);await assert.rejects(()=>reserveProvider('qloo'),/rate limited.*Retry after/);});
test('effective cache key ignores message, history and names but changes for constraints',()=>{const input:DinnerRequest={a:DEFAULT_A,b:DEFAULT_B,location:LOCATIONS[0]!,budget:'mid',message:'Food tonight?',history:[],excludeIds:[]};const key=effectiveSearchKey(input);assert.equal(key,effectiveSearchKey({...input,message:'Dinner please',history:[{role:'user',text:'old text'}],a:{...DEFAULT_A,name:'Other name',likes:[...DEFAULT_A.likes].reverse()}}));for(const changed of [{budget:'low' as const},{location:LOCATIONS[4]!},{requiredFood:['Thai']},{messageAvoids:['Seafood']},{excludeIds:['seen']}])assert.notEqual(key,effectiveSearchKey({...input,...changed}));});
test('local lease deduplicates concurrent work and cached empty results survive',async()=>{let release!:()=>void;const pending=withSearchLease('same',()=>new Promise<void>(r=>{release=r}));await assert.rejects(()=>withSearchLease('same',async()=>{}),/equivalent search/);release();await pending;await cacheWrite('empty',[],300);assert.deepEqual(await cacheRead('empty'),[]);});
test('shared Redis admission uses atomic EVAL, server-only HMAC identity and fails closed on outage',async()=>{
 process.env.UPSTASH_REDIS_REST_URL='https://redis.example.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-only';process.env.USAGE_CALLER_SALT='test-only-salt';process.env.VERCEL='1';let command:any;
 mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{command=JSON.parse(String(options.body));return Response.json({result:[1,'window-a','window-b']});});await admitCaller('private-caller-address');assert.equal(command[0],'EVAL');assert.equal(command[1],LIMIT_SCRIPT);assert.equal(command[2],2);assert.doesNotMatch(JSON.stringify(command),/private-caller-address/);
 mock.restoreAll();mock.method(globalThis,'fetch',async()=>Response.json({error:'unavailable'},{status:503}));await assert.rejects(()=>reserveProvider('qloo'),/unavailable/);
});

test('limiter identity and reset timestamp distinguish minute, day and provider budgets',async()=>{
 let now=Date.parse('2026-10-16T00:00:00Z');mock.method(Date,'now',()=>now);
 for(let i=0;i<3;i++)(await admitCaller('test')).commit();
 await assert.rejects(()=>admitCaller('test'),(error:unknown)=>error instanceof UsageError&&error.limiter==='caller.minute'&&error.resetAt===now+60000);
 for(let batch=0;batch<6;batch++){now+=61000;for(let i=0;i<(batch===5?2:3);i++)(await admitCaller('test')).commit();}
 await assert.rejects(()=>admitCaller('test'),(error:unknown)=>error instanceof UsageError&&error.limiter==='caller.day'&&error.resetAt===Date.parse('2026-10-17T00:00:00Z'));
 const start=now;for(let i=0;i<100;i++)(await reserveProvider('model')).commit();
 await assert.rejects(()=>reserveProvider('model'),(error:unknown)=>error instanceof UsageError&&error.limiter==='provider.model.day'&&error.resetAt===start+86400000);
});
test('unused reservations release once; committed provider attempts are never refunded',async()=>{
 const a=await admitCaller('test'),b=await admitCaller('test');b.commit();await a.release();await a.release();
 (await admitCaller('test')).commit();(await admitCaller('test')).commit();await assert.rejects(()=>admitCaller('test'),/limit reached/);
 const unused=await reserveProvider('model');await unused.release();await unused.release();
 for(let i=0;i<100;i++){const used=await reserveProvider('model');used.commit();await used.release();}
 await assert.rejects(()=>reserveProvider('model'),/limit reached/);
});
test('old unused reservation cannot refund a new window after expiry',async()=>{
 let now=1000000;mock.method(Date,'now',()=>now);const old=await admitCaller('test');now+=86400001;
 for(let i=0;i<3;i++)(await admitCaller('test')).commit();await old.release();await assert.rejects(()=>admitCaller('test'),/limit reached/);
});
test('shared rejection reports server reset time and does not attempt a refund without a reservation',async()=>{
 process.env.UPSTASH_REDIS_REST_URL='https://redis.example.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-only';let calls=0;const resetAt=Date.parse('2026-10-17T00:00:00Z');
 mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({result:[0,2,resetAt]});});
 await assert.rejects(()=>admitCaller('test'),(error:unknown)=>error instanceof UsageError&&error.limiter==='caller.day'&&error.resetAt===resetAt);assert.equal(calls,1);
});
