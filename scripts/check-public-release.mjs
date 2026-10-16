// Read-only publication scan. Print paths/categories, never matched secret text.
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
const excluded=new Set(['.git','node_modules','.npm-cache','.grok','.tanstack','.vercel','.output','dist','artifacts','screenshots','test-results','playwright-report','AGENTS.md','AGENTS.project.md','.node_modules.lock']);
const ignored=p=>p.split('/').some(x=>excluded.has(x))||p.split('/').some(x=>x.startsWith('.env')&&x!=='.env.example')||/\.(log|pid|har)$/i.test(p);
const files=[],issues=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const abs=join(dir,entry.name),rel=relative(root,abs).replaceAll('\\','/');if(ignored(rel))continue;if(entry.isSymbolicLink()){issues.push({file:rel,reason:'symlink requires review'});continue;}if(entry.isDirectory())walk(abs);else files.push(rel);}}
walk(root);
const secrets=new Set();
for(const name of ['.env','.env.local'])if(existsSync(name)){for(const [key,value]of Object.entries(parseEnv(readFileSync(name,'utf8'))))if(/KEY|TOKEN|SALT|PASSWORD|SECRET|REDIS_REST_URL/.test(key)&&value.trim().length>=12)secrets.add(value.trim());}
function inspect(bytes,file,source='working tree'){
 const text=bytes.toString('utf8');
 if([...secrets].some(value=>bytes.includes(Buffer.from(value))))issues.push({file,source,reason:'matches a private configured value'});
 if(/(?:gsk_[A-Za-z0-9]{25,}|hack_[a-f0-9]{32,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(text))issues.push({file,source,reason:'credential-shaped content'});
 if(/"entity_id"\s*:\s*"[a-f0-9]{8}-[a-f0-9-]{27,}"/i.test(text))issues.push({file,source,reason:'possible recorded provider entity'});
}
for(const file of files){
 inspect(readFileSync(file),file);
 if(/(?:recording|coverage|response|trace)[^/]*\.(?:json|jsonl|csv|har)$/i.test(file))issues.push({file,reason:'possible private response artifact'});
}
function git(args){
 const result=spawnSync('git',args,{maxBuffer:32*1024*1024});
 if(result.status!==0)throw Error('Git audit unavailable');return result.stdout;
}
function inspectObjects(revisions,source){
 if(!revisions.length)return;
 const batch=spawnSync('git',['cat-file','--batch'],{input:revisions.map(r=>r.ref+'\n').join(''),maxBuffer:32*1024*1024});
 if(batch.status!==0)throw Error('Git object audit unavailable');
 let offset=0;
 for(const revision of revisions){
  const newline=batch.stdout.indexOf(10,offset);if(newline<0)throw Error('Incomplete Git audit');
  const header=batch.stdout.subarray(offset,newline).toString('utf8').split(' ');
  const size=Number(header[2]);if(!Number.isSafeInteger(size)||size<0)throw Error('Invalid Git object audit');
  offset=newline+1;if(offset+size>=batch.stdout.length)throw Error('Incomplete Git object');
  if(header[1]==='blob')inspect(batch.stdout.subarray(offset,offset+size),revision.file,source);
  offset+=size+1;
 }
}
if(existsSync('.git')){
 try{
  const tracked=git(['ls-files','-z']).toString('utf8').split('\0').filter(Boolean);
  for(const file of tracked)if(ignored(file))issues.push({file,reason:'private/generated file already tracked; ignore rules do not untrack it'});
  inspectObjects(tracked.map(file=>({ref:':'+file,file})),'Git index');
  const committed=git(['rev-list','--objects','--all']).toString('utf8').trim().split('\n').filter(Boolean).map(line=>{
   const split=line.indexOf(' ');return {ref:split<0?line:line.slice(0,split),file:split<0?'committed object':line.slice(split+1)};
  });
  inspectObjects(committed,'Git history');
 }catch{issues.push({file:'.git',reason:'tracked/index/history audit failed'});}
}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/public-source-manifest.json',JSON.stringify({files,issues},null,2));
console.log(JSON.stringify({ok:issues.length===0,filesScanned:files.length,configuredSecretValuesChecked:secrets.size,gitRepositoryPresent:existsSync('.git'),issues},null,2));
process.exitCode=issues.length?1:0;
