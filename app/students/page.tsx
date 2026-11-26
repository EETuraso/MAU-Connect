/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, CheckCheck, EyeOff, Image as ImageIcon, MessageCircle, MessageSquarePlus, Mic, MoreVertical, Paperclip, Phone, Search, Send, Smile, Square, Trash2, Users, Video, X } from 'lucide-react';
import PasswordInput from '../password-input';
import styles from './students.module.css';

type Profile = { id: string; name?: string; username?: string | null; avatar_url?: string | null };
type Chat = { id: string; kind: 'group' | 'direct'; name: string; display_name: string; avatar_url?: string | null; members_count: number; last_body?: string | null; last_at?: string | null; unread: number };
type Message = { id: string; chat_id: string; user_id: string; body: string; created_at: string; viewed?: boolean; user: Profile; pending?: boolean; media?: 'voice' | 'image' | 'view-once' };
type Bootstrap = { user: Profile | null; chats: Chat[]; contacts: Profile[] };
type ChatFilter = 'all' | 'unread' | 'groups';

const emojis = ['😀', '😂', '😊', '😍', '🥰', '😎', '🤔', '😅', '😭', '😢', '😮', '🙌', '👏', '👍', '👋', '🙏', '💪', '❤️', '🔥', '🎉', '✅', '📚', '💯', '✨'];
const wallpapers = [
  { id: 'classic', name: 'Classic', color: '#efeae2' },
  { id: 'sage', name: 'Sage', color: '#dceadf' },
  { id: 'sky', name: 'Sky', color: '#dcebf1' },
  { id: 'sand', name: 'Sand', color: '#f3e4ce' },
  { id: 'lavender', name: 'Lavender', color: '#ebe2f1' },
  { id: 'slate', name: 'Slate', color: '#cbd8d6' },
];

async function read<T>(response: Response): Promise<T> {
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Unable to complete request.');
  return result as T;
}

const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
type LabelProfile = Pick<Profile, 'name' | 'username'>;
const label = (profile?: LabelProfile | null) => profile?.username?.trim() || profile?.name?.trim() || 'Student';
const initials = (profile?: LabelProfile | null) => label(profile).slice(0, 1).toUpperCase();
const preview = (body?: string | null) => {
  if (!body) return 'No messages yet';
  if (body === '[view-once]') return '📷 View-once photo';
  if (body.startsWith('[image]')) return '📷 Photo';
  if (body.startsWith('[voice]')) return '🎙️ Voice note';
  return body;
};

export default function Students() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [selectedChatId, setSelectedChatId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState('classic');
  const [wallpaperError, setWallpaperError] = useState('');
  const [members, setMembers] = useState<Profile[] | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [openedPhoto, setOpenedPhoto] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [typing, setTyping] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageAbort = useRef<AbortController | null>(null);
  const selectedChatRef = useRef('');
  const input = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { selectedChatRef.current = selectedChatId; }, [selectedChatId]);
  const selectedChat = data?.chats.find(chat => chat.id === selectedChatId) || data?.chats[0];
  const filteredChats = (data?.chats || []).filter(chat => chat.display_name.toLowerCase().includes(search.trim().toLowerCase()) && (chatFilter === 'all' || (chatFilter === 'unread' ? chat.unread > 0 : chat.kind === 'group')));
  const visibleMessages = [...messages, ...pendingMessages].filter(message => message.chat_id === selectedChat?.id && (!chatSearch.trim() || `${message.body} ${label(message.user)}`.toLowerCase().includes(chatSearch.trim().toLowerCase())));
  const chatBackground = wallpaper.startsWith('data:image/')
    ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: wallpapers.find(option => option.id === wallpaper)?.color || wallpapers[0].color };

  async function refresh() {
    const result = await read<Bootstrap>(await fetch('/api/students/chat', { cache: 'no-store' }));
    setData(result);
    const first = result.chats[0]?.id || '';
    setSelectedChatId(previous => previous && result.chats.some(chat => chat.id === previous) ? previous : first);
    if (result.user) {
      try { setWallpaper(localStorage.getItem(`student-chat-wallpaper:${result.user.id}:${selectedChatId || first}`) || 'classic'); }
      catch { setWallpaper('classic'); }
    }
  }

  async function open() {
    setLoading(true); setNotice('');
    try { await refresh(); } catch (error) { setNotice((error as Error).message); }
    finally { setLoading(false); }
  }

  async function loadMessages(chatId: string, quiet = false) {
    if (!chatId) return;
    if (messageAbort.current) { messageAbort.current.abort(); setLoadingMessages(false); }
    const controller = new AbortController();
    messageAbort.current = controller;
    if (!quiet) setLoadingMessages(true);
    try {
      const result = await read<{ messages: Message[] }>(await fetch(`/api/students/chat?messages=${encodeURIComponent(chatId)}`, { cache: 'no-store', signal: controller.signal }));
      if (controller.signal.aborted || selectedChatRef.current !== chatId) return;
      setMessages(result.messages || []);
      setData(previous => previous ? { ...previous, chats: previous.chats.map(chat => chat.id === chatId ? { ...chat, unread: 0 } : chat) } : previous);
      void post('/api/students/chat', { action: 'read', chat_id: chatId }).catch(() => {});
    } catch (error) {
      if (!controller.signal.aborted && !quiet) setNotice((error as Error).message);
    } finally {
      if (messageAbort.current === controller) messageAbort.current = null;
      if (!quiet && !controller.signal.aborted) setLoadingMessages(false);
    }
  }

  useEffect(() => { void open(); }, []);
  useEffect(() => { if (selectedChatId && data?.user) void loadMessages(selectedChatId); }, [selectedChatId, data?.user?.id]);
  useEffect(() => {
    if (!data?.user || !selectedChatId) return;
    let active = true;
    const timer = window.setInterval(() => { if (!document.hidden && active) void loadMessages(selectedChatId, true); }, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [data?.user?.id, selectedChatId]);
  useEffect(() => {
    if (!data?.user) return;
    let active = true;
    const timer = window.setInterval(() => { if (!document.hidden && active) void refresh().catch(() => {}); }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [data?.user?.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, pendingMessages.length, selectedChatId]);
  useEffect(() => () => { messageAbort.current?.abort(); if (recordingTimer.current) clearTimeout(recordingTimer.current); if (typingTimer.current) clearTimeout(typingTimer.current); stream.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => () => { if (openedPhoto) URL.revokeObjectURL(openedPhoto); }, [openedPhoto]);
  useEffect(() => {
    if (!voice) { setVoiceUrl(''); return; }
    const url = URL.createObjectURL(voice); setVoiceUrl(url); return () => URL.revokeObjectURL(url);
  }, [voice]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const result = await read<{ message: string }>(await post('/api/market', { action: authMode, email: form.get('email'), password: form.get('password'), name: form.get('username') }));
      await refresh(); setNotice(result.message);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  function addPendingMessage(bodyValue: string, media?: Message['media']) {
    if (!data?.user || !selectedChat) return null;
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pending: Message = { id, chat_id: selectedChat.id, user_id: data.user.id, body: bodyValue, created_at: new Date().toISOString(), user: data.user, pending: true, media };
    setPendingMessages(previous => [...previous, pending]);
    return pending;
  }

  function finishPending(id: string) {
    setPendingMessages(previous => previous.filter(message => message.id !== id));
  }

  function updateChatPreview(chatId: string, bodyValue: string) {
    const now = new Date().toISOString();
    setData(previous => previous ? { ...previous, chats: previous.chats.map(chat => chat.id === chatId ? { ...chat, last_body: bodyValue, last_at: now, unread: 0 } : chat) } : previous);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || !selectedChat || sending) return;
    const chatId = selectedChat.id;
    const pending = addPendingMessage(text);
    setBody(''); setTyping(false); setSending(true); setNotice('');
    try {
      await read<{ ok: true; id?: string }>(await post('/api/students/chat', { action: 'send', chat_id: chatId, body: text }));
      if (pending) finishPending(pending.id);
      updateChatPreview(chatId, text);
      void loadMessages(chatId, true);
    } catch (error) {
      if (pending) finishPending(pending.id);
      setBody(text); setNotice((error as Error).message);
    } finally { setSending(false); }
  }

  function onBodyChange(value: string) {
    setBody(value); setTyping(Boolean(value.trim()));
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 1800);
  }

  async function startDirect(contact: Profile) {
    setBusy(true); setNotice('');
    try { const result = await read<{ chat_id: string }>(await post('/api/students/chat', { action: 'direct', user_id: contact.id })); await refresh(); setSelectedChatId(result.chat_id); setNewChatOpen(false); setMobileChatOpen(true); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setNotice('Voice recording is not supported in this browser.'); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = media;
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) { media.getTracks().forEach(track => track.stop()); setNotice('Voice recording is not supported in this browser.'); return; }
      const instance = new MediaRecorder(media, { mimeType }); const chunks: Blob[] = [];
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => { media.getTracks().forEach(track => track.stop()); stream.current = null; setRecording(false); if (chunks.length) setVoice(new Blob(chunks, { type: mimeType })); };
      instance.onerror = () => { media.getTracks().forEach(track => track.stop()); setRecording(false); setNotice('Recording failed. Please try again.'); };
      recorder.current = instance; instance.start(); setRecording(true); setNotice('');
      recordingTimer.current = setTimeout(() => { if (instance.state === 'recording') instance.stop(); }, 120000);
    } catch { setNotice('Microphone access is needed to record a voice note. Check your browser permissions.'); }
  }

  function stopRecording() { if (recordingTimer.current) clearTimeout(recordingTimer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); }

  async function sendVoice() {
    if (!voice || !selectedChat) return;
    if (sending) return;
    const chatId = selectedChat.id;
    const recordingBlob = voice;
    const pending = addPendingMessage('[voice]pending', 'voice');
    setVoice(null); setSending(true); setNotice('');
    try {
      const form = new FormData(); form.append('file', recordingBlob, 'voice-note'); form.append('chat_id', chatId);
      await read<{ ok: true; id?: string }>(await fetch('/api/students/voice', { method: 'POST', body: form }));
      if (pending) finishPending(pending.id);
      updateChatPreview(chatId, '[voice]');
      void loadMessages(chatId, true);
    } catch (error) {
      if (pending) finishPending(pending.id);
      setVoice(recordingBlob); setNotice((error as Error).message);
    } finally { setSending(false); }
  }

  async function deleteMessage(id: string) {
    if (id.startsWith('pending-')) { finishPending(id); return; }
    if (!confirm('Delete this message for everyone?')) return;
    setBusy(true); setNotice('');
    try { await read(await post('/api/students', { action: 'delete_message', id })); setMessages(previous => previous.filter(message => message.id !== id)); await refresh(); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  async function openMembers() {
    if (members) { setMembers(null); return; }
    try { const result = await read<{ members: Profile[] }>(await fetch('/api/students?members=1', { cache: 'no-store' })); setMembers(result.members); }
    catch (error) { setNotice((error as Error).message); }
  }

  async function sendImage() {
    if (!photo || !selectedChat) return;
    if (sending) return;
    const chatId = selectedChat.id;
    const photoFile = photo;
    const oneTime = viewOnce;
    const pending = addPendingMessage(oneTime ? '[view-once]' : '[image]pending', oneTime ? 'view-once' : 'image');
    setPhoto(null); setViewOnce(false); setSending(true); setNotice('');
    try {
      const form = new FormData(); form.append('file', photoFile); form.append('view_once', String(oneTime)); form.append('chat_id', chatId);
      await read<{ ok: true; id?: string }>(await fetch('/api/students/image', { method: 'POST', body: form }));
      if (pending) finishPending(pending.id);
      updateChatPreview(chatId, oneTime ? '[view-once]' : '[image]');
      void loadMessages(chatId, true);
    } catch (error) {
      if (pending) finishPending(pending.id);
      setPhoto(photoFile); setViewOnce(oneTime); setNotice((error as Error).message);
    } finally { setSending(false); }
  }

  async function openViewOnce(id: string) {
    setBusy(true); setNotice('');
    try { const response = await fetch(`/api/students/image?id=${encodeURIComponent(id)}`, { method: 'PUT', cache: 'no-store' }); if (!response.ok) throw new Error('This photo has already been opened or is unavailable.'); const blob = await response.blob(); setMessages(previous => previous.map(message => message.id === id ? { ...message, viewed: true } : message)); setOpenedPhoto(URL.createObjectURL(blob)); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  function addEmoji(emoji: string) {
    const start = input.current?.selectionStart ?? body.length; const end = input.current?.selectionEnd ?? start; const next = body.slice(0, start) + emoji + body.slice(end); if (next.length > 1000) return;
    setBody(next); setTyping(Boolean(next.trim())); requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + emoji.length, start + emoji.length); });
  }

  function chooseWallpaper(value: string) {
    setWallpaper(value); setWallpaperError('');
    try { localStorage.setItem(`student-chat-wallpaper:${data?.user?.id}:${selectedChatId}`, value); } catch { setWallpaperError('Wallpaper applied, but this browser could not save it for your next visit.'); }
  }

  function uploadWallpaper(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) { setWallpaperError('Choose an image smaller than 20 MB.'); return; }
    setWallpaperError(''); const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { try { const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable'); context.drawImage(image, 0, 0, canvas.width, canvas.height); chooseWallpaper(canvas.toDataURL('image/jpeg', 0.78)); } catch { setWallpaperError('Could not use this photo. Try a different image.'); } finally { URL.revokeObjectURL(url); } };
    image.onerror = () => { URL.revokeObjectURL(url); setWallpaperError('This photo format is not supported by your browser. Try a JPG or PNG.'); }; image.src = url;
  }

  function selectChat(id: string) {
    setSelectedChatId(id); setMobileChatOpen(true); setMembers(null); setNewChatOpen(false);
    try { setWallpaper(localStorage.getItem(`student-chat-wallpaper:${data?.user?.id}:${id}`) || 'classic'); } catch { setWallpaper('classic'); }
  }

  return <main className={styles.page}>
    {openedPhoto && <div className={styles.photoOverlay} role="dialog" aria-modal="true" aria-label="View-once photo"><button type="button" onClick={() => setOpenedPhoto(null)} aria-label="Close photo"><X size={25}/></button><img src={openedPhoto} alt="View-once photo"/></div>}
    <header className={styles.header}><Link href="/" className={styles.back}><ArrowLeft size={16}/> Marketplace</Link><div><span className={styles.eyebrow}>MAU CONNECT STUDENT COMMUNITY</span><h1>Student Block</h1><p>Private student messaging for study, support and everyday campus life.</p></div></header>
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    {loading ? <p>Opening Student Block...</p> : !data ? <button className={styles.primary} onClick={open}>Try again</button> : !data.user ? <section className={styles.join}><div className={styles.joinIcon}><Users size={28}/></div><h2>Join the student community</h2><p>Sign in or create an account to chat and access study materials.</p><form onSubmit={authenticate}>
      {authMode === 'signup' && <input name="username" required minLength={3} autoComplete="name" aria-label="Name" placeholder="Your name"/>}<input name="email" required type="email" autoComplete="email" aria-label="Email address" placeholder="Email address"/><PasswordInput name="password" required minLength={8} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} aria-label="Password" placeholder="Password (8+ characters)"/><button className={styles.primary} disabled={busy}>{busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</button></form><p className={styles.muted}>{authMode === 'signin' ? 'New to MAU Connect?' : 'Already registered?'} <button className={styles.authSwitch} onClick={() => { setNotice(''); setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); }}>{authMode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>{authMode === 'signin' && <p className={styles.muted}><Link href="/reset-password">Forgot your password?</Link></p>}</section> : <>
      <nav className={styles.tabs} aria-label="Student Block"><span className={styles.active}><MessageCircle size={17}/> Chats</span><Link href="/students/past-q">Past Q</Link><Link href="/students/handouts">Handouts</Link></nav>
      <section className={`${styles.whatsappShell} ${mobileChatOpen ? styles.mobileChatActive : ''}`} aria-label="Student Block chats">
        <aside className={styles.chatSidebar} aria-label="Conversations">
          <div className={styles.sidebarHeader}><div className={styles.sidebarIdentity}><span className={styles.sidebarAvatar}>{data.user.avatar_url ? <img src={data.user.avatar_url} alt=""/> : initials(data.user)}</span><strong>{label(data.user)}</strong></div><div className={styles.sidebarActions}><button type="button" onClick={() => setNewChatOpen(!newChatOpen)} aria-label="New chat"><MessageSquarePlus size={20}/></button><button type="button" onClick={() => setNotice('Chat settings are available from the conversation toolbar.')} aria-label="More options"><MoreVertical size={20}/></button></div></div>
          <div className={styles.chatSearch}><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search or start new chat" aria-label="Search chats"/></div><div className={styles.chatFilters}>{(['all', 'unread', 'groups'] as ChatFilter[]).map(filter => <button type="button" key={filter} className={chatFilter === filter ? styles.filterActive : ''} aria-pressed={chatFilter === filter} onClick={() => setChatFilter(filter)}>{filter[0].toUpperCase() + filter.slice(1)}</button>)}</div>
          {newChatOpen && <div className={styles.contactPicker}><div className={styles.contactPickerTitle}><strong>New chat</strong><button type="button" onClick={() => setNewChatOpen(false)} aria-label="Close new chat"><X size={17}/></button></div>{data.contacts.length ? data.contacts.map(contact => <button type="button" className={styles.contactRow} key={contact.id} onClick={() => void startDirect(contact)}><span className={styles.listAvatar}>{contact.avatar_url ? <img src={contact.avatar_url} alt=""/> : initials(contact)}</span><span><strong>{label(contact)}</strong><small>{contact.username ? `@${contact.username}` : 'Student'}</small></span></button>) : <p className={styles.emptyContacts}>No other students yet.</p>}</div>}
          <div className={styles.chatList}>{filteredChats.length ? filteredChats.map(chat => <button type="button" key={chat.id} onClick={() => selectChat(chat.id)} className={`${styles.chatListItem} ${chat.id === selectedChat?.id ? styles.chatListItemActive : ''}`}><span className={styles.listAvatar}>{chat.avatar_url ? <img src={chat.avatar_url} alt=""/> : chat.kind === 'group' ? <Users size={19}/> : initials({ name: chat.display_name })}</span><span className={styles.chatListCopy}><span><strong>{chat.display_name}</strong><time>{chat.last_at ? new Date(chat.last_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</time></span><span><small>{preview(chat.last_body)}</small>{chat.unread > 0 && <b>{chat.unread}</b>}</span></span></button>) : <p className={styles.emptyContacts}>No chats match your search.</p>}</div>
          <div className={styles.sidebarFooter}><Link href="/profile">Profile</Link><button disabled={busy} onClick={async () => { setBusy(true); try { await read(await post('/api/market', { action: 'signout' })); await refresh(); setNotice('Signed out.'); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); } }}>Sign out</button></div>
        </aside>
        <section className={styles.chatPane} aria-label={selectedChat ? selectedChat.display_name : 'Chat'}>
          {selectedChat ? <>
            <div className={styles.chatTopbar}><button type="button" className={styles.mobileBack} onClick={() => setMobileChatOpen(false)} aria-label="Back to chats"><ArrowLeft size={21}/></button><span className={styles.chatTopAvatar}>{selectedChat.avatar_url ? <img src={selectedChat.avatar_url} alt=""/> : selectedChat.kind === 'group' ? <Users size={20}/> : initials({ name: selectedChat.display_name })}</span><div className={styles.chatTopIdentity}><strong>{selectedChat.display_name}</strong><small>{typing ? 'typing…' : selectedChat.kind === 'group' ? `${selectedChat.members_count} members` : 'Student contact'}</small></div><div className={styles.chatTopActions}>{selectedChat.kind === 'direct' && <><button type="button" onClick={() => setNotice('Voice calls are not enabled yet.')} aria-label="Start voice call"><Phone size={18}/></button><button type="button" onClick={() => setNotice('Video calls are not enabled yet.')} aria-label="Start video call"><Video size={19}/></button></>}<button type="button" onClick={() => { setChatSearchOpen(previous => !previous); setChatMenuOpen(false); }} aria-label="Search in chat" aria-expanded={chatSearchOpen}><Search size={19}/></button><button type="button" onClick={() => { setChatMenuOpen(previous => !previous); setChatSearchOpen(false); }} aria-label="More chat options" aria-expanded={chatMenuOpen}><MoreVertical size={19}/></button>{chatMenuOpen && <div className={styles.chatMenu}><button type="button" onClick={() => { setWallpaperOpen(true); setChatMenuOpen(false); }}>Chat wallpaper</button>{selectedChat.kind === 'group' && <button type="button" onClick={() => { void openMembers(); setChatMenuOpen(false); }}>Group members</button>}<button type="button" onClick={() => { void loadMessages(selectedChat.id); setChatMenuOpen(false); }}>Refresh messages</button></div>}</div></div>
            {chatSearchOpen && <div className={styles.inChatSearch}><Search size={16}/><input autoFocus value={chatSearch} onChange={event => setChatSearch(event.target.value)} placeholder="Search messages" aria-label="Search messages"/><button type="button" onClick={() => { setChatSearch(''); setChatSearchOpen(false); }} aria-label="Close message search"><X size={17}/></button></div>}
            {selectedChat.kind === 'group' && members && <div className={styles.memberList}><div className={styles.wallpaperTitle}><strong>Group members ({members.length})</strong><button type="button" onClick={() => setMembers(null)} aria-label="Close group info"><X size={18}/></button></div>{members.map(member => <div className={styles.memberRow} key={member.id}><span>{member.avatar_url ? <img src={member.avatar_url} alt=""/> : initials(member)}</span><strong>{label(member)}</strong>{member.id === data.user?.id && <small>You</small>}</div>)}</div>}
            {wallpaperOpen && <div className={styles.wallpaperPicker} aria-label="Chat wallpaper"><div className={styles.wallpaperTitle}><div><strong>Chat wallpaper</strong><small>Only visible to you on this device</small></div><button type="button" onClick={() => setWallpaperOpen(false)} aria-label="Close wallpaper picker"><X size={18}/></button></div><div className={styles.wallpaperOptions}>{wallpapers.map(option => <button type="button" key={option.id} onClick={() => chooseWallpaper(option.id)} aria-pressed={wallpaper === option.id}><span style={{ backgroundColor: option.color }}/>{option.name}</button>)}</div><label className={styles.wallpaperUpload}><ImageIcon size={16}/> Choose a photo<input type="file" accept="image/*" onChange={uploadWallpaper}/></label><small className={styles.wallpaperHint}>Photos up to 20 MB</small>{wallpaperError && <p className={styles.wallpaperError} role="alert">{wallpaperError}</p>}</div>}
            <div className={styles.messages} aria-label="Messages" style={chatBackground}>
              {loadingMessages ? <div className={styles.chatLoading}>Loading messages…</div> : visibleMessages.length ? visibleMessages.map(message => {
                const mine = message.user_id === data.user?.id;
                const isVoice = message.media === "voice" || /^\[voice\][0-9a-f-]{36}\/[0-9a-f-]{36}\.(webm|ogg|mp4)$/i.test(message.body);
                const isViewOnce = message.media === "view-once" || message.body === "[view-once]";
                const isImage = message.media === "image" || /^\[image\][0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(message.body);
                return <article className={`${styles.message} ${mine ? styles.mine : ""}`} key={message.id}>
                  <div className={styles.bubble}>
                    {!mine && selectedChat.kind === "group" && <strong>{label(message.user)}</strong>}
                    {isViewOnce ? <button type="button" className={styles.viewOnceButton} disabled={busy || sending || mine || Boolean(message.viewed) || Boolean(message.pending)} onClick={() => void openViewOnce(message.id)}><EyeOff size={17}/> {message.pending ? "Sending…" : mine ? "View-once photo" : message.viewed ? "Opened" : "Open photo"}</button> : isVoice ? message.pending ? <div className={styles.pendingMedia}><Mic size={16}/> Sending voice note…</div> : <audio className={styles.voiceAudio} controls preload="none" src={`/api/students/voice?id=${encodeURIComponent(message.id)}`} aria-label="Voice note"/> : isImage ? message.pending ? <div className={styles.pendingMedia}><ImageIcon size={16}/> Sending photo…</div> : <img className={styles.chatImage} loading="lazy" src={`/api/students/image?id=${encodeURIComponent(message.id)}`} alt="Shared photo"/> : <p>{message.body}</p>}
                    <div className={styles.messageMeta}><small>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>{mine && <><CheckCheck size={14} className={styles.readChecks}/><button type="button" disabled={busy || sending || message.pending} onClick={() => void deleteMessage(message.id)} aria-label={isVoice ? "Delete voice note" : "Delete message"}><Trash2 size={13}/></button></>}</div>
                  </div>
                </article>;
              }) : <div className={styles.chatEmpty}>{chatSearch.trim() ? "No messages found." : "Say hello and start the conversation."}</div>}
              <div ref={bottom}/>
            </div>
            {photo ? <div className={styles.photoComposer}><Camera size={18}/><span>{photo.name}</span><button type="button" className={styles.viewOnceToggle} aria-pressed={viewOnce} onClick={() => setViewOnce(!viewOnce)}><EyeOff size={15}/> {viewOnce ? "View once on" : "View once off"}</button><button type="button" onClick={() => setPhoto(null)} aria-label="Discard photo"><X size={20}/></button><button type="button" className={styles.sendButton} disabled={busy || sending} onClick={() => void sendImage()} aria-label="Send photo"><Send size={20}/></button></div> : recording || voice ? <div className={styles.voiceComposer}>{recording ? <><span className={styles.recordingDot}/> Recording voice note… <button type="button" className={styles.sendButton} onClick={stopRecording} aria-label="Stop recording"><Square size={18}/></button></> : <><button type="button" className={styles.emojiButton} disabled={busy || sending} onClick={() => setVoice(null)} aria-label="Discard voice note"><Trash2 size={20}/></button><audio className={styles.voicePreview} controls src={voiceUrl} aria-label="Preview voice note"/><button type="button" className={styles.sendButton} disabled={busy || sending} onClick={() => void sendVoice()} aria-label="Send voice note"><Send size={20}/></button></>}</div> : <form className={styles.composer} onSubmit={send}><div className={styles.composerField}><button type="button" className={styles.attachButton} onClick={() => photoInput.current?.click()} aria-label="Attach a photo"><Paperclip size={19}/></button><label className={styles.photoButton} aria-label="Send a photo"><ImageIcon size={21}/><input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || sending} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) { setPhoto(file); setViewOnce(false); } }}/></label><button type="button" className={styles.emojiButton} aria-label={emojiOpen ? "Close emoji picker" : "Open emoji picker"} aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={22}/></button>{emojiOpen && <div className={styles.emojiPicker} aria-label="Choose an emoji">{emojis.map(emoji => <button type="button" key={emoji} onClick={() => addEmoji(emoji)} aria-label={`Add ${emoji}`}>{emoji}</button>)}</div>}<input ref={input} value={body} onChange={event => onBodyChange(event.target.value)} maxLength={1000} aria-label="Message" placeholder="Type a message"/></div>{body.trim() ? <button className={styles.sendButton} aria-label="Send message" disabled={busy || sending}><Send size={20}/></button> : <button type="button" className={styles.sendButton} disabled={busy || sending} onClick={() => void startRecording()} aria-label="Record voice note"><Mic size={20}/></button>}</form>}
            <div className={styles.chatToolbar}><button type="button" onClick={() => setWallpaperOpen(!wallpaperOpen)}><ImageIcon size={15}/> Wallpaper</button>{selectedChat.kind === 'group' && <button type="button" onClick={() => void openMembers()}><Users size={15}/> Members</button>}<span>Messages are protected by your account session.</span></div>
          </> : <div className={styles.noChat}><MessageCircle size={46}/><h2>Student Block</h2><p>Select a conversation or start a new chat.</p></div>}
        </section>
      </section>
      <div className={styles.accountActions}><Link href="/profile">My profile</Link><Link href="/?dashboard=1">Open my dashboard</Link></div>
    </>}
  </main>;
}
