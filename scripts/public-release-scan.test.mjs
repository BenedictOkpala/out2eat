import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const scanner=resolve('scripts/check-public-release.mjs');
const fixture='fixture-private-value-for-git-scan-only';
function workspace(){const dir=mkdtempSync(join(tmpdir(),'out2eat-release-'));writeFileSync(join(dir,'.gitignore'),'.env.local\nartifacts/\n');writeFileSync(join(dir,'.env.local'),'QLOO_API_KEY='+fixture+'\n');return dir;}
function git(cwd,...args){const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,'fixture Git operation failed');}
function scan(cwd){const r=spawnSync(process.execPath,[scanner],{cwd,encoding:'utf8'});return {status:r.status,report:JSON.parse(r.stdout)};}
test('release scan detects a staged secret even after working copy is sanitized',()=>{
 const dir=workspace();try{git(dir,'init','-b','main');writeFileSync(join(dir,'app.txt'),fixture);git(dir,'add','app.txt');writeFileSync(join(dir,'app.txt'),'safe');const r=scan(dir);assert.equal(r.status,1);assert.ok(r.report.issues.some(i=>i.source==='Git index'&&i.reason==='matches a private configured value'));assert.ok(!r.report.issues.some(i=>i.source==='working tree'));}finally{rmSync(dir,{recursive:true,force:true});}
});
test('release scan detects committed secrets after latest commit removes them',()=>{
 const dir=workspace();try{git(dir,'init','-b','main');writeFileSync(join(dir,'app.txt'),fixture);git(dir,'add','app.txt');git(dir,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture');writeFileSync(join(dir,'app.txt'),'safe');git(dir,'add','app.txt');git(dir,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','safe');const r=scan(dir);assert.equal(r.status,1);assert.ok(r.report.issues.some(i=>i.source==='Git history'&&i.reason==='matches a private configured value'));}finally{rmSync(dir,{recursive:true,force:true});}
});
