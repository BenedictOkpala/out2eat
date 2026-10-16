import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { recommendDinnerService, extractPlaces, rankPlaces, resetDiningState } from '../src/lib/dinner.service.ts';
import { DEFAULT_A, DEFAULT_B, LOCATIONS, type DinnerRequest } from '../src/lib/dining.ts';
const keys = ['QLOO_API_KEY','QLOO_HACKATHON_API_KEY','HACKATHON_QLOO_API_KEY'];
const original = keys.map(key => process.env[key]);
beforeEach(() => resetDiningState(0));
afterEach(() => { mock.restoreAll(); keys.forEach((key,i) => { if(original[i] === undefined) delete process.env[key]; else process.env[key]=original[i]; }); });
const input = (): DinnerRequest => ({ a: structuredClone(DEFAULT_A), b: structuredClone(DEFAULT_B), message: 'Food tonight?', budget: 'mid', location: LOCATIONS[0]!, history: [], excludeIds: [] });
const tag = (name: string) => ({ id: name === 'restaurant' ? 'urn:tag:genre:place:restaurant' : 'urn:tag:cuisine:place:'+name.toLowerCase(), name, type:'urn:tag:cuisine:place' });
const place = (id: string, names: string[], price: number | null = 2, affinity = 0.5) => ({ entity_id:id, name:'Test fixture '+id, location:{lat:40.7358,lon:-74.0036}, tags:names.map(tag), properties:{ price_level:price, business_rating:4.2, image:{url:'https://example.com/photo.jpg'}, geocode:{city:'New York'} }, query:{affinity} });
function stub(entities: unknown[], status = 200, calls: URL[] = []) {
  process.env.QLOO_API_KEY='test-only';
  mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    const u = new URL(url); calls.push(u);
    assert.equal(u.origin,'https://hackathon.api.qloo.com');
    assert.equal((options.headers as Record<string,string>)['X-Api-Key'],'test-only');
    if (u.pathname === '/v2/tags') return Response.json({success:true,results:{tags:[tag(u.searchParams.get('filter.query')!)]}});
    return Response.json(status === 200 ? {success:true,results:{entities}} : {error:'fixture'}, {status});
  });
}
test('missing key makes no outbound calls', async () => {
  keys.forEach(key=>delete process.env[key]);
  mock.method(globalThis,'fetch',()=>{throw Error('unexpected request');});
  const result=await recommendDinnerService(input()); assert.equal(result.ok,false); if(!result.ok) assert.equal(result.code,'unconfigured');
});
test('balanced match outranks one-sided affinity; returns evidence for both',async()=>{
  stub([place('one-sided',['Japanese','Seafood','Quiet'],2,1),place('balanced',['Japanese','Pasta']),place('alternative',['Wine'])]);
  const r=await recommendDinnerService(input()); assert.equal(r.ok,true); if(r.ok){assert.equal(r.best.id,'balanced');assert.equal(r.alternatives.length,2);assert.match(r.best.forA,/Japanese/);assert.match(r.best.forB,/Pasta/);}
});
test('requests retain restaurant, WKT radius, both profiles and budget',async()=>{
  const calls: URL[]=[];stub([place('a',['Japanese','Pasta']),place('b',['Japanese','Pasta'])],200,calls);
  const request=input();request.a.likes=Array.from({length:8},(_,i)=>'A'+i);request.b.likes=Array.from({length:8},(_,i)=>'B'+i);
  await recommendDinnerService(request);
  const q=calls.find(c=>c.pathname==='/v2/insights')!.searchParams;
  assert.equal(q.get('filter.location'),'POINT(-74.0036 40.7358)');assert.equal(q.get('filter.location.radius'),'2500');assert.equal(q.get('filter.price_level.max'),'2');assert.equal(q.get('filter.tags'),'urn:tag:genre:place:restaurant');assert.equal(q.get('signal.interests.tags')!.split(',').length,16);
});
test('unknown custom locality returns a clear boundary limitation without Qloo calls',async()=>{
 const calls:URL[]=[];stub([],200,calls);const request=input();request.location={...request.location,id:'custom',latitude:null,longitude:null,locality:'Lagos'};const result=await recommendDinnerService(request);assert.equal(result.ok,false);if(!result.ok)assert.match(result.message,/boundaries cannot be verified/);assert.equal(calls.length,0);
});

test('over-budget, unknown-price, avoided and previously shown venues are excluded',async()=>{
  stub([place('expensive',['Wine'],3),place('unknown',['Wine'],null),place('avoid',['Fast food']),place('seen',['Wine']),place('valid1',['Japanese','Pasta']),place('valid2',['Japanese','Pasta'])]);
  const request=input();request.excludeIds=['seen'];const r=await recommendDinnerService(request);assert.equal(r.ok,true);if(r.ok)assert.deepEqual([r.best.id,...r.alternatives.map(p=>p.id)],['valid1','valid2']);
});
for (const count of [0,1]) test('fewer than two candidates is an honest empty state: '+count,async()=>{stub(count?[place('single',['Wine'])]:[]);const r=await recommendDinnerService(input());assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'empty');});
for (const status of [400,401,404,429,500]) test('HTTP '+status+' is error, never fabricated results or empty',async()=>{stub([],status);const r=await recommendDinnerService(input());assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'error');});
test('malformed response is rejected',()=>assert.throws(()=>extractPlaces({success:true,results:{wrong:[]}})));
test('parser deduplicates and never treats explainability input names as venue tags',()=>{
  const raw={...place('a',['Japanese','Pasta']),query:{explainability:[{name:'Sushi',score:1}]}};
  const parsed=extractPlaces({results:{entities:[raw,raw,{name:'missing id'}]}});assert.equal(parsed.length,1);assert.deepEqual(parsed[0]!.tags.map(t=>t.name),['Japanese','Pasta']);assert.equal(parsed[0]!.imageUrl,'https://example.com/photo.jpg');
});
test('swapping friend order does not change ranking',()=>{
  const places=extractPlaces({results:{entities:[place('a',['Japanese']),place('b',['Pasta']),place('c',['Wine'])]}});
  const request=input();assert.deepEqual(rankPlaces(places,request).map(p=>p.id),rankPlaces(places,{...request,a:request.b,b:request.a}).map(p=>p.id));
});
test('invalid budget never reaches Qloo',async()=>{await assert.rejects(()=>recommendDinnerService({...input(),budget:'invalid'}));});

test('network timeout returns an error without results',async()=>{
  process.env.QLOO_API_KEY='test-only';
  mock.method(globalThis,'fetch',async()=>{throw new DOMException('fixture timeout','TimeoutError');});
  const r=await recommendDinnerService(input());assert.equal(r.ok,false);if(!r.ok){assert.equal(r.code,'error');assert.match(r.message,/too long/);}
});
test('unrelated tag hits cannot become restaurant or personal taste signals',async()=>{
  process.env.QLOO_API_KEY='test-only';
  mock.method(globalThis,'fetch',async()=>Response.json({results:{tags:[tag('Unrelated')]}}));
  const r=await recommendDinnerService(input());assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'error');
});

test('an avoid belonging only to friend B excludes an otherwise balanced candidate',async()=>{
  stub([place('clashing-balanced',['Wine','Seafood'],2,1),place('safe-a',['Japanese','Pasta']),place('safe-b',['Japanese','Pasta'])]);
  const request=input();request.b={...request.b,avoids:['Seafood']};
  const r=await recommendDinnerService(request);assert.equal(r.ok,true);
  if(r.ok)assert.deepEqual([r.best.id,...r.alternatives.map(p=>p.id)],['safe-a','safe-b']);
});
test('exactly two eligible candidates produce one primary and one alternative',async()=>{
  stub([place('balanced',['Japanese','Pasta']),place('alternative',['Wine'])]);
  const r=await recommendDinnerService(input());assert.equal(r.ok,true);
  if(r.ok){assert.equal(r.best.id,'balanced');assert.equal(r.alternatives.length,1);}
});
test('empty preset search never retries in a wider locality or drops the budget',async()=>{
  const calls: URL[]=[];stub([],200,calls);const request=input();request.location=LOCATIONS[1]!;request.budget='low';
  const r=await recommendDinnerService(request);assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'empty');
  const insights=calls.filter(c=>c.pathname==='/v2/insights');assert.equal(insights.length,1);
  const q=insights[0]!.searchParams;assert.equal(q.get('filter.location'),'POINT(-0.0795 51.5265)');
  assert.equal(q.get('filter.location.radius'),'2500');assert.equal(q.has('filter.location.query'),false);assert.equal(q.get('filter.price_level.max'),'1');
});

test('identical concurrent searches share work; later search reuses real tag lookups',async()=>{
  const calls:URL[]=[];stub([place('a',['Japanese','Pasta']),place('b',['Japanese','Pasta'])],200,calls);
  const [a,b]=await Promise.all([recommendDinnerService(input()),recommendDinnerService(input())]);
  assert.deepEqual(a,b);assert.equal(calls.filter(c=>c.pathname==='/v2/insights').length,1);
  assert.equal(calls.filter(c=>c.pathname==='/v2/tags').length,4);
  await recommendDinnerService(input());
  assert.equal(calls.filter(c=>c.pathname==='/v2/tags').length,4);
  assert.equal(calls.filter(c=>c.pathname==='/v2/insights').length,1);
});

test('first rate-limited tag lookup stops the rest of the search',async()=>{
  process.env.QLOO_API_KEY='test-only';let calls=0;
  mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({}, {status:429,headers:{'retry-after':'120'}});});
  const r=await recommendDinnerService(input());assert.equal(r.ok,false);assert.equal(calls,1);
});

test('one qualifying mutual candidate is returned without invented alternatives',async()=>{stub([place('single',['Japanese','Pasta'])]);const r=await recommendDinnerService(input());assert.equal(r.ok,true);if(r.ok){assert.equal(r.best.id,'single');assert.deepEqual(r.alternatives,[]);assert.match(r.rankingReason,/only returned restaurant/);}});

test('preset radius rejects outside, missing and invalid coordinates even if Qloo returns them',async()=>{
 const outside={...place('outside',['Japanese','Pasta']),location:{lat:41,lon:-74}};
 const missing={...place('missing',['Japanese','Pasta']),location:undefined};
 const invalid={...place('invalid',['Japanese','Pasta']),location:{lat:91,lon:0}};
 stub([outside,missing,invalid,place('inside',['Japanese','Pasta'])]);const request=input();request.location={...request.location,radiusMeters:20000,latitude:0,longitude:0};const r=await recommendDinnerService(request);assert.equal(r.ok,true);if(r.ok){assert.equal(r.best.id,'inside');assert.equal(r.alternatives.length,0);assert.equal(r.best.distanceMeters,0);}
});

test('equivalent message wording shares ranked-evidence cache and renders current names',async()=>{
 const calls:URL[]=[];stub([place('single',['Japanese','Pasta'])],200,calls);
 const first=await recommendDinnerService(input());assert.equal(first.ok,true);
 const request=input();request.message='Dinner please';request.a={...request.a,name:'Ada'};request.b={...request.b,name:'Ben'};
 const second=await recommendDinnerService(request);assert.equal(second.ok,true);
 assert.equal(calls.filter(c=>c.pathname==='/v2/insights').length,1);
 if(second.ok){assert.deepEqual(second.names,{a:'Ada',b:'Ben'});assert.match(second.summary,/Ada and Ben/);assert.doesNotMatch(second.summary,/Maya|Leo/);}
 request.requiredFood=['Thai'];const tightened=await recommendDinnerService(request);assert.equal(tightened.ok,false);
 assert.equal(calls.filter(c=>c.pathname==='/v2/insights').length,2);
});
