import {test,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {reserveProvider,LIMIT_SCRIPT,UsageError,resetUsageState} from '../src/lib/usage.server.ts';
const previous={...process.env};
afterEach(()=>{mock.restoreAll();resetUsageState();for(const key of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','VERCEL','NODE_ENV']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
function shared(handler){process.env.UPSTASH_REDIS_REST_URL='https://redis.example.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-only';process.env.VERCEL='1';mock.method(globalThis,'fetch',async(_url,options)=>Response.json({result:handler(JSON.parse(options.body))}));}
test('normal Qloo spacing contention waits for admission without reserving another daily unit',async()=>{
 let admissions=0,units=0;
 shared(command=>{if(command[0]==='GET')return null;if(command[1]===LIMIT_SCRIPT){admissions++;assert.equal(command[3],'out2eat:v1:provider:qloo:day');if(admissions===1)return [0,2,Date.now()+1];units++;return [1,'day-window','spacing-window'];}return 1;});
 const started=performance.now();const reservation=await reserveProvider('qloo');assert.ok(performance.now()-started>=20);assert.equal(admissions,2);assert.equal(units,1);reservation.commit();
});
test('Qloo daily budget exhaustion rejects immediately instead of retrying admission',async()=>{
 let admissions=0;shared(command=>{if(command[0]==='GET')return null;admissions++;return [0,1,Date.now()+60000];});
 await assert.rejects(()=>reserveProvider('qloo'),e=>e instanceof UsageError&&e.limiter==='provider.qloo.day');assert.equal(admissions,1);
});
test('a provider cooldown set by another instance during a spacing wait stops the next attempt',async()=>{
 let reads=0,admissions=0;shared(command=>{if(command[0]==='GET')return ++reads===1?null:JSON.stringify(Date.now()+60000);admissions++;return [0,2,Date.now()+1];});
 await assert.rejects(()=>reserveProvider('qloo'),e=>e instanceof UsageError&&e.limiter==='provider.qloo.cooldown');assert.equal(admissions,1);assert.equal(reads,2);
});
test('sustained Qloo contention is bounded and never sends provider requests',async()=>{
 let admissions=0;shared(command=>{if(command[0]==='GET')return null;assert.equal(command[1],LIMIT_SCRIPT);admissions++;return [0,2,Date.now()+1];});
 await assert.rejects(()=>reserveProvider('qloo'),e=>e instanceof UsageError&&e.limiter==='provider.qloo.spacing');assert.equal(admissions,9);
});
test('a long spacing deadline is returned without sleeping past the request wait bound',async()=>{
 let admissions=0;shared(command=>{if(command[0]==='GET')return null;admissions++;return [0,2,Date.now()+30000];});
 await assert.rejects(()=>reserveProvider('qloo'),e=>e instanceof UsageError&&e.limiter==='provider.qloo.spacing');assert.equal(admissions,1);
});
