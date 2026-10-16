// Out2Eat's server-side local environment loader. File settings are never
// Vite client defines; the existing shell still has the highest precedence.
import {readFileSync,realpathSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
export function projectRoot(){return dirname(dirname(fileURLToPath(import.meta.url)));}
export function loadLocalEnv(root,inherited=process.env){
 let settings={};
 for(const name of ['.env','.env.local']){
  try{settings={...settings,...parseEnv(readFileSync(join(root,name),'utf8'))};}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return {...settings,...inherited};
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 const [command,...args]=process.argv.slice(2);
 if(command!=='vite')throw Error('Use this launcher with the project Vite scripts.');
 const child=spawn(process.execPath,[join(projectRoot(),'node_modules/vite/bin/vite.js'),...args],{stdio:'inherit',env:loadLocalEnv(projectRoot())});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.on('error',()=>{console.error('Out2Eat launcher could not start Vite.');process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code??1;});
}
