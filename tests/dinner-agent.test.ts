import {test,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {recommendDinnerAgent,applyToolArguments,DINING_MODEL,PROFILE_NOTICE} from '../src/lib/dinner.agent.ts';
import {DEFAULT_A,DEFAULT_B,LOCATIONS,shareText,type DinnerRequest} from '../src/lib/dining.ts';
import {resetDiningState} from '../src/lib/dinner.service.ts';
import {admitCaller,reserveProvider,RELEASE_SCRIPT,LIMIT_SCRIPT} from '../src/lib/usage.server.ts';
import {DINING_UNAVAILABLE} from '../src/lib/dining-config.server.ts';
const env={...process.env};
const input=():DinnerRequest=>({a:DEFAULT_A,b:DEFAULT_B,location:LOCATIONS[0]!,budget:'mid',message:'Food tonight?',history:[],excludeIds:[]});
afterEach(()=>{mock.restoreAll();resetDiningState(0);for(const key of ['GROQ_API_KEY','QLOO_API_KEY','QLOO_HACKATHON_API_KEY','HACKATHON_QLOO_API_KEY','VERCEL','NODE_ENV','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','USAGE_CALLER_SALT']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}});
const searchArgs={action:'search',budget:'mid',requiredFood:[],avoids:[]};
function setup(args:unknown=searchArgs, modelStatus=200){resetDiningState(0);process.env.GROQ_API_KEY='test-model-only';process.env.QLOO_API_KEY='test-qloo-only';const calls:{url:URL;body:any}[]=[];
 mock.method(globalThis,'fetch',async(url:string|URL,options:RequestInit={})=>{
 const u=new URL(url);calls.push({url:u,body:options.body?JSON.parse(String(options.body)):null});
 if(u.hostname==='api.groq.com')return modelStatus===200?Response.json({choices:[{message:{tool_calls:[{type:'function',function:{name:'dining_search',arguments:JSON.stringify(args)}}]}}]}):Response.json({}, {status:modelStatus,headers:modelStatus===429?{'retry-after':'120'}:{}});
 assert.equal(u.hostname,'hackathon.api.qloo.com');
 if(u.pathname==='/v2/tags'){const name=u.searchParams.get('filter.query')!;return Response.json({results:{tags:[{name,id:'urn:tag:cuisine:place:'+name,type:'urn:tag:cuisine:place'}]}});}
 return Response.json({results:{entities:[{entity_id:'synthetic-one',name:'TEST FIXTURE single mutual',location:{lat:40.7358,lon:-74.0036},properties:{price_level:1},tags:[{id:'urn:tag:cuisine:place:japanese',name:'Japanese'},{id:'urn:tag:cuisine:place:pasta',name:'Pasta'}]}]}});
 });return calls;
}
test('Groq tool calling consumes the message and applies validated constraints through Qloo',async()=>{
 const calls=setup({action:'search',budget:'low',requiredFood:['Pasta'],avoids:['Seafood']});const request=input();request.message='Cheap pasta tonight, avoid seafood';
 const result=await recommendDinnerAgent(request,'test-caller');assert.equal(result.ok,true);if(result.ok){assert.equal(result.searchMode,'ai');assert.equal(result.instructionNotice,undefined);assert.equal(result.alternatives.length,0);assert.match(result.rankingReason,/only returned restaurant/);}
 const model=calls.filter(c=>c.url.hostname==='api.groq.com');assert.equal(model.length,1);assert.match(model[0]!.body.messages[1].content,/Cheap pasta tonight/);assert.equal(model[0]!.body.parallel_tool_calls,false);assert.equal(model[0]!.body.max_completion_tokens,400);assert.equal(model[0]!.body.model,DINING_MODEL);
 const q=calls.find(c=>c.url.pathname==='/v2/insights')!.url.searchParams;assert.equal(q.get('filter.price_level.max'),'1');assert.match(q.get('filter.exclude.tags')!,/seafood/);
});
test('clarification does not silently fall back or call Qloo',async()=>{const calls=setup({action:'clarify',budget:'mid',requiredFood:[],avoids:[]});const r=await recommendDinnerAgent({...input(),message:'Book a hotel'},'test');assert.equal(r.ok,false);if(!r.ok){assert.equal(r.searchMode,'ai');assert.match(r.message,/Please ask for dinner/);}assert.equal(calls.length,1);});
test('malformed, widened, excessive and supporting-only food arguments cannot execute as AI constraints',()=>{for(const args of [{action:'search',budget:'any',requiredFood:[],avoids:[]},{action:'search',budget:'mid',requiredFood:['Wine'],avoids:[]},{...searchArgs,requiredFood:['Japanese','Seafood','Italian','Pasta']},{...searchArgs,url:'https://evil.invalid'}])assert.throws(()=>applyToolArguments(input(),args));});
test('successful AI food requirement filters returned evidence, never fabricates a match',async()=>{setup({...searchArgs,requiredFood:['Thai']});const r=await recommendDinnerAgent({...input(),message:'Thai tonight'},'test');assert.equal(r.ok,false);if(!r.ok){assert.equal(r.code,'empty');assert.equal(r.searchMode,'ai');}});
test('missing AI key runs labelled profile search, warns about unapplied words, and uses zero model units',async()=>{
 const calls=setup();delete process.env.GROQ_API_KEY;const request={...input(),message:'Cheap Thai, no seafood',requiredFood:['Thai'],messageAvoids:['Pasta']};
 const r=await recommendDinnerAgent(request,'test');assert.equal(r.ok,true);if(r.ok){assert.equal(r.searchMode,'profile');assert.equal(r.instructionNotice,PROFILE_NOTICE);assert.match(shareText(r),/Profile-based search/);assert.match(shareText(r),/extra instructions could not be applied/);}
 assert.equal(calls.some(c=>c.url.hostname==='api.groq.com'),false);
 const q=calls.find(c=>c.url.pathname==='/v2/insights')!.url.searchParams;assert.equal(q.get('filter.price_level.max'),'2');assert.doesNotMatch(q.get('filter.exclude.tags')!,/Pasta/);
 for(let i=0;i<100;i++)(await reserveProvider('model')).commit();
});
for(const status of [401,429,500])test('model HTTP '+status+' falls back to Qloo with honest notice, retaining the attempted model unit',async()=>{
 const calls=setup(searchArgs,status);const r=await recommendDinnerAgent(input(),'test');assert.equal(r.ok,true);if(r.ok){assert.equal(r.searchMode,'profile');assert.equal(r.instructionNotice,PROFILE_NOTICE);}
 assert.equal(calls.filter(c=>c.url.hostname==='api.groq.com').length,1);assert.equal(calls.filter(c=>c.url.pathname==='/v2/insights').length,1);
 if(status===429){const second=await recommendDinnerAgent(input(),'test');assert.equal(second.ok,true);assert.equal(calls.filter(c=>c.url.hostname==='api.groq.com').length,1);}
 else {for(let i=0;i<99;i++)(await reserveProvider('model')).commit();await assert.rejects(()=>reserveProvider('model'),/limit reached/);}
});
test('invalid tool output falls back without applying unvalidated constraints',async()=>{setup({...searchArgs,budget:'any',requiredFood:['Wine']});const r=await recommendDinnerAgent(input(),'test');assert.equal(r.ok,true);if(r.ok)assert.equal(r.searchMode,'profile');});
test('network model failure falls back once and makes no retry storm',async()=>{
 const calls=setup();const stub=globalThis.fetch;mock.method(globalThis,'fetch',async(...args:Parameters<typeof fetch>)=>{if(String(args[0]).includes('api.groq.com'))throw new DOMException('synthetic timeout','TimeoutError');return stub(...args);});const r=await recommendDinnerAgent(input(),'test');assert.equal(r.ok,true);if(r.ok)assert.equal(r.searchMode,'profile');assert.equal(calls.filter(c=>c.url.pathname==='/v2/insights').length,1);
});
test('failed base configuration consumes no caller or provider limits, including when AI is missing',async()=>{
 resetDiningState(0);delete process.env.GROQ_API_KEY;for(const k of ['QLOO_API_KEY','QLOO_HACKATHON_API_KEY','HACKATHON_QLOO_API_KEY'])delete process.env[k];mock.method(globalThis,'fetch',()=>{throw Error('unexpected outbound call');});
 for(let i=0;i<25;i++){const r=await recommendDinnerAgent(input(),'test');assert.equal(r.ok,false);if(!r.ok){assert.equal(r.code,'unconfigured');assert.equal(r.message,DINING_UNAVAILABLE);}}
 for(let i=0;i<3;i++)(await admitCaller('test')).commit();for(let i=0;i<100;i++)(await reserveProvider('model')).commit();for(let i=0;i<300;i++)(await reserveProvider('qloo')).commit();
});
test('production protection cannot be bypassed by profile fallback',async()=>{
 process.env.QLOO_API_KEY='test-only';delete process.env.GROQ_API_KEY;process.env.VERCEL='1';delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;mock.method(globalThis,'fetch',()=>{throw Error('unexpected outbound call');});const r=await recommendDinnerAgent(input(),'test');assert.equal(r.ok,false);if(!r.ok)assert.equal(r.message,DINING_UNAVAILABLE);
});
test('base configuration disappearing after reservation releases unused shared units',async()=>{
 resetDiningState(0);process.env.GROQ_API_KEY='test-only';process.env.QLOO_API_KEY='test-only';process.env.VERCEL='1';process.env.USAGE_CALLER_SALT='test-salt';process.env.UPSTASH_REDIS_REST_URL='https://redis.example.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-only';const commands:any[]=[];
 mock.method(globalThis,'fetch',async(url:string|URL,options:RequestInit)=>{assert.equal(new URL(url).hostname,'redis.example.invalid');const c=JSON.parse(String(options.body));commands.push(c);if(c[0]==='GET')return Response.json({result:null});if(c[1]===LIMIT_SCRIPT){if(c[2]===1)delete process.env.QLOO_API_KEY;return Response.json({result:[1,...Array.from({length:c[2]},(_,i)=>'window-'+i)]});}assert.equal(c[1],RELEASE_SCRIPT);return Response.json({result:1});});
 const r=await recommendDinnerAgent(input(),'test');assert.equal(r.ok,false);if(!r.ok)assert.equal(r.message,DINING_UNAVAILABLE);assert.deepEqual(commands.filter(c=>c[1]===RELEASE_SCRIPT).map(c=>c[2]),[1,2]);
});
test('exhausted model budget can use profile search without bypassing that model budget',async()=>{const calls=setup();for(let i=0;i<100;i++)(await reserveProvider('model')).commit();const r=await recommendDinnerAgent(input(),'test');assert.equal(r.ok,true);if(r.ok)assert.equal(r.searchMode,'profile');assert.equal(calls.some(c=>c.url.hostname==='api.groq.com'),false);await assert.rejects(()=>reserveProvider('model'),/limit reached/);});
test('profile fallback retains caller admission limits',async()=>{const calls=setup();delete process.env.GROQ_API_KEY;for(let i=0;i<3;i++)await recommendDinnerAgent(input(),'same');const before=calls.length;const r=await recommendDinnerAgent(input(),'same');assert.equal(r.ok,false);if(!r.ok)assert.match(r.message,/limit reached/);assert.equal(calls.length,before);});
