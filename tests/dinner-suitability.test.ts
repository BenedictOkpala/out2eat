import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractPlaces, rankPlaces, isDessertFocused, recommendDinnerService, resetDiningState, distanceFromCentre, explainPrimaryRank, searchTags } from '../src/lib/dinner.service.ts';
import { DINING_TAGS } from '../src/lib/dining-tags.ts';
import { DEFAULT_A, DEFAULT_B, LOCATIONS, DEFAULT_LOCATION_ID, locationSearchLabel, lineFor, sharedLine, type DinnerRequest } from '../src/lib/dining.ts';
const synthetic = JSON.parse(readFileSync(new URL('./fixtures/dining-synthetic.json',import.meta.url),'utf8'));
const input=():DinnerRequest=>({a:structuredClone(DEFAULT_A),b:structuredClone(DEFAULT_B),location:LOCATIONS.find(l=>l.id==='wuse-ii')!,budget:'mid',message:'Food tonight?',history:[],excludeIds:[]});
const original=process.env.QLOO_API_KEY;
afterEach(()=>{mock.restoreAll();resetDiningState();if(original===undefined)delete process.env.QLOO_API_KEY;else process.env.QLOO_API_KEY=original;});

test('synthetic dessert-primary venues without dinner evidence are excluded, dinner restaurants with dessert tags remain',()=>{
 const places=extractPlaces(synthetic),cold=places.find(p=>p.name.startsWith('TEST FIXTURE Ice Cream'))!,chloe=places.find(p=>p.name.startsWith("TEST FIXTURE Cake Shop"))!;
 assert.equal(isDessertFocused(cold),true);assert.equal(isDessertFocused(chloe),true);
 const nkoyo=places.find(p=>p.name==='TEST FIXTURE One-sided Dinner')!;assert.equal(isDessertFocused(nkoyo),false);
 assert.equal(isDessertFocused({...cold,tags:[...cold.tags,{id:'urn:tag:dining_options:place:dinner',name:'Dinner'}]}),false);
 assert.equal(isDessertFocused({...nkoyo,tags:[...nkoyo.tags,{id:'urn:tag:genre:place:restaurant:dessert_shop',name:'Dessert shop'}]}),false);
});

test('synthetic food evidence for both outranks wine-only or one-sided overlap',()=>{
 const ranked=rankPlaces(extractPlaces(synthetic),input());
 assert.equal(ranked[0]!.name,'TEST FIXTURE Mutual Dinner');
 assert.deepEqual(ranked[0]!.foodA,['Seafood']);assert.deepEqual(ranked[0]!.foodB,['Italian']);
 const wineOnly=ranked.find(p=>p.name==='TEST FIXTURE Wine Only')!;assert.deepEqual(wineOnly.foodA,[]);assert.deepEqual(wineOnly.foodB,[]);
 assert.ok(ranked.indexOf(wineOnly)>ranked.findIndex(p=>p.name==='TEST FIXTURE One-sided Dinner'));
 assert.equal(ranked.some(p=>p.name.startsWith('TEST FIXTURE Ice Cream')||p.name.startsWith('TEST FIXTURE Cake Shop')),false);
 const food=ranked[0]!,wine={...wineOnly,affinity:1};
 assert.equal(rankPlaces([wine,{...food,affinity:0}],input())[0]!.name,'TEST FIXTURE Mutual Dinner');
 assert.deepEqual(rankPlaces(extractPlaces(synthetic),{...input(),a:DEFAULT_B,b:DEFAULT_A}).map(p=>p.id),ranked.map(p=>p.id));
});

test('weak per-friend and shared explanations do not claim a strong dinner fit',()=>{
 assert.match(lineFor('Leo',['Wine'],[],[]),/no food preference.*uncertain/i);
 assert.match(lineFor('Maya',[],[],[]),/No direct taste evidence.*uncertain/);
 assert.match(sharedLine('Maya','Leo',['Wine'],['Wine'],[],[]),/weak evidence for dinner/);
 assert.match(sharedLine('Maya','Leo',['Seafood','Wine'],['Wine'],['Seafood'],[]),/No direct food match for Leo/);
});

test('synthetic response replays through real service with Wuse constraints and preference exclusions',async()=>{
 resetDiningState(0);process.env.QLOO_API_KEY='fixture-only';let insights=0;
 mock.method(globalThis,'fetch',async(url:string)=>{
  const u=new URL(url);
  if(u.pathname==='/v2/tags'){const name=u.searchParams.get('filter.query')!;return Response.json({results:{tags:[{name,id:name==='restaurant'?'urn:tag:genre:place:restaurant':'urn:tag:cuisine:place:'+name,type:'urn:tag:cuisine:place'}]}});}
  insights++;assert.equal(u.searchParams.get('filter.location'),'POINT(7.4759718 9.0761981)');assert.equal(u.searchParams.get('filter.location.radius'),'2500');assert.equal(u.searchParams.get('filter.price_level.max'),'2');
  return Response.json(synthetic);
 });
 const response=await recommendDinnerService(input());assert.equal(response.ok,true);assert.equal(insights,1);
 if(response.ok){
  assert.equal(response.best.name,'TEST FIXTURE Mutual Dinner');assert.equal(response.best.dinnerEvidence,'both');
  assert.match(response.best.forA,/Seafood/);assert.match(response.best.forB,/Italian/);
  assert.ok(response.best.cuisines.includes('Italian'));
  assert.equal(response.best.address,'1 Synthetic Test Street');
  assert.ok(Math.abs(response.best.distanceMeters!-1111.950802)<0.01);
  assert.match(response.best.imageUrl!,/^https:\/\/example.com\//);
  assert.match(response.rankingReason,/taste-coverage.*Qloo-affinity/);
  assert.doesNotMatch(response.rankingReason,/cheaper|closer|rating|distance/i);
  assert.ok(response.best.cuisines.slice(0,3).includes('Seafood'));
  assert.ok(response.best.cuisines.slice(0,3).includes('Italian'));
  assert.deepEqual(response.best.evidenceA.filter(e=>e.kind==='food').map(e=>e.preference),['Seafood']);
  assert.deepEqual(response.best.evidenceB.filter(e=>e.kind==='food').map(e=>e.preference),['Italian']);
  assert.equal(response.alternatives.length,2);
  assert.equal(response.alternatives[0]!.dinnerEvidence,'both');assert.equal(response.alternatives[1]!.dinnerEvidence,'partial');
  for(const venue of [response.best,...response.alternatives]){assert.equal(venue.priceLabel,'Price level $$');assert.doesNotMatch(venue.name,/TEST FIXTURE Ice Cream|TEST FIXTURE Cake Shop/);}
 }
});

test('missing or invalid returned coordinates and details stay unknown; zero distance is valid',()=>{
 const unknown=extractPlaces({results:{entities:[{entity_id:'fixture-missing',name:'TEST FIXTURE missing details'}]}})[0]!;
 assert.equal(unknown.address,null);assert.equal(unknown.imageUrl,null);assert.equal(unknown.priceLevel,null);
 assert.equal(distanceFromCentre(unknown,input().location),null);
 const invalid=extractPlaces({results:{entities:[{entity_id:'fixture-invalid',name:'TEST FIXTURE invalid coordinates',location:{lat:91,lon:7}}]}})[0]!;
 assert.equal(invalid.latitude,null);assert.equal(distanceFromCentre(invalid,input().location),null);
 assert.equal(distanceFromCentre(input().location,input().location),0);
 assert.equal(distanceFromCentre({latitude:9,longitude:7},{latitude:null,longitude:null}),null);
});

test('rank explanations identify the first actual comparator difference, including ties',()=>{
 const a=rankPlaces(extractPlaces(synthetic),input())[0]!;
 const b={...a,name:'TEST FIXTURE alternative'};
 assert.match(explainPrimaryRank({...a,foodA:['Seafood'],foodB:['Italian']},[{...b,foodB:[]}]),/balanced food/);
 assert.match(explainPrimaryRank({...a,foodA:['Seafood','Sushi'],foodB:['Italian']},[b]),/more food matches overall/);
 assert.match(explainPrimaryRank({...a,score:10},[{...b,score:9}]),/taste-coverage.*Qloo-affinity/);
 assert.match(explainPrimaryRank({...a,score:10,affinity:0.8},[{...b,score:10,affinity:0.5}]),/affinity puts this choice first/);
 assert.match(explainPrimaryRank(a,[b]),/no quality advantage claimed/);
 const mixed=explainPrimaryRank({...a,score:10},[{...b,foodB:[]},{...b,name:'TEST FIXTURE tied food',score:9}]);
 assert.match(mixed,/Above TEST FIXTURE alternative/);assert.match(mixed,/Above TEST FIXTURE tied food/);
});

test('Wuse preset is added without replacing the existing location defaults',()=>{
 assert.equal(LOCATIONS[0]!.id,'west-village');assert.equal(LOCATIONS.length,6);
 assert.deepEqual(input().location,{id:'wuse-ii',label:'Wuse II, Abuja',locality:'Abuja, Nigeria',latitude:9.0761981,longitude:7.4759718,radiusMeters:2500});
});

test('a drinks-only search returns an honest no-match instead of a primary',async()=>{
 resetDiningState(0);process.env.QLOO_API_KEY='fixture-only';
 mock.method(globalThis,'fetch',async(url:string)=>{
  const u=new URL(url),name=u.searchParams.get('filter.query');
  return u.pathname==='/v2/tags'?Response.json({results:{tags:[{name,id:name==='restaurant'?'urn:tag:genre:place:restaurant':'urn:tag:cuisine:place:'+name,type:'urn:tag:cuisine:place'}]}}):Response.json(synthetic);
 });
 const request=input();request.a.likes=['Wine'];request.b.likes=['Wine'];
 const r=await recommendDinnerService(request);assert.equal(r.ok,false);
 if(!r.ok){assert.equal(r.code,'empty');assert.match(r.message,/Drinks and atmosphere alone do not qualify/);}
});

test('synthetic generic Food is not Fast food; mutual alternative uses only supported cuisine matches',()=>{
 const ranked=rankPlaces(extractPlaces(synthetic),input());
 const ny=ranked.find(p=>p.name==='TEST FIXTURE Mutual Dinner')!,a=ranked.find(p=>p.name==='TEST FIXTURE Mutual Alternative')!;
 assert.ok(ny.tags.some(t=>t.name==='Food'));assert.deepEqual(ny.avoidA,[]);assert.deepEqual(ny.avoidB,[]);
 assert.deepEqual(a.foodA,['Seafood']);assert.deepEqual(a.foodB,['Italian']);
 assert.equal(a.evidenceA.find(e=>e.preference==='Quiet')!.tagId,'urn:tag:ambience:qloo:quiet');
 assert.equal(a.evidenceB.some(e=>e.preference==='Pasta'),false);
 assert.equal(a.evidenceA.some(e=>e.preference==='Japanese'),false);
 assert.equal(a.evidenceA.some(e=>e.preference==='Wine'),false);
});

test('neighbourhood or customer-identity labels cannot become food evidence',()=>{
 const place=extractPlaces({results:{entities:[{entity_id:'test-false-food',name:'TEST FIXTURE unsupported food',tags:[
  {id:'urn:tag:customer_identity:qloo:seafood_lovers',name:'Seafood lovers'},
  {id:'urn:tag:neighborhood_characteristic:qloo:italian',name:'Italian'},
  {id:'urn:tag:neighborhood_characteristic:qloo:quiet',name:'Quiet'},
 ]}]}})[0]!;
 const ranked=rankPlaces([place],input())[0]!;
 assert.deepEqual(ranked.foodA,[]);assert.deepEqual(ranked.foodB,[]);assert.deepEqual(ranked.evidenceA,[]);
});

test('one-sided food plus shared wine cannot become a primary in synthetic data',async()=>{
 resetDiningState(0);process.env.QLOO_API_KEY='fixture-only';
 mock.method(globalThis,'fetch',async(url:string)=>{
  const u=new URL(url),name=u.searchParams.get('filter.query');
  return u.pathname==='/v2/tags'?Response.json({results:{tags:[{name,id:'urn:tag:cuisine:place:'+name,type:'urn:tag:cuisine:place'}]}}):Response.json(synthetic);
 });
 const request=input();request.b.likes=['Japanese','Wine'];
 const r=await recommendDinnerService(request);assert.equal(r.ok,false);
 if(!r.ok){assert.equal(r.code,'empty');assert.match(r.message,/supported food preferences for both/);}
});

test('stable catalogue IDs and labels exist in synthetic Qloo tags; partial lookup guesses are rejected',async()=>{
 const tags=synthetic.results.entities.flatMap((place:{tags:unknown[]})=>place.tags);
 for(const tag of Object.values(DINING_TAGS))assert.ok(tags.some((returned:{id:string;name:string})=>returned.id===tag.id&&returned.name===tag.name));
 resetDiningState(0);process.env.QLOO_API_KEY='fixture-only';let calls=0;
 mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({results:{tags:[{id:'urn:tag:specialty_dish:place:very_spicy_tofu_mabo_tofu',name:'Very spicy tofu mabo tofu',type:'urn:tag:specialty_dish:place'}]}});});
 assert.equal(await searchTags('Very spicy'),null);assert.equal(await searchTags('Very spicy'),null);assert.equal(calls,1);
 assert.equal((await searchTags('Fast food'))!.id,'urn:tag:genre:place:restaurant:fast_food');assert.equal(calls,1);
});

test('verified Abuja examples use strict circles and Wuse is the fresh-session default',()=>{
 assert.equal(DEFAULT_LOCATION_ID,'wuse-ii');
 const maitama=LOCATIONS.find(l=>l.id==='maitama');
 assert.deepEqual([maitama.latitude,maitama.longitude,maitama.radiusMeters],[9.0900989,7.4908053,2500]);
 assert.equal(locationSearchLabel(maitama),'within 2.5 km of Maitama, Abuja');
 assert.equal(locationSearchLabel(input().location),'within 2.5 km of Wuse II, Abuja');
 assert.equal(locationSearchLabel(LOCATIONS.find(l=>l.id==='le-marais')),'within 2 km of Le Marais');
});
