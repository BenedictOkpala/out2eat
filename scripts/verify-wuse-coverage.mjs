// One controlled live search. Run only when explicitly authorized.
import { existsSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadLocalEnv, projectRoot } from './with-app-env.mjs';
import { recommendDinnerService, extractPlaces, rankPlaces } from '../src/lib/dinner.service.ts';
import { DEFAULT_A, DEFAULT_B } from '../src/lib/dining.ts';
if (existsSync('artifacts/wuse-coverage.json')) throw new Error('Coverage report already exists; refusing another live search. Review the saved report instead.');
Object.assign(process.env, loadLocalEnv(projectRoot()));
const centre={latitude:9.0761981,longitude:7.4759718};
const input={a:structuredClone(DEFAULT_A),b:structuredClone(DEFAULT_B),message:'Food tonight?',budget:'mid',
 location:{id:'wuse-ii-audit',label:'Wuse II, Abuja, Nigeria',locality:'Abuja, Nigeria',...centre,radiusMeters:2500},history:[],excludeIds:[]};
const nativeFetch=globalThis.fetch;
const calls=[];let insights=null;
globalThis.fetch=async(url,options)=>{
 const u=new URL(url);const start=performance.now();
 const response=await nativeFetch(url,options);
 calls.push({path:u.pathname,params:Object.fromEntries(u.searchParams),status:response.status,durationMs:Math.round(performance.now()-start),
  rateHeaders:Object.fromEntries([...response.headers].filter(([name])=>/retry-after|ratelimit|rate-limit/i.test(name)))});
 if(u.pathname==='/v2/insights'&&response.ok)insights=await response.clone().json();
 return response;
};
const started=performance.now();let response;
try{response=await recommendDinnerService(input);}finally{globalThis.fetch=nativeFetch;}
const totalResponseMs=Math.round(performance.now()-started);
const entities=Array.isArray(insights?.results)?insights.results:insights?.results?.entities??[];
function coordinates(entity){
 const candidates=[entity.location,entity.properties?.location,entity.properties?.geocode];
 for(const c of candidates){
  const lat=c?.lat??c?.latitude,lon=c?.lon??c?.lng??c?.longitude;
  if(typeof lat==='number'&&typeof lon==='number'&&Math.abs(lat)<=90&&Math.abs(lon)<=180)return {latitude:lat,longitude:lon};
 }
 return null;
}
function distance(c){
 const rad=x=>x*Math.PI/180,dlat=rad(c.latitude-centre.latitude),dlon=rad(c.longitude-centre.longitude);
 const a=Math.sin(dlat/2)**2+Math.cos(rad(centre.latitude))*Math.cos(rad(c.latitude))*Math.sin(dlon/2)**2;
 return 6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}
const ranked=insights?rankPlaces(extractPlaces(insights),input):[];
const venues=ranked.map(p=>{
 const raw=entities.find(e=>e.entity_id===p.id),coords=coordinates(raw??{}),distanceMeters=coords?distance(coords):null;
 return {id:p.id,name:p.name,coordinates:coords,distanceMeters,insideRadius:distanceMeters!==null&&distanceMeters<=2500,
  priceLevel:p.priceLevel,budgetEligible:p.priceLevel!==null&&p.priceLevel<=2,
  evidenceForMaya:p.hitsA,evidenceForLeo:p.hitsB,avoidedTags:[...p.avoidA,...p.avoidB],returnedTags:p.tags.map(t=>t.name)};
});
const suitable=venues.filter(v=>v.insideRadius&&v.budgetEligible&&!v.avoidedTags.length);
const report={centre,centreSource:'https://www.openstreetmap.org/node/31384766',radiusMeters:2500,budget:'mid',profiles:input.a.name+' and '+input.b.name,
 totalResponseMs,calls,apiCandidateCount:entities.length,verifiedSuitableCount:suitable.length,
 countWithEvidenceForBoth:suitable.filter(v=>v.evidenceForMaya.length&&v.evidenceForLeo.length).length,
 suitable,allReturnedCandidates:venues,appResponse:response};
writeFileSync('artifacts/wuse-qloo-raw.json',JSON.stringify(insights,null,2));
writeFileSync('artifacts/wuse-coverage.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({totalResponseMs,calls:calls.length,apiCandidateCount:entities.length,verifiedSuitableCount:suitable.length,
 countWithEvidenceForBoth:report.countWithEvidenceForBoth,suitable:suitable.map(({returnedTags,...venue})=>venue)},null,2));
