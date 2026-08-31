import path from 'node:path';
const within=(a,b)=>a===b||b.startsWith(`${a}${path.sep}`);
const physical=(value,seams)=>{ const resolved=path.resolve(value), existing=seams.nearestExisting(resolved); return path.join(seams.realpath(existing),path.relative(existing,resolved)); };
export function assertRoots(repository, roots, seams) {
 if(!seams?.realpath||!seams?.nearestExisting) throw new TypeError('physical filesystem seams required');
 const repo=physical(repository,seams), values=Object.entries(roots).map(([name,value])=>[name,physical(value,seams)]);
 if(!values.length||new Set(values.map(([,value])=>value)).size!==values.length||values.some(([,value])=>within(repo,value))) throw new TypeError('roots must be unique and external');
 for(const [,a] of values) for(const [,b] of values) if(a!==b&&(within(a,b)||within(b,a))) throw new TypeError('roots must not nest');
 return Object.fromEntries(values);
}
export const isWithin=within;
