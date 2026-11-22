import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let writes=0;
globalThis.window={localStorage:{getItem:()=>null,setItem:()=>{writes++;}},dispatchEvent(){}};
globalThis.CustomEvent ??= class {};
let failure=Object.assign(new Error('Review service unavailable'),{code:'PGRST202'});
globalThis.reviewBackend={rpc:async()=>({error:failure}),from:()=>({select:()=>({eq:()=>({order:async()=>({error:failure})})})})};
const original=await readFile(new URL('../src/services/coachReviews.js',import.meta.url),'utf8');
const source=original.replace('import { supabase } from "../lib/supabase";','const supabase=globalThis.reviewBackend;').replace(/import \{[\s\S]*?\} from "\.\.\/\.\.\/data\/founderPreview";/,'const FOUNDER_PREVIEW_COACH_ID="mock",FOUNDER_PREVIEW_REVIEWS=[],FOUNDER_PREVIEW_REPLIES=[];');
const reviews=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('real review and reply writes never report success when the backend is missing or denies access',async()=>{
 for(const code of ['PGRST202','42501']){
  failure=Object.assign(new Error('Review service unavailable'),{code});
  await assert.rejects(reviews.saveCoachReview({coachId:'real',rating:5,user:{id:'client'},body:'Test'}),/unavailable/);
  await assert.rejects(reviews.saveCoachReviewResponse({reviewId:'real-review',coachId:'real',response:'Thank you'}),/unavailable/);
  await assert.rejects(reviews.saveCoachReviewReply({reviewId:'real-review',user:{id:'client'},body:'Test'}),/unavailable/);
  await assert.rejects(reviews.deleteCoachReview({coachId:'real',userId:'client'}),/unavailable/);
 }
 assert.equal(writes,0);
});
test('real review loads surface backend failure instead of showing stale local reviews',async()=>{
 await assert.rejects(reviews.loadCoachReviews('real'),/unavailable/);
 await assert.rejects(reviews.loadCoachReviewReplies('real-review'),/unavailable/);
});
