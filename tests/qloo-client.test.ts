import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQlooClient, rateInfo } from '../src/lib/qloo-client.ts';

test('Retry-After seconds/date and reset headers use the latest deadline', () => {
  const now = Date.UTC(2026, 9, 15);
  assert.equal(rateInfo(new Headers({'retry-after':'3'}), now).retryAfterMs, 3000);
  assert.equal(rateInfo(new Headers({'retry-after':new Date(now+5000).toUTCString()}), now).retryAfterMs, 5000);
  assert.equal(rateInfo(new Headers({'retry-after':'3','x-ratelimit-reset':String(now/1000+8)}), now).retryAfterMs, 8000);
  assert.equal(rateInfo(new Headers({'ratelimit-reset':'7'}), now).retryAfterMs, 7000);
  assert.equal(rateInfo(new Headers({'retry-after':'invalid'}), now).retryAfterMs, null);
});

test('serializes parallel callers and spaces starts; one bounded provider-directed retry', async () => {
  let now=0;const starts:number[]=[];const statuses=[429,200,200];
  const client=createQlooClient({now:()=>now,sleep:async ms=>{now+=ms;},spacingMs:2000,
    fetch:async()=>{starts.push(now);const status=statuses.shift()!;return Response.json({}, {status,headers:status===429?{'retry-after':'3'}:{}});}});
  const budget={remaining:1};
  await Promise.all([client.get('/v2/tags',{},'fixture-only',budget),client.get('/v2/insights',{},'fixture-only',budget)]);
  assert.deepEqual(starts,[0,3000,5000]);assert.equal(budget.remaining,0);
});

test('long cooldown is never shortened; further callers make no requests', async () => {
  let calls=0;const client=createQlooClient({now:()=>0,sleep:async()=>{throw Error('must not sleep');},
    fetch:async()=>{calls++;return Response.json({}, {status:429,headers:{'retry-after':'120'}});}});
  const budget={remaining:1};
  await assert.rejects(()=>client.get('/v2/tags',{},'fixture-only',budget),{status:429,retryAt:120000});
  await assert.rejects(()=>client.get('/v2/tags',{},'fixture-only',budget),{status:429});
  assert.equal(calls,1);
});

test('missing retry headers cool down for 60 seconds, with no blind retry', async () => {
  let calls=0;const client=createQlooClient({now:()=>0,fetch:async()=>{calls++;return Response.json({}, {status:429});}});
  await assert.rejects(()=>client.get('/v2/tags',{},'fixture-only',{remaining:1}),{retryAt:60000});
  assert.equal(calls,1);
});

test('second 429 exhausts the search-wide retry budget', async () => {
  let now=0,calls=0;const client=createQlooClient({now:()=>now,sleep:async ms=>{now+=ms;},spacingMs:0,
    fetch:async()=>{calls++;return Response.json({}, {status:429,headers:{'retry-after':'1'}});}});
  await assert.rejects(()=>client.get('/v2/tags',{},'fixture-only',{remaining:1}),{status:429});assert.equal(calls,2);
});

test('zero remaining on a successful response delays the next caller until reset', async () => {
  let now=0;const starts:number[]=[];
  const client=createQlooClient({now:()=>now,sleep:async ms=>{now+=ms;},spacingMs:0,
    fetch:async()=>{starts.push(now);return Response.json({}, {headers:starts.length===1?{'ratelimit-remaining':'0','ratelimit-reset':'4'}:{}});}});
  await client.get('/v2/tags',{},'fixture-only',{remaining:1});
  await client.get('/v2/insights',{},'fixture-only',{remaining:1});
  assert.deepEqual(starts,[0,4000]);
});

test('actual Qloo second/month window headers wait only for exhausted windows',()=>{
 const headers=new Headers({'x-second-ratelimit-limit':'5','x-second-ratelimit-remaining':'0','x-second-ratelimit-reset':'0.5','x-month-ratelimit-remaining':'9970','x-month-ratelimit-reset':'2590989.44'});
 assert.equal(rateInfo(headers,0).retryAfterMs,500);
 headers.set('x-month-ratelimit-remaining','0');assert.equal(rateInfo(headers,0).retryAfterMs,2590989440);
});
