import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness has no declaration file.
import { archivePinnedTarget, parseDescriptors, runPinnedTarget, runPinnedTargets } from '../../scripts/parity-baseline/lib/targets.mjs';
// @ts-expect-error JavaScript harness has no declaration file.
import { assertRoots } from '../../scripts/parity-baseline/lib/isolation.mjs';
const revision='a'.repeat(40), target={id:'fork',revision}, toolchain={schemaVersion:1,node:'22.19.0',pnpm:'11.1.1',vitest:'4.1.7',piPackage:'@earendil-works/pi-coding-agent',network:'denied',inputs:'local-only',archiveFormat:'tar',archiveHash:'sha256',extraction:'read-only'};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex'), canonicalize=(value:unknown)=>JSON.stringify(value);
const filesystem=(symlink=(value:string)=>false)=>({realpath:(value:string)=>value.replace('/alias','/real'),nearestExisting:(value:string)=>value,lstat:(value:string)=>({isSymbolicLink:()=>symlink(value)}),mkdir:()=>undefined,writeFile:()=>undefined});
const result=(entries:any[]=[{path:'ok',type:'file',content:'yes',sha256:hash('yes')}], revisionSeen=revision)=>({revision:revisionSeen,entries,manifest:entries.filter(x=>x.type==='file').map(x=>({path:x.path,sha256:x.sha256})),manifestDigest:hash(canonicalize(entries.filter(x=>x.type==='file').map(x=>({path:x.path,sha256:x.sha256}))))});
const archiveSeams=(overrides:any={})=>({filesystem:filesystem(),hash,canonicalize,archive:()=>result(),...overrides});
describe('PR3a pinned archive isolation',()=>{
 it('requires the exact descriptor schema, complete target set, and exact toolchain values',()=>{
  const valid={schemaVersion:1,targets:[target,{id:'upstream',revision:'b'.repeat(40)}]}; expect(parseDescriptors(valid,toolchain).targets).toHaveLength(2);
  for(const bad of [{schemaVersion:1,targets:[target]},{schemaVersion:1,targets:[target,{...target,id:'fork'}]},{schemaVersion:1,targets:[target,{id:'third',revision:revision}]},{schemaVersion:1,targets:[target,{id:'upstream',revision:'A'.repeat(40)}]},{schemaVersion:1,targets:[target,{id:'upstream',revision:'b'.repeat(40)}],repository:'/live'}]) expect(()=>parseDescriptors(bad,toolchain)).toThrow();
  for(const bad of [{...toolchain,network:'live'},{...toolchain,node:22},{...toolchain,archiveFormat:'zip'},{...toolchain,archiveHash:'md5'},{...toolchain,extraction:'copy'},{...toolchain,extra:'x'}]) expect(()=>parseDescriptors(valid,bad)).toThrow();
 });
 it('binds archive target and revision and validates digest plus complete file manifest before writes',()=>{
  const calls:any[]=[]; const seams=archiveSeams({archive:(request:any)=>{calls.push(request);return result();}}); expect(archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams})).toBe('/out'); expect(calls).toEqual([{targetId:'fork',revision}]);
  for(const [bad,message] of [[{...result(),revision:'b'.repeat(40)},'archive revision or manifest mismatch'],[{...result(),manifest:[],manifestDigest:hash(canonicalize([]))},'manifest entries mismatch'],[{...result(),manifest:[{path:'extra',sha256:hash('extra')}],manifestDigest:hash(canonicalize([{path:'extra',sha256:hash('extra')}]))},'manifest entries mismatch'],[{...result(),manifestDigest:'f'.repeat(64)},'archive revision or manifest mismatch']]) expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>bad})})).toThrow(message);
 });
 it('rejects every unsafe archive shape and existing intermediate or leaf symlink',()=>{
  const cases=[[{path:'',type:'file',content:'x',sha256:hash('x')}],[{path:'.',type:'file',content:'x',sha256:hash('x')}],[{path:'a\\b',type:'file',content:'x',sha256:hash('x')}],[{path:'../a',type:'file',content:'x',sha256:hash('x')}],[{path:'a',type:'other'}],[{path:'a',type:'file',content:'x',sha256:hash('x')},{path:'a',type:'file',content:'x',sha256:hash('x')}],[{path:'a',type:'file',content:'x',sha256:hash('x')},{path:'a/b',type:'file',content:'y',sha256:hash('y')}]];
  for(const entries of cases) expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>result(entries)})})).toThrow();
  for(const escaped of ['/out/a','/out/a/b']) expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({filesystem:filesystem(value=>value===escaped),archive:()=>result([{path:'a/b',type:'file',content:'x',sha256:hash('x')}])})})).toThrow();
 });
 it('rejects repository equality, lexical nesting, and physical aliases',()=>{
  const fs=filesystem(); expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/repo',seams:archiveSeams({filesystem:fs})})).toThrow();
  expect(()=>assertRoots('/repo',{source:'/real/a',archive:'/alias/a',execution:'/tmp/c',output:'/tmp/d',fixture:'/tmp/e'},{realpath:fs.realpath,nearestExisting:fs.nearestExisting})).toThrow();
  expect(()=>assertRoots('/repo',{source:'/tmp/a',archive:'/tmp/a/b',execution:'/tmp/c',output:'/tmp/d',fixture:'/tmp/e'},{realpath:fs.realpath,nearestExisting:fs.nearestExisting})).toThrow();
 });
 it('rejects public two-target session cross-root shapes before archive writes and keeps targets independent',()=>{
  const targets=[target,{id:'upstream',revision:'b'.repeat(40)}], calls:any[]=[]; const base={...archiveSeams({archive:({revision}:any)=>{calls.push('archive');return result(undefined,revision);}}),allocate:(id:string,name:string)=>`/tmp/${id}/${name}`,cleanup:()=>undefined};
  const run=(allocate=base.allocate)=>runPinnedTargets({repositoryRoot:'/repo',outputRoot:'/tmp',targets,seams:{...base,allocate},callback:(values:any)=>values});
  expect(Object.keys(run())).toEqual(['fork','upstream']); expect(calls).toEqual(['archive','archive']);
  for(const allocate of [(id:string,name:string)=>`/tmp/${name}`,(id:string,name:string)=>id==='fork'?`/tmp/fork/${name}`:`/tmp/fork/${name}/child`, (id:string,name:string)=>id==='fork'?`/alias/${name}`:`/real/${name}`]) expect(()=>run(allocate)).toThrow();
  expect(()=>runPinnedTargets({repositoryRoot:'/repo',outputRoot:'/tmp',targets:[target,{id:'upstream',revision:revision}],seams:base,callback:()=>null})).toThrow();
  expect(calls).toEqual(['archive','archive']);
 });
 it('rejects malformed public seam/result shapes, unsorted manifests, digest mismatches, and output-root descendants',()=>{
  expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:{}})).toThrow('invalid archive request');
  const unsortedManifest=[{path:'z',sha256:hash('z')},{path:'a',sha256:hash('a')}];
  expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>({...result(),manifest:unsortedManifest,manifestDigest:hash(canonicalize(unsortedManifest))})})})).toThrow('invalid manifest');
  const duplicateManifest=[{path:'ok',sha256:hash('yes')},{path:'ok',sha256:hash('yes')}];
  expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>({...result(),manifest:duplicateManifest,manifestDigest:hash(canonicalize(duplicateManifest))})})})).toThrow('invalid manifest');
  expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>result([{path:'z',type:'file',content:'z',sha256:hash('z')},{path:'a',type:'file',content:'a',sha256:hash('a')}])})})).toThrow('unsafe archive entry');
  expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>result([{path:'x',type:'file',content:'x',sha256:hash('different')}])})})).toThrow('invalid archive content');
  expect(()=>runPinnedTarget({repositoryRoot:'/repo',outputRoot:'/repo/child',target,seams:{...archiveSeams(),allocate:(name:string)=>`/tmp/${name}`,cleanup:()=>undefined},callback:()=>null})).toThrow();
  expect(()=>runPinnedTargets({repositoryRoot:'/repo',targets:[target,{id:'upstream',revision:'b'.repeat(40)}],seams:{...archiveSeams(),allocate:()=>'/tmp/a',cleanup:()=>undefined},callback:()=>null})).toThrow();
 });
 it('rejects malformed SHA-256 and public lstat/archive seams before writes',()=>{
  const badDigest='f'.repeat(63), writes:any[]=[];
  for(const bad of [{...result(),manifestDigest:badDigest},{...result(),entries:[{path:'x',type:'file',content:'x',sha256:badDigest}]},{...result(),manifest:[{path:'ok',sha256:badDigest}],manifestDigest:hash(canonicalize([{path:'ok',sha256:badDigest}]))}]) expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>bad})})).toThrow();
  expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({hash:()=>badDigest})})).toThrow();
  expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>({})})})).toThrow();
  for(const lstat of [()=>true,()=>false,()=>'',()=>({}),()=>({isSymbolicLink:false})]) expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({filesystem:{...filesystem(),lstat,mkdir:()=>writes.push('write')}})})).toThrow();
  expect(archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({filesystem:{...filesystem(),lstat:()=>({isSymbolicLink:()=>false})}})})).toBe('/out');
  expect(archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({filesystem:{...filesystem(),lstat:()=>undefined}})})).toBe('/out');
  expect(writes).toEqual([]);
 });
 it('rejects normalized collisions, absolute paths, and symlink archive entries through the public seam',()=>{
  for(const entries of [[{path:'a/./b',type:'file',content:'x',sha256:hash('x')},{path:'a/b',type:'file',content:'y',sha256:hash('y')}],[{path:'/absolute',type:'file',content:'x',sha256:hash('x')}],[{path:'link',type:'symlink'}]]) expect(()=>archivePinnedTarget({target,repositoryRoot:'/repo',destination:'/out',seams:archiveSeams({archive:()=>result(entries)})})).toThrow();
 });
 it('cleans every successful allocation in reverse order for allocation and archive failures',()=>{
  const targets=[target,{id:'upstream',revision:'b'.repeat(40)}], allocated:string[]=[];
  const allocate=(id:string,name:string)=>{const value=`/tmp/${id}-${name}`; if(value.endsWith('upstream-execution'))throw Error('allocate'); allocated.push(value); return value;};
  expect(()=>runPinnedTargets({repositoryRoot:'/repo',targets,seams:{...archiveSeams(),allocate,cleanup:(root:string)=>allocated.push(`clean:${root}`)},callback:()=>null})).toThrow('allocate');
  expect(allocated.filter(x=>x.startsWith('clean:')).map(x=>x.slice(6))).toEqual(allocated.filter(x=>!x.startsWith('clean:')).reverse());
  const cleaned:string[]=[]; expect(()=>runPinnedTargets({repositoryRoot:'/repo',targets,seams:{...archiveSeams({archive:()=>{throw Error('archive');}}),allocate:(id:string,name:string)=>`/tmp/${id}-${name}`,cleanup:(root:string)=>cleaned.push(root)},callback:()=>null})).toThrow('archive');
  expect(cleaned).toEqual(['upstream-fixture','upstream-output','upstream-execution','upstream-archive','upstream-source','fork-fixture','fork-output','fork-execution','fork-archive','fork-source'].map(x=>`/tmp/${x}`));
 });
 it('allocates independent roots and preserves primary and cleanup failures in reverse cleanup order',()=>{
  const calls:string[]=[]; const seams={...archiveSeams(),allocate:(name:string)=>`/out/${name}`,cleanup:(value:string)=>{calls.push(path.basename(value));if(value.endsWith('fixture'))throw Error('cleanup');}};
  let error:any; try { runPinnedTarget({repositoryRoot:'/repo',outputRoot:'/out',target,seams,callback:()=>{throw Error('callback');}}); } catch(value) { error=value; } expect(error).toBeInstanceOf(AggregateError); expect(error.errors.map((x:Error)=>x.message)).toEqual(['callback','cleanup']); expect(calls).toEqual(['fixture','output','execution','archive','source']);
  const cleanupOnly=Error('cleanup-only'), cleanupCalls:string[]=[]; let cleanupError:any;
  try { runPinnedTarget({repositoryRoot:'/repo',outputRoot:'/out',target,seams:{...archiveSeams(),allocate:(name:string)=>`/out/${name}`,cleanup:(value:string)=>{cleanupCalls.push(path.basename(value));throw cleanupOnly;}},callback:()=>null}); } catch(value) { cleanupError=value; }
  expect(cleanupError).toBeInstanceOf(AggregateError); expect(cleanupError.errors[0]).toBe(cleanupOnly); expect(cleanupError.errors[1]).toBe(cleanupOnly); expect(cleanupError.errors[2]).toBe(cleanupOnly); expect(cleanupError.errors[3]).toBe(cleanupOnly); expect(cleanupError.errors[4]).toBe(cleanupOnly); expect(cleanupCalls).toEqual(['fixture','output','execution','archive','source']);
  const archivePrimary=Error('archive-primary'), cleanupOne=Error('cleanup-one'), cleanupTwo=Error('cleanup-two'), archiveCleanupCalls:string[]=[]; let archiveCleanupError:any;
  try { runPinnedTarget({repositoryRoot:'/repo',outputRoot:'/out',target,seams:{...archiveSeams({archive:()=>{throw archivePrimary;}}),allocate:(name:string)=>`/out/${name}`,cleanup:(value:string)=>{archiveCleanupCalls.push(path.basename(value));if(value.endsWith('fixture'))throw cleanupOne;if(value.endsWith('archive'))throw cleanupTwo;}},callback:()=>null}); } catch(value) { archiveCleanupError=value; }
  expect(archiveCleanupError).toBeInstanceOf(AggregateError); expect(archiveCleanupError.errors[0]).toBe(archivePrimary); expect(archiveCleanupError.errors[1]).toBe(cleanupOne); expect(archiveCleanupError.errors[2]).toBe(cleanupTwo); expect(archiveCleanupCalls).toEqual(['fixture','output','execution','archive','source']);
  expect(()=>runPinnedTarget({repositoryRoot:'/repo',outputRoot:'/out',target,seams:{...seams,allocate:(name:string)=>{if(name==='execution')throw Error('allocate');return `/out/${name}`;}},callback:()=>null})).toThrow('allocate');
  let sequence=0; const clean={...seams,allocate:(name:string)=>`/out/${sequence++}-${name}`,cleanup:()=>undefined}; const fork=runPinnedTarget({repositoryRoot:'/repo',outputRoot:'/out',target,seams:clean,callback:(roots:any)=>roots.execution}); const upstream=runPinnedTarget({repositoryRoot:'/repo',outputRoot:'/out',target:{id:'upstream',revision:'b'.repeat(40)},seams:{...clean,archive:()=>result([{path:'ok',type:'file',content:'yes',sha256:hash('yes')}],'b'.repeat(40))},callback:(roots:any)=>roots.execution}); expect(fork).not.toBe(upstream);
 });
});
