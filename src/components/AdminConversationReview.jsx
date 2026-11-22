import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import "./AdminConversationReview.css";
const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : "Not available";
export default function AdminConversationReview({ conversations }) {
 const [selected,setSelected]=useState(null), [query,setQuery]=useState(""), [status,setStatus]=useState("all");
 const [reason,setReason]=useState(""), [record,setRecord]=useState(null), [history,setHistory]=useState([]);
 const [error,setError]=useState(""), [busy,setBusy]=useState(false);
 const generation=useRef(0);
 const visible=conversations.filter(item=>(status==="all"||item.relationshipStatus===status)&&
  ((item.client?.fullName||"")+" "+(item.coachName||"")).toLowerCase().includes(query.trim().toLowerCase()));
 function select(item) { generation.current++; setSelected(item); setRecord(null); setHistory([]); setReason(""); setError(""); setBusy(false); }
 async function openReview(event) {
  event.preventDefault(); const current=++generation.current; setBusy(true); setError(""); setRecord(null);
  try {
   const {data,error:failure}=await supabase.rpc("review_marketplace_conversation",{p_kind:"conversation",p_id:selected.id,p_reason:reason.trim()});
   if(failure) throw failure;
   if(current!==generation.current)return;
   setRecord(data);
   const result=await supabase.from("admin_conversation_reviews").select("id,reason,reviewed_at,admin_user_id").eq("record_kind","conversation").eq("record_id",selected.id).order("reviewed_at",{ascending:false}).limit(20);
   if(current!==generation.current)return;
   if(result.error)setError("Conversation opened, but review history could not be loaded."); else setHistory(result.data||[]);
  }catch(failure){if(current===generation.current)setError(failure.message||"Unable to open conversation.");}
  finally{if(current===generation.current)setBusy(false);}
 }
 return <section className="admin-review" aria-label="Conversation oversight">
  <aside className="admin-review__list"><h3>Conversations</h3>
   <input aria-label="Search clients and coaches" placeholder="Search client or coach" value={query} onChange={e=>setQuery(e.target.value)}/>
   <select aria-label="Relationship status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="accepted">Active clients</option><option value="declined">Declined</option></select>
   <small>{visible.length} shown · latest {conversations.length} loaded</small>
   <div className="admin-review__items ui-scroll-area">{visible.map(item=><button key={item.id} type="button" aria-pressed={selected?.id===item.id} onClick={()=>select(item)}><strong>{item.client?.fullName||"Client"}</strong><span>{item.coachName||"Coach"}</span><small>{item.relationshipStatus} · {date(item.updatedAt)}</small></button>)}{!visible.length&&<p>No conversations match.</p>}</div>
  </aside>
  <div className="admin-review__main">
   {!selected?<div className="admin-review__empty"><h3>Select a conversation</h3><p>Review coaching progress and support requests here. Access is read-only.</p></div>:<>
    <header><div><h3>{selected.client?.fullName||"Client"}</h3><p>with {selected.coachName||"Coach"} · {selected.relationshipStatus}</p></div><span>Read only</span></header>
    {!record&&<form onSubmit={openReview} className="admin-review__reason"><label htmlFor="review-reason">Reason for review</label><p>Opening this conversation records your administrator ID, reason, and time.</p><textarea id="review-reason" required minLength={5} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="For example: following up on a client support request"/><button disabled={busy||reason.trim().length<5}>{busy?"Opening…":"Open conversation"}</button></form>}
    {error&&<p role="alert">{error}</p>}
    {record&&<div className="admin-review__messages ui-scroll-area" tabIndex={0} aria-label="Messages">{(record.messages||[]).map((message,index)=><article key={message.id||index} className={message.sender==="coach"?"is-coach":""}><strong>{message.sender==="coach"?selected.coachName||"Coach":selected.client?.fullName||"Client"}</strong><p>{message.text}</p><time>{date(message.createdAt)}</time>{message.attachments?.length>0&&<small>{message.attachments.length} attachment(s); media review is not available yet.</small>}</article>)}{!record.messages?.length&&<p>No messages yet.</p>}</div>}
   </>}
  </div>
  {selected&&<aside className="admin-review__details ui-scroll-area"><details open><summary>Relationship details</summary><dl><dt>Client</dt><dd>{selected.client?.fullName||"Client"}</dd><dt>Coach</dt><dd>{selected.coachName||"Coach"}</dd><dt>Status</dt><dd>{selected.relationshipStatus}</dd><dt>Last activity</dt><dd>{date(selected.updatedAt)}</dd></dl></details><details><summary>Recent review history</summary>{history.map(item=><div key={item.id}><p>{item.reason}</p><small>{date(item.reviewed_at)}<br/>Admin: {item.admin_user_id}</small></div>)}{!history.length&&<p>Open the conversation to load its review history.</p>}</details></aside>}
 </section>;
}
