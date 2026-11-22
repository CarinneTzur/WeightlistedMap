import test from 'node:test';
import assert from 'node:assert/strict';
import {removeUserFolder} from '../supabase/functions/delete-my-account/storage-cleanup.mjs';
test('account deletion removes every page and nested folder without touching another account',async()=>{
 const files=new Set(Array.from({length:205},(_,i)=>`clients/owner/${i}.jpg`));
 files.add('clients/owner/nested/image.jpg');files.add('clients/other/private.jpg');
 const client={storage:{from:()=>({list:async prefix=>({data:[...new Set([...files].filter(path=>path.startsWith(prefix+'/')).map(path=>path.slice(prefix.length+1).split('/')[0]))].slice(0,100).map(name=>({name,id:files.has(prefix+'/'+name)?name:null}))}),remove:async paths=>{paths.forEach(path=>files.delete(path));return {};}})}};
 await removeUserFolder(client,'photos','clients/owner');
 assert.deepEqual([...files],['clients/other/private.jpg']);
});
test('account deletion stops on a storage failure so it does not claim completed cleanup',async()=>{
 const client={storage:{from:()=>({list:async()=>({error:new Error('Storage unavailable')})})}};
 await assert.rejects(removeUserFolder(client,'photos','clients/owner'),/Storage unavailable/);
});
