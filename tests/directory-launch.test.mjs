import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../utils/coachData.js',import.meta.url),'utf8');
async function directory(staging){
 const source=original.replace('import { isStaging } from "../src/lib/environment";',`const isStaging=${staging};`).replace('import { coaches as staticCoaches } from "../data/coaches";','const staticCoaches=[{id:"mock",approved:true,gymIds:[]}];').replace('import { gyms as staticGyms } from "../data/gyms";','const staticGyms=[];').replace('import { STATE_CENTERS } from "../data/usStates";','const STATE_CENTERS={};').replace(/import \{[\s\S]*?\} from "\.\/coachApplications";/,'const getApprovedApplicationCoaches=()=>[{id:"real",approved:true,gymIds:[]}];const getCreatedApplicationGyms=()=>[];').replace('import.meta.env.VITE_SHOW_DEMO_COACHES','"true"');
 return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).getAllCoaches();
}
test('production never lists mock coaches even with a stale demo setting; staging retains them',async()=>{
 assert.deepEqual((await directory(false)).map(coach=>coach.id),['real']);
 assert.deepEqual((await directory(true)).map(coach=>coach.id),['mock','real']);
});
