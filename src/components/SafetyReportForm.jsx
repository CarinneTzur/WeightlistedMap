import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "./ui";
export default function SafetyReportForm({ conversationId }) {
 const [open,setOpen]=useState(false),[category,setCategory]=useState('spam'),[details,setDetails]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[submitted,setSubmitted]=useState(false);
 async function submit(event){event.preventDefault();if(busy)return;setBusy(true);setError('');try{const result=await supabase.rpc('submit_safety_report',{p_conversation_id:conversationId,p_category:category,p_details:details.trim()});if(result.error)throw result.error;setSubmitted(true);setDetails('');setOpen(false);}catch(failure){setError('Report not submitted. '+failure.message);}finally{setBusy(false);}}
 return <div className="safety-report">
 {submitted&&<p role="status">Report submitted. Our support team will review it. For urgent follow-up, email getweightlisted@gmail.com.</p>}
 {!open?<Button onClick={()=>{setOpen(true);setSubmitted(false);}}>Report a concern</Button>:<form onSubmit={submit}>
 <label>Reason<select value={category} onChange={event=>setCategory(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="inappropriate">Inappropriate content</option><option value="other">Other concern</option></select></label>
 <label>What happened?<textarea required minLength={10} maxLength={3000} value={details} onChange={event=>setDetails(event.target.value)} placeholder="Describe what you’d like us to review."/></label>
 <p>Your report is shared with authorized administrators. Reporting does not block this coach.</p>
 <Button type="submit" disabled={busy||details.trim().length<10}>{busy?'Submitting…':'Submit report'}</Button> <Button disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button>
 </form>}{error&&<p role="alert">{error}</p>}</div>;
}
