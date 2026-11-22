import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { appendDirectMessage, DIRECT_MESSAGES_CHANGED_EVENT, getClientRelationshipStatus, loadDirectMessageThread, markDirectMessageThreadRead, refreshMarketplaceData } from "../services/conversationStore";
import ConversationSafety from "./ConversationSafety";
import { MessageMediaGallery } from "./ChatMedia";
import { ScrollArea } from "./ui";
import "./ClientChat.css";
import { ConversationRail, CoachDetails } from "./ClientChatPanels";

function Icon({ name }) {
 const paths = { back: "M19 12H5m7-7-7 7 7 7", expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5", collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5", send: "m5 12 14-7-5 14-3-6-6-1Zm6 1 8-8" };
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function messageDate(value) {
 const date = new Date(value);
 return Number.isNaN(date.getTime()) ? null : date;
}
export default function ClientChat(props) {
 const { user, profile } = useAuth();
 const [expanded, setExpanded] = useState(false);
 const drafts = useRef({});
 return <Conversation expanded={expanded} setExpanded={setExpanded} drafts={drafts}  key={`${user?.id}:${props.coach.id}`} {...props} user={user} profile={profile} />;
}
function Conversation({ coach, onBack, onViewProfile, onSelectCoach, user, profile, expanded, setExpanded, drafts }) {
 const [thread, setThread] = useState(() => loadDirectMessageThread(coach.id, { userId: user?.id || "" }));
 const draftKey = `${user?.id}:${coach.id}`;
 const [draft, updateDraft] = useState(() => drafts.current[draftKey] || "");
 function setDraft(value) { updateDraft(current => { const next = typeof value === "function" ? value(current) : value; drafts.current[draftKey] = next; return next; }); }
 const [error, setError] = useState("");
 const [sending, setSending] = useState(false);
 const [blocked, setBlocked] = useState(false);
 const [showThreads, setShowThreads] = useState(false);
 const [hasNewMessages, setHasNewMessages] = useState(false);
 const panelRef = useRef(null), inputRef = useRef(null), listRef = useRef(null), expandRef = useRef(null);
 const sendingRef = useRef(false), nearBottom = useRef(true), previousLast = useRef(null), scrollPosition = useRef(null);
 const motionRef = useRef(null);
 const mountedRef = useRef(true);
 useEffect(() => {
  mountedRef.current = true;
  return () => { mountedRef.current = false; motionRef.current?.cancel(); };
 }, []);
 async function transitionTo(action, target = panelRef.current) {
  if (motionRef.current) return;
  if (!target?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { action(); return; }
  const animation = target.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-out", fill: "forwards" });
  motionRef.current = animation;
  try { await animation.finished; if (mountedRef.current) action(); }
  catch { /* Unmounting cancels the pending navigation. */ }
  finally { animation.cancel(); if (motionRef.current === animation) motionRef.current = null; }
 }
 function closeThreads() { void transitionTo(() => setShowThreads(false), panelRef.current?.querySelector(".client-chat-rail")); }
 const messages = thread?.messages || [];
 const status = thread ? getClientRelationshipStatus(thread) : "not_started";
 const disabled = blocked || coach.isMock || status === "declined";
 useEffect(() => {
  let active = true;
  const refresh = () => {
   if (!active) return;
   const next = loadDirectMessageThread(coach.id, { userId: user?.id || "" });
   setThread(next);
   if (next?.unreadForClient) void markDirectMessageThreadRead(next.id, "client");
  };
  window.addEventListener(DIRECT_MESSAGES_CHANGED_EVENT, refresh);
  window.addEventListener("storage", refresh);
  refresh();
  void refreshMarketplaceData().then(result => { refresh(); if (active && result === false) setError("Could not refresh this conversation. Please try again."); }).catch(() => { if (active) setError("Could not refresh this conversation. Please try again."); });
  return () => { active = false; window.removeEventListener(DIRECT_MESSAGES_CHANGED_EVENT, refresh); window.removeEventListener("storage", refresh); };
 }, [coach.id, user?.id]);
 function scrollToLatest() {
  const list = listRef.current;
  if (list) list.scrollTop = list.scrollHeight;
  nearBottom.current = true; setHasNewMessages(false);
 }
 const lastId = messages.at(-1)?.id;
 useEffect(() => {
  const observer = new ResizeObserver(() => {
   if (nearBottom.current) scrollToLatest();
  });
  observer.observe(listRef.current);
  observer.observe(listRef.current.firstElementChild);
  return () => observer.disconnect();
 }, [expanded]);
 useLayoutEffect(() => {
  if (scrollPosition.current !== null) { listRef.current.scrollTop = scrollPosition.current; scrollPosition.current = null; }
  else if (nearBottom.current || previousLast.current === null) scrollToLatest();
  else if (lastId !== previousLast.current) setHasNewMessages(true);
  previousLast.current = lastId || null;
 }, [lastId, expanded]);
 useLayoutEffect(() => {
  const input = inputRef.current;
  if (!input) return;
  input.style.height = "0px";
  input.style.height = `${Math.min(120, Math.max(40, input.scrollHeight))}px`;
  input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden";
 }, [draft, expanded]);
 function toggleExpanded() {
  scrollPosition.current = nearBottom.current ? null : (listRef.current?.scrollTop ?? 0);
  void transitionTo(() => setExpanded(value => !value));
 }
 useEffect(() => {
  if (!expanded) return;
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  expandRef.current?.focus();
  const handleKey = event => {
   if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (showThreads) closeThreads(); else toggleExpanded(); }
   if (event.key !== "Tab") return;
   const items = [...panelRef.current.querySelectorAll('button:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(item => item.getClientRects().length);
   const first = items[0], last = items.at(-1);
   if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  document.addEventListener("keydown", handleKey, true);
  return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", handleKey, true); expandRef.current?.focus(); };
 }, [expanded, showThreads]);
 useEffect(() => { if (showThreads) panelRef.current?.querySelector('[aria-label="Search conversations"]')?.focus(); }, [showThreads]);
 async function send(event) {
  event?.preventDefault();
  if (disabled || sendingRef.current || !draft.trim()) return;
  sendingRef.current = true; setSending(true); setError("");
  const submitted = draft;
  try {
   const saved = await appendDirectMessage(coach, { id: crypto.randomUUID(), sender: "client", text: submitted.trim(), attachments: [], createdAt: new Date().toISOString() }, {
    id: user?.id || "", fullName: profile?.full_name || profile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Weightlisted client",
    avatarUrl: profile?.avatar_url || "", city: profile?.city || "", gymName: profile?.gym_name || "", trainingFocus: profile?.training_focus || [], trainingNote: profile?.training_note || "", profileVisible: profile?.profile_visible ?? true,
   });
   nearBottom.current = true; setThread(saved); setDraft(current => current === submitted ? "" : current);
  } catch (failure) { setError(`Message not sent. ${failure.message || "Please try again."} Your draft is saved here.`); }
  finally { sendingRef.current = false; setSending(false); }
 }
 const panel = <section ref={panelRef} className={`client-chat${expanded ? " client-chat-expanded" : ""}`} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={`Messages with ${coach.name}`}>
  {expanded && <ConversationRail coach={coach} userId={user?.id} onSelect={next => { if (next.id !== coach.id) void transitionTo(() => onSelectCoach?.(next), panelRef.current?.querySelector(".client-chat-conversation")); }} open={showThreads} onClose={closeThreads} />}
  <div className="client-chat-conversation" inert={expanded && showThreads ? "" : undefined}>
  <header className="client-chat-header">
   {expanded && <button type="button" className="client-chat-icon client-chat-list-toggle" aria-label="Show conversations" onClick={() => setShowThreads(true)}>☰</button>}
   <button type="button" className="client-chat-icon" aria-label="Back to conversations" onClick={() => transitionTo(onBack)}><Icon name="back" /></button>
   <button type="button" className="client-chat-identity" onClick={() => transitionTo(onViewProfile)} aria-label={`View ${coach.name}'s profile`}>
    <img src={coach.headshot} alt="" /><span><strong>{coach.name}</strong><small>{blocked ? "Messaging blocked" : status === "accepted" ? "Your coach" : status === "pending" ? "Request pending" : status === "declined" ? "Request closed" : "Coaching conversation"}</small></span>
   </button>
   <button type="button" ref={expandRef} className={`client-chat-icon${expanded ? " client-chat-exit" : ""}`} onClick={toggleExpanded} aria-expanded={expanded} aria-label={expanded ? "Exit full screen" : "Full screen messages"} title={expanded ? "Exit full screen (Escape)" : "Full screen messages"}><Icon name={expanded ? "collapse" : "expand"} />{expanded && <span>Exit full screen</span>}</button>
  </header>
  {!coach.isMock && <ConversationSafety coachId={coach.id} userId={user?.id} onBlockedChange={setBlocked} refreshKey={messages.length} />}
  {coach.isMock && <p className="client-chat-notice">Mock coach · messaging unavailable</p>}
  <div className="client-chat-history">
   <ScrollArea ref={listRef} className="client-chat-scroll" aria-label="Message history" tabIndex={0} onScroll={() => {
    const list = listRef.current; nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64;
    if (nearBottom.current) setHasNewMessages(false);
   }}><div className="client-chat-messages">
    {!messages.length && <div className="client-chat-empty"><strong>Start a conversation</strong><p>Share your goals and what you’re looking for in a coach. Your first message sends a coaching request.</p></div>}
    {messages.map((message, index) => {
     const date = messageDate(message.createdAt), previous = messages[index - 1], previousDate = messageDate(previous?.createdAt);
     const newDay = date && date.toDateString() !== previousDate?.toDateString();
     const grouped = !newDay && previous?.sender === message.sender;
     return <Fragment key={message.id}>
      {newDay && <div className="client-chat-day"><span>{date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span></div>}
      <div className={`client-chat-message ${message.sender === "coach" ? "is-received" : "is-sent"}${grouped ? " is-grouped" : ""}`}>
       <MessageMediaGallery attachments={message.attachments?.filter(item => item.url)} />
       {message.attachments?.some(item => !item.url) && <p className="client-chat-media-note">Attachment unavailable</p>}
       {message.text && <p>{message.text}</p>}
       {date && <time dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>}
      </div>
     </Fragment>;
    })}
   </div></ScrollArea>
   {hasNewMessages && <button type="button" className="client-chat-latest" onClick={scrollToLatest}>New messages ↓</button>}
  </div>
  {error && <p role="alert" className="client-chat-error">{error}</p>}
  <form className="client-chat-composer" onSubmit={send}>
   <div className="client-chat-compose-row">
    <textarea ref={inputRef} className="ui-scroll-area client-chat-input" rows={1} value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} disabled={disabled} placeholder={disabled ? "Messaging unavailable" : "Write a message…"} aria-label={`Message to ${coach.name}`} onKeyDown={event => {
     if (event.key === "Enter" && event.ctrlKey && !event.repeat && !event.nativeEvent.isComposing) void send(event);
    }} />
    <button className="client-chat-send" type="submit" disabled={disabled || sending || !draft.trim()} aria-label={sending ? "Sending message" : "Send message"}><Icon name="send" /></button>
   </div>
   <span className="client-chat-shortcut" role="status">{sending ? "Sending…" : "Ctrl + Enter to send"}</span>
  </form>
  </div>
  {expanded && <CoachDetails coach={coach} status={status} onViewProfile={() => transitionTo(onViewProfile)} />}
 </section>;
 return expanded ? createPortal(panel, document.body) : panel;
}
