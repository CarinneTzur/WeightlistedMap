import { useEffect, useState } from "react";
import { loadDirectMessageThreads, DIRECT_MESSAGES_CHANGED_EVENT, getClientRelationshipStatus } from "../services/conversationStore";
import { getAllCoaches } from "../../utils/coachData";
import { ScrollArea } from "./ui";

export function ConversationRail({ coach, userId, onSelect, open, onClose }) {
 const [query, setQuery] = useState("");
 const [threads, setThreads] = useState(() => loadDirectMessageThreads({ view: "user", userId }));
 useEffect(() => {
  const refresh = () => setThreads(loadDirectMessageThreads({ view: "user", userId }));
  window.addEventListener(DIRECT_MESSAGES_CHANGED_EVENT, refresh);
  window.addEventListener("storage", refresh);
  return () => { window.removeEventListener(DIRECT_MESSAGES_CHANGED_EVENT, refresh); window.removeEventListener("storage", refresh); };
 }, [userId]);
 const coaches = getAllCoaches();
 const rows = threads.map(thread => ({ thread, person: coaches.find(item => item.id === thread.coachId) || (coach.id === thread.coachId ? coach : null) }));
 if (!rows.some(row => row.thread.coachId === coach.id)) rows.unshift({ thread: { coachId: coach.id, coachName: coach.name, messages: [] }, person: coach });
 const filtered = rows.filter(({ thread, person }) => (person?.name || thread.coachName || "Coach").toLowerCase().includes(query.trim().toLowerCase()));
 return <aside className={`client-chat-rail${open ? " is-open" : ""}`} aria-label="Conversations">
  <div className="client-chat-rail-heading"><div><small>YOUR COACHING</small><h2>Messages</h2></div><button type="button" className="client-chat-icon client-chat-list-close" onClick={onClose} aria-label="Close conversation list">×</button></div>
  <div className="client-chat-search"><input aria-label="Search conversations" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search conversations" /></div>
  <ScrollArea className="client-chat-thread-list">
   {filtered.map(({ thread, person }) => <button type="button" key={thread.coachId} className={`client-chat-thread${thread.coachId === coach.id ? " is-active" : ""}`} aria-current={thread.coachId === coach.id ? "true" : undefined} disabled={!person || !onSelect} onClick={() => { if (person.id === coach.id) onClose(); else onSelect(person); }}>
    <img src={person?.headshot || thread.coachHeadshot} alt="" /><span><strong>{person?.name || thread.coachName || "Coach"}</strong><span>{thread.messages?.at(-1)?.text || "Start a conversation"}</span><small>{!person ? "Profile unavailable" : getClientRelationshipStatus(thread) === "accepted" ? "Active coaching" : "Coaching request"}</small></span>
   </button>)}
   {!filtered.length && <p className="client-chat-rail-empty">No matching conversations.</p>}
  </ScrollArea>
  <p className="client-chat-rail-footer">Your coaches, all in one place.</p>
 </aside>;
}

export function CoachDetails({ coach, status, onViewProfile }) {
 return <aside className="client-chat-details ui-scroll-area" aria-label="Coach details">
  <div className="client-chat-details-heading">ABOUT YOUR COACH</div>
  <img className="client-chat-details-avatar" src={coach.headshot} alt="" />
  <h2>{coach.name}</h2><p className="client-chat-details-title">{coach.title || "Coach"}</p>
  <button type="button" className="ui-button" onClick={onViewProfile}>View profile →</button>
  {coach.bio && <div className="client-chat-details-section"><h3>About</h3><p>{coach.bio}</p></div>}
  {!!coach.specialties?.length && <div className="client-chat-details-section"><h3>Specialties</h3><div className="client-chat-tags">{coach.specialties.map(tag => <span key={tag}>{tag}</span>)}</div></div>}
  {coach.city && <div className="client-chat-details-section"><h3>Location</h3><p>{coach.city}</p></div>}
  <div className="client-chat-details-section"><h3>Your conversation</h3><p>{status === "accepted" ? "Active coaching relationship" : status === "declined" ? "Request closed" : status === "pending" ? "Waiting for the coach to respond" : "Start with an introduction"}</p><p className="client-chat-details-muted">Safety and blocking controls are available under Safety & support in your chat.</p></div>
 </aside>;
}
