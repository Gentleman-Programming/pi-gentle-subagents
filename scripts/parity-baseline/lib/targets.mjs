import path from 'node:path';
import { assertRoots, isWithin } from './isolation.mjs';
const ids=['fork','upstream'], toolchain={schemaVersion:1,node:'22.19.0',pnpm:'11.1.1',vitest:'4.1.7',piPackage:'@earendil-works/pi-coding-agent',network:'denied',inputs:'local-only',archiveFormat:'tar',archiveHash:'sha256',extraction:'read-only'};
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===expected.length&&expected.every(key=>Object.hasOwn(value,key));
const hex=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const fail=message=>{throw new TypeError(message)};
export function parseDescriptors(targets, candidateToolchain) {
 if(!keys(targets,['schemaVersion','targets'])||targets.schemaVersion!==1||!Array.isArray(targets.targets)||targets.targets.length!==2) fail('invalid targets descriptor');
 if(!keys(candidateToolchain,Object.keys(toolchain))||Object.keys(toolchain).some(key=>candidateToolchain[key]!==toolchain[key])) fail('invalid toolchain descriptor');
 const seen=new Set(); for(const target of targets.targets) { if(!keys(target,['id','revision'])||!ids.includes(target.id)||!hex(target.revision)||seen.has(target.id)) fail('invalid target'); seen.add(target.id); }
 if(ids.some(id=>!seen.has(id))||new Set(targets.targets.map(target=>target.revision)).size!==2) fail('missing or duplicate target revision'); return {targets:targets.targets,toolchain:candidateToolchain};
}
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const entryPath=value=>typeof value==='string'&&value!=='.'&&value.split('/').every(segment=>segment&&segment!=='..')&&!path.isAbsolute(value)&&!value.includes('\\');
const link=(filesystem,value)=>{const stat=filesystem.lstat(value); if(stat===undefined) return false; if(!stat||typeof stat!=='object'||Array.isArray(stat)||typeof stat.isSymbolicLink!=='function') fail('invalid lstat result'); const linked=stat.isSymbolicLink(); if(typeof linked!=='boolean') fail('invalid lstat result'); return linked;};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const hashed=(hash,value)=>{const valueDigest=hash(value); if(!digest(valueDigest)) fail('invalid hash result'); return valueDigest;};
export function archivePinnedTarget({target,repositoryRoot,destination,seams}) {
 if(!target||!ids.includes(target.id)||!hex(target.revision)||!seams?.filesystem||!['archive','hash','canonicalize'].every(name=>typeof seams[name]==='function')||!['realpath','nearestExisting','lstat','mkdir','writeFile'].every(name=>typeof seams.filesystem[name]==='function')) fail('invalid archive request');
 const {filesystem,hash,canonicalize}=seams; const physical=assertRoots(repositoryRoot,{destination},{realpath:filesystem.realpath,nearestExisting:filesystem.nearestExisting}).destination;
 const result=seams.archive({targetId:target.id,revision:target.revision});
 if(!keys(result,['revision','entries','manifest','manifestDigest'])||result.revision!==target.revision||!Array.isArray(result.entries)||!Array.isArray(result.manifest)||!digest(result.manifestDigest)||hashed(hash,canonicalize(result.manifest))!==result.manifestDigest) fail('archive revision or manifest mismatch');
 const entries=result.entries, paths=new Set(), normalized=new Set(), files=new Map(); let previous='';
 for(const entry of entries) { const normalizedPath=path.posix.normalize(entry?.path??''); if(!entry||!entryPath(entry.path)||paths.has(entry.path)||normalized.has(normalizedPath)||compare(previous,entry.path)>0||!['file','directory'].includes(entry.type)||!keys(entry,entry.type==='file'?['path','type','content','sha256']:['path','type'])) fail('unsafe archive entry'); previous=entry.path; paths.add(entry.path); normalized.add(normalizedPath); if(entry.type==='file'&&(typeof entry.content!=='string'||!digest(entry.sha256)||hashed(hash,entry.content)!==entry.sha256)) fail('invalid archive content'); if(entry.type==='file') files.set(entry.path,entry.sha256); }
 for(const value of paths) for(const other of paths) if(value!==other&&files.has(value)&&other.startsWith(`${value}/`)) fail('file descendant conflict');
 const expected=new Map(); previous=''; for(const item of result.manifest) { if(!keys(item,['path','sha256'])||!entryPath(item.path)||!digest(item.sha256)||expected.has(item.path)||compare(previous,item.path)>0) fail('invalid manifest'); previous=item.path; expected.set(item.path,item.sha256); }
 if(expected.size!==files.size||[...files].some(([name,digest])=>expected.get(name)!==digest)) fail('manifest entries mismatch');
 for(const name of paths) { let current=physical; for(const segment of name.split('/')) { current=path.join(current,segment); if(link(filesystem,current)) fail('destination symlink'); } }
 for(const entry of entries) { const output=path.join(physical,entry.path); if(entry.type==='directory') filesystem.mkdir(output,{recursive:true}); else { filesystem.mkdir(path.dirname(output),{recursive:true}); filesystem.writeFile(output,entry.content); } }
 return physical;
}
const names=['source','archive','execution','output','fixture'];
const settle=(primary,cleanup)=>{ if(primary&&cleanup.length) throw new AggregateError([primary,...cleanup],'target failed and cleanup failed'); if(primary) throw primary; if(cleanup.length) throw new AggregateError(cleanup,'cleanup failed'); };
export function runPinnedTarget({repositoryRoot,outputRoot,target,seams,callback}) {
 const roots={},allocated=[]; let primary;
 try { for(const name of names) { roots[name]=seams.allocate(name); allocated.push(name); } const fs=seams.filesystem,resolved=assertRoots(repositoryRoot,roots,{realpath:fs.realpath,nearestExisting:fs.nearestExisting}),output=fs.realpath(fs.nearestExisting(path.resolve(outputRoot))); if(!isWithin(output,resolved.output)) fail('output root required'); archivePinnedTarget({target,repositoryRoot,destination:roots.source,seams}); return callback(resolved); }
 catch(error) { primary=error; } finally { const cleanup=[]; for(const name of allocated.reverse()) try { seams.cleanup(roots[name]); } catch(error) { cleanup.push(error); } settle(primary,cleanup); }
}
export function runPinnedTargets({repositoryRoot,targets,seams,callback}) {
 if(!Array.isArray(targets)||targets.length!==2||new Set(targets.map(target=>target?.id)).size!==2||new Set(targets.map(target=>target?.revision)).size!==2||typeof seams?.allocate!=='function'||typeof seams?.cleanup!=='function'||typeof callback!=='function') fail('invalid target session');
 const all={},allocated=[],result={}; let primary;
 try { for(const target of targets) { const roots={}; for(const name of names) { roots[name]=seams.allocate(target.id,name); allocated.push(roots[name]); all[`${target.id}:${name}`]=roots[name]; } result[target.id]=roots; } const fs=seams.filesystem, resolved=assertRoots(repositoryRoot,all,{realpath:fs.realpath,nearestExisting:fs.nearestExisting}); for(const target of targets) { const roots=Object.fromEntries(names.map(name=>[name,resolved[`${target.id}:${name}`]])); archivePinnedTarget({target,repositoryRoot,destination:roots.source,seams}); result[target.id]=roots; } return callback(result); }
 catch(error) { primary=error; } finally { const cleanup=[]; for(const root of allocated.reverse()) try { seams.cleanup(root); } catch(error) { cleanup.push(error); } settle(primary,cleanup); }
}
