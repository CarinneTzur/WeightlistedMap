import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ConversationSafety({ coachId, userId, onBlockedChange, refreshKey }) {
 const [thread, setThread] = useState(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [confirming, setConfirming] = useState(false);
 useEffect(() => {
  let cancelled = false;
  setThread(null); setError(""); setConfirming(false);
  if (!supabase || !userId) return;
  supabase.from("marketplace_conversations").select("id,blocked_by_client")
   .eq("coach_application_id", coachId).eq("client_user_id",userId).maybeSingle()
   .then(({data,error:failure}) => {
    if(cancelled) return;
    if(failure) { setError("Safety controls could not be loaded. Contact support if needed."); return; }
    setThread(data); onBlockedChange(Boolean(data?.blocked_by_client));
   });
  return () => { cancelled=true; };
 },[coachId,userId,refreshKey,onBlockedChange]);
 async function toggle() {
  setBusy(true); setError("");
  try {
   const {data,error:failure}=await supabase.rpc("set_coach_conversation_block",{p_conversation_id:thread.id,p_blocked:!thread.blocked_by_client});
   if(failure) throw failure;
   setThread({...thread,blocked_by_client:data}); onBlockedChange(data); setConfirming(false);
  } catch(failure) {setError(failure.message || "Unable to update block.");}
  finally {setBusy(false);}
 }
 return <details style={{padding:"10px 0",fontSize:13}}><summary>Safety & support</summary>
  <p>Authorized administrators can review conversations for support and safety.</p>
  {thread && <>
   {thread.blocked_by_client && <p role="status">Coach blocked. Neither of you can send new messages here. Existing messages stay available.</p>}
   {confirming ? <div><p>Block this coach? This stops new messages in both directions without deleting this conversation.</p><button type="button" disabled={busy} onClick={toggle}>Confirm block</button> <button type="button" disabled={busy} onClick={()=>setConfirming(false)}>Cancel</button></div> : <button type="button" disabled={busy} onClick={()=>thread.blocked_by_client?toggle():setConfirming(true)}>{busy?"Saving…":thread.blocked_by_client?"Unblock coach":"Block coach"}</button>}
  </>}
  {error && <p role="alert">{error}</p>}
  <p><a href="mailto:getweightlisted@gmail.com?subject=Weightlisted%20conversation%20support">Report a concern to getweightlisted@gmail.com</a></p>
 </details>;
}
