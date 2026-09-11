import {execFileSync} from 'node:child_process'
for(const [script,engine] of [['measure-performance.mjs','chrome'],['measure-performance.mjs','webkit'],['measure-interactions.mjs','chrome']]){
 execFileSync(process.execPath,['scripts/'+script],{stdio:'inherit',env:{...process.env,PERF_LABEL:'final',PERF_ENGINE:engine}})
}
