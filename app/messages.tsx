'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Conversation = { id: string; buyer_id: string; seller_id: string; listing: { title: string } | null };
type Message = { id: string; sender_id: string; body: string; created_at: string };
async function read<T>(response: Response): Promise<T> {
  const body = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || 'Unable to load messages.');
  return body;
}
export default function Messages({ initialConversation }: { initialConversation?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState(initialConversation || '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const inbox = await read<{ conversations: Conversation[]; userId: string }>(await fetch('/api/messages', { cache: 'no-store' }));
      setConversations(inbox.conversations); setUserId(inbox.userId);
      if (selected) {
        const thread = await read<{ messages: Message[] }>(await fetch('/api/messages?conversation=' + encodeURIComponent(selected), { cache: 'no-store' }));
        setMessages(thread.messages);
      }
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load messages.'); }
  }, [selected]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10000); return () => clearInterval(timer); }, [load]);
  async function send(event: FormEvent) {
    event.preventDefault(); if (!text.trim() || !selected) return; setBusy(true); setError('');
    try {
      await read(await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send', conversationId: selected, message: text }) }));
      setText(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send message.'); }
    finally { setBusy(false); }
  }
  return <div className="market-messages"><h2>Messages</h2><p>Private conversations about marketplace listings.</p>
    {error && <p role="alert" className="message-error">{error}</p>}
    <div className="message-layout"><div className="message-threads" aria-label="Conversations">
      {conversations.map(item => <button type="button" key={item.id} className={selected === item.id ? 'message-thread active' : 'message-thread'} onClick={() => { setSelected(item.id); setMessages([]); }}>{item.listing?.title || 'Marketplace listing'}<small>{item.seller_id === userId ? 'Buyer conversation' : 'Seller conversation'}</small></button>)}
      {!conversations.length && <p>No conversations yet. Open a listing and choose Message seller.</p>}
    </div><div className="message-conversation">
      {selected ? <><div className="message-list" aria-live="polite">{messages.map(message => <div key={message.id} className={message.sender_id === userId ? 'message-bubble mine' : 'message-bubble'}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString()}</small></div>)}{!messages.length && <p>Start the conversation.</p>}</div>
        <form onSubmit={send} className="message-compose"><input value={text} onChange={event => setText(event.target.value)} maxLength={1000} aria-label="Message" placeholder="Write a message…" required/><button className="primary" disabled={busy}>Send</button></form></> : <p>Choose a conversation to read and reply.</p>}
    </div></div>
  </div>;
}
