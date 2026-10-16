import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnv } from './with-app-env.mjs';
test('missing files preserve inherited variables',()=>{
 const root=mkdtempSync(join(tmpdir(),'out2eat-env-'));assert.deepEqual(loadLocalEnv(root,{PATH:'fixture'}),{PATH:'fixture'});
});
test('root .env is loaded and local overrides it without changing inherited variables',()=>{
 const root=mkdtempSync(join(tmpdir(),'out2eat-env-'));
 writeFileSync(join(root,'.env'),'QLOO_API_KEY=fixture-base\nBASE_ONLY=yes\n');
 writeFileSync(join(root,'.env.local'),'QLOO_API_KEY="fixture-local"\nLOCAL_ONLY=yes\n');
 assert.equal(loadLocalEnv(root,{}).QLOO_API_KEY,'fixture-local');
 const inherited={QLOO_API_KEY:'fixture-process'};const env=loadLocalEnv(root,inherited);
 assert.equal(env.QLOO_API_KEY,'fixture-process');assert.equal(env.BASE_ONLY,'yes');assert.equal(env.LOCAL_ONLY,'yes');assert.deepEqual(inherited,{QLOO_API_KEY:'fixture-process'});
});
