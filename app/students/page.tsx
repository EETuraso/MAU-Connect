/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
'use client';

import { ChangeEvent, FormEvent, Fragment, KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, Check, CheckCheck, CircleAlert, Clock3, Copy, EyeOff, FileText, FileVideo, Forward, Image as ImageIcon, Info, MapPin, MessageCircle, MessageSquarePlus, Mic, MoreVertical, Phone, Pin, Plus, Reply, Search, Send, Smile, Square, Trash2, Users, Video, VolumeX, X } from 'lucide-react';
import PasswordInput from '../password-input';
import ThemeToggle from '../../components/theme-toggle';
import styles from './students.module.css';

type Profile = { id: string; name?: string; username?: string | null; avatar_url?: string | null };
type Chat = { id: string; kind: 'group' | 'direct'; name: string; display_name: string; avatar_url?: string | null; members_count: number; last_body?: string | null; last_at?: string | null; unread: number };
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
type Message = { id: string; chat_id: string; user_id: string; body: string; created_at: string; viewed?: boolean; user: Profile; pending?: boolean; failed?: boolean; status?: MessageStatus; media?: 'voice' | 'image' | 'view-once' | 'video'; reply_to?: { body: string; user: Profile } | null };
type Bootstrap = { user: Profile | null; chats: Chat[]; contacts: Profile[] };
type ChatFilter = 'all' | 'unread' | 'groups';
type ChatInfo = { id: string; kind: 'group' | 'direct'; name: string; created_at: string; members: Array<Profile & { joined_at?: string }> };

const reactionEmojis = ['❤️', '😂', '😮', '😢', '🙏'];
const senderColors = ['#1f8f7a', '#3584d8', '#e07b39', '#9b59b6', '#b64e68', '#2b9caa', '#6c8d2f', '#c26a9b'];

const emojis = ['😀', '😂', '😊', '😍', '🥰', '😎', '🤔', '😅', '😭', '😢', '😮', '🙌', '👏', '👍', '👋', '🙏', '💪', '❤️', '🔥', '🎉', '✅', '📚', '💯', '✨'];
const wallpapers = [
  { id: 'classic', name: 'WhatsApp dark', color: '#0b141a' },
  { id: 'sage', name: 'Sage', color: '#dceadf' },
  { id: 'sky', name: 'Sky', color: '#dcebf1' },
  { id: 'sand', name: 'Sand', color: '#f3e4ce' },
  { id: 'lavender', name: 'Lavender', color: '#ebe2f1' },
  { id: 'slate', name: 'Slate', color: '#cbd8d6' },
];

const dayKey = (value: string) => new Date(value).toLocaleDateString('en-CA');
const dateLabel = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today.toISOString())) return 'TODAY';
  if (dayKey(value) === dayKey(yesterday.toISOString())) return 'YESTERDAY';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
};
const messageTime = (value: string) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const chatTime = (value?: string | null) => value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
const senderColor = (id: string) => senderColors[[...id].reduce((total, character) => total + character.charCodeAt(0), 0) % senderColors.length];

async function read<T>(response: Response): Promise<T> {
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Unable to complete request.');
  return result as T;
}

const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
type LabelProfile = Pick<Profile, 'name' | 'username'>;
const label = (profile?: LabelProfile | null) => profile?.username?.trim() || profile?.name?.trim() || 'Student';
const initials = (profile?: LabelProfile | null) => label(profile).slice(0, 1).toUpperCase();
const mentionHandle = (profile?: LabelProfile | null) => {
  const value = profile?.username?.trim() || profile?.name?.trim() || 'student';
  return value.replace(/^@+/, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 30) || 'student';
};
const preview = (body?: string | null) => {
  if (!body) return 'No messages yet';
  if (body === '[view-once]') return '📷 View-once photo';
  if (body.startsWith('[image]')) return '📷 Photo';
  if (body.startsWith('[voice]')) return '🎙️ Voice note';
  if (body.startsWith('[video]')) return '🎥 Video';
  return body;
};

export default function Students() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionEnd, setMentionEnd] = useState(-1);
  const [mentionIndex, setMentionIndex] = useState(0);
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
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState('classic');
  const [wallpaperError, setWallpaperError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [openedPhoto, setOpenedPhoto] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [pinnedChats, setPinnedChats] = useState<string[]>([]);
  const [mutedChats, setMutedChats] = useState<string[]>([]);
  const [mutedCurrentChat, setMutedCurrentChat] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageAbort = useRef<AbortController | null>(null);
  const selectedChatRef = useRef('');
  const input = useRef<HTMLTextAreaElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { selectedChatRef.current = selectedChatId; }, [selectedChatId]);
  const selectedChat = data?.chats.find(chat => chat.id === selectedChatId) || data?.chats[0];
  const filteredChats = (data?.chats || [])
    .filter(chat => chat.display_name.toLowerCase().includes(search.trim().toLowerCase()) && (chatFilter === 'all' || (chatFilter === 'unread' ? chat.unread > 0 : chat.kind === 'group')))
    .sort((left, right) => Number(pinnedChats.includes(right.id)) - Number(pinnedChats.includes(left.id)) || new Date(right.last_at || 0).getTime() - new Date(left.last_at || 0).getTime());
  const mentionProfiles = Array.from(new Map([
    ...(data?.contacts || []),
    ...(chatInfo?.members || []),
    ...(data?.user ? [data.user] : []),
  ].map(profile => [profile.id, profile] as const)).values());
  const mentionOptions = mentionQuery === null ? [] : mentionProfiles
    .filter(profile => mentionHandle(profile).toLowerCase().startsWith(mentionQuery.toLowerCase()) || label(profile).toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 8);
  const visibleMessages = [...messages, ...pendingMessages].filter(message => message.chat_id === selectedChat?.id && (!chatSearch.trim() || `${message.body} ${label(message.user)}`.toLowerCase().includes(chatSearch.trim().toLowerCase())));
  const chatBackground = wallpaper.startsWith('data:image/')
    ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: wallpapers.find(option => option.id === wallpaper)?.color || wallpapers[0].color };
  const chatSubtitle = selectedChat?.kind === 'group'
    ? chatInfo?.id === selectedChat.id && chatInfo.members.length
      ? `${chatInfo.members.filter(member => member.id !== data?.user?.id).slice(0, 3).map(label).join(', ') || 'You'}${chatInfo.members.length > 4 ? ` + ${chatInfo.members.length - 4} more` : ''}`
      : 'tap here for group info'
    : 'tap here for contact info';

  useEffect(() => {
    if (!data?.user?.id) return;
    try {
      setPinnedChats(JSON.parse(localStorage.getItem(`student-pinned-chats:${data.user.id}`) || '[]'));
      setMutedChats(JSON.parse(localStorage.getItem(`student-muted-chats:${data.user.id}`) || '[]'));
    } catch {
      setPinnedChats([]); setMutedChats([]);
    }
  }, [data?.user?.id]);

  useEffect(() => {
    setMutedCurrentChat(Boolean(selectedChat && mutedChats.includes(selectedChat.id)));
  }, [selectedChat?.id, mutedChats]);

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

  // Subscribe to the selected chat instead of repeatedly refreshing the entire message list.
  useEffect(() => {
    if (!data?.user || !selectedChatId || typeof WebSocket === 'undefined') return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setTimeout> | null = null;
    const heartbeatLoop = () => {
      if (cancelled || !socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) }));
      heartbeat = setTimeout(heartbeatLoop, 25000);
    };
    const connect = async () => {
      try {
        const result = await read<{ url: string; token: string }>(await fetch('/api/students/realtime', { cache: 'no-store' }));
        if (cancelled) return;
        socket = new WebSocket(result.url);
        socket.onopen = () => {
          socket?.send(JSON.stringify({
            topic: 'realtime:public:student_messages',
            event: 'phx_join',
            payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'student_messages', filter: `chat_id=eq.${selectedChatId}` }] }, access_token: result.token },
            ref: '1',
          }));
          heartbeatLoop();
        };
        socket.onmessage = event => {
          try {
            const message = JSON.parse(String(event.data)) as { event?: string };
            if (message.event === 'postgres_changes') void loadMessages(selectedChatId, true);
          } catch { /* Ignore malformed keep-alive frames. */ }
        };
      } catch { /* Realtime is optional until the publication is enabled. */ }
    };
    void connect();
    return () => { cancelled = true; if (heartbeat) clearTimeout(heartbeat); socket?.close(); };
  }, [data?.user?.id, selectedChatId]);

  useEffect(() => {
    if (!data?.user || !selectedChatId) return;
    const refreshOnReturn = () => { if (!document.hidden) void loadMessages(selectedChatId, true); };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => { window.removeEventListener('focus', refreshOnReturn); document.removeEventListener('visibilitychange', refreshOnReturn); };
  }, [data?.user?.id, selectedChatId]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages.length, pendingMessages.length, selectedChatId]);
  useEffect(() => () => { messageAbort.current?.abort(); if (recordingTimer.current) clearTimeout(recordingTimer.current); if (holdTimer.current) clearTimeout(holdTimer.current); stream.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => () => { if (openedPhoto) URL.revokeObjectURL(openedPhoto); }, [openedPhoto]);
  useEffect(() => {
    if (!voice) { setVoiceUrl(''); return; }
    const url = URL.createObjectURL(voice); setVoiceUrl(url); return () => URL.revokeObjectURL(url);
  }, [voice]);
  useEffect(() => {
    if (!video) { setVideoUrl(''); return; }
    const url = URL.createObjectURL(video); setVideoUrl(url); return () => URL.revokeObjectURL(url);
  }, [video]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const result = await read<{ message: string }>(await post('/api/market', { action: authMode, email: form.get('email'), password: form.get('password'), name: form.get('username') }));
      await refresh(); setNotice(result.message);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  function addPendingMessage(bodyValue: string, media?: Message['media'], quoted?: Message | null) {
    if (!data?.user || !selectedChat) return null;
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pending: Message = { id, chat_id: selectedChat.id, user_id: data.user.id, body: bodyValue, created_at: new Date().toISOString(), user: data.user, pending: true, status: 'sending', media, reply_to: quoted ? { body: quoted.body, user: quoted.user } : null };
    setPendingMessages(previous => [...previous, pending]);
    return pending;
  }

  function finishPending(id: string) {
    setPendingMessages(previous => previous.filter(message => message.id !== id));
  }

  function failPending(id: string) {
    setPendingMessages(previous => previous.map(message => message.id === id ? { ...message, pending: false, failed: true, status: 'failed' } : message));
  }

  function updateChatPreview(chatId: string, bodyValue: string) {
    const now = new Date().toISOString();
    setData(previous => previous ? { ...previous, chats: previous.chats.map(chat => chat.id === chatId ? { ...chat, last_body: bodyValue, last_at: now, unread: 0 } : chat) } : previous);
  }

  function resetComposer() {
    setBody(''); setMentionQuery(null); setMentionStart(-1); setMentionEnd(-1); setMentionIndex(0); setReplyTo(null); setEmojiOpen(false);
    requestAnimationFrame(() => { if (input.current) input.current.style.height = 'auto'; });
  }

  async function sendText(textOverride?: string, pendingId?: string, quoted?: Message | null) {
    const text = (textOverride ?? body).trim();
    if (!text || !selectedChat || sending) return;
    const chatId = selectedChat.id;
    const pending = pendingId ? null : addPendingMessage(text, undefined, quoted ?? replyTo);
    const id = pendingId || pending?.id;
    if (!pendingId) resetComposer();
    setSending(true); setNotice('');
    if (pendingId) setPendingMessages(previous => previous.map(message => message.id === pendingId ? { ...message, pending: true, failed: false, status: 'sending' } : message));
    try {
      await read<{ ok: true; id?: string }>(await post('/api/students/chat', { action: 'send', chat_id: chatId, body: text }));
      if (id) finishPending(id);
      updateChatPreview(chatId, text);
      void loadMessages(chatId, true);
    } catch (error) {
      if (id) failPending(id);
      setBody(text); setNotice((error as Error).message);
    } finally { setSending(false); }
  }

  function send(event: FormEvent) { event.preventDefault(); void sendText(); }

  async function retryMessage(message: Message) { await sendText(message.body, message.id); }

  function updateMentionState(value: string, cursor: number) {
    const beforeCursor = value.slice(0, cursor);
    const at = beforeCursor.lastIndexOf('@');
    const previous = at > 0 ? beforeCursor[at - 1] : '';
    const query = at >= 0 ? beforeCursor.slice(at + 1) : '';
    if (at < 0 || (previous && !/\s/.test(previous)) || !/^[a-zA-Z0-9._-]*$/.test(query)) {
      setMentionQuery(null); setMentionStart(-1); setMentionEnd(-1); setMentionIndex(0); return;
    }
    setMentionQuery(query); setMentionStart(at); setMentionEnd(cursor); setMentionIndex(0);
  }

  function resizeComposer() {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = `${Math.min(Math.max(input.current.scrollHeight, 44), 120)}px`;
    input.current.style.overflowY = input.current.scrollHeight > 120 ? 'auto' : 'hidden';
  }

  function onBodyChange(value: string, cursor = value.length) { setBody(value); updateMentionState(value, cursor); requestAnimationFrame(resizeComposer); }

  function selectMention(profile: Profile) {
    if (mentionStart < 0) return;
    const end = mentionEnd >= mentionStart ? mentionEnd : body.length;
    const inserted = `@${mentionHandle(profile)} `;
    const next = `${body.slice(0, mentionStart)}${inserted}${body.slice(end)}`;
    const cursor = mentionStart + inserted.length;
    setBody(next); setMentionQuery(null); setMentionStart(-1); setMentionEnd(-1); setMentionIndex(0);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(cursor, cursor); resizeComposer(); });
  }

  function onBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionOptions.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setMentionIndex(index => (index + 1) % mentionOptions.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setMentionIndex(index => (index - 1 + mentionOptions.length) % mentionOptions.length); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); selectMention(mentionOptions[mentionIndex]); return; }
      if (event.key === 'Escape') { event.preventDefault(); setMentionQuery(null); setMentionStart(-1); setMentionEnd(-1); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendText(); }
  }

  function renderMessageBody(value: string): ReactNode {
    return value.split(/(@[a-zA-Z0-9._-]+)/g).map((part, index) => part.startsWith('@') ? <span className={styles.mention} key={`${part}-${index}`}>{part}</span> : part);
  }

  async function startDirect(contact: Profile) {
    setBusy(true); setNotice('');
    try { const result = await read<{ chat_id: string }>(await post('/api/students/chat', { action: 'direct', user_id: contact.id })); await refresh(); setSelectedChatId(result.chat_id); setNewChatOpen(false); setMobileChatOpen(true); setChatInfo(null); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  async function startRecording() {
    setAttachmentOpen(false);
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
      if (pending) failPending(pending.id);
      setVoice(recordingBlob); setNotice((error as Error).message);
    } finally { setSending(false); }
  }

  async function deleteMessage(id: string, deleteFor: 'me' | 'everyone') {
    if (id.startsWith('pending-')) { finishPending(id); return; }
    setBusy(true); setNotice('');
    try {
      await read(await post('/api/students/chat', { action: 'delete', id, delete_for: deleteFor }));
      setMessages(previous => previous.filter(message => message.id !== id));
      setMessageMenuId(null);
      await refresh();
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  async function openChatInfo() {
    if (!selectedChat) return;
    if (chatInfo) { setChatInfo(null); setChatMenuOpen(false); return; }
    try {
      const result = await read<{ info: ChatInfo }>(await fetch(`/api/students/chat?info=${encodeURIComponent(selectedChat.id)}`, { cache: 'no-store' }));
      setChatInfo(result.info);
      setMemberSearch('');
      setChatMenuOpen(false);
    } catch (error) { setNotice((error as Error).message); }
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

  async function sendVideo() {
    if (!video || !selectedChat || sending) return;
    const chatId = selectedChat.id;
    const videoFile = video;
    const pending = addPendingMessage('[video]pending', 'video');
    setVideo(null); setSending(true); setNotice('');
    try {
      const form = new FormData(); form.append('file', videoFile); form.append('chat_id', chatId);
      await read<{ ok: true; id?: string }>(await fetch('/api/students/video', { method: 'POST', body: form }));
      if (pending) finishPending(pending.id);
      updateChatPreview(chatId, '[video]');
      void loadMessages(chatId, true);
    } catch (error) {
      if (pending) finishPending(pending.id);
      setVideo(videoFile); setNotice((error as Error).message);
    } finally { setSending(false); }
  }

  async function openViewOnce(id: string) {
    setBusy(true); setNotice('');
    try { const response = await fetch(`/api/students/image?id=${encodeURIComponent(id)}`, { method: 'PUT', cache: 'no-store' }); if (!response.ok) throw new Error('This photo has already been opened or is unavailable.'); const blob = await response.blob(); setMessages(previous => previous.map(message => message.id === id ? { ...message, viewed: true } : message)); setOpenedPhoto(URL.createObjectURL(blob)); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }

  function addEmoji(emoji: string) {
    const start = input.current?.selectionStart ?? body.length; const end = input.current?.selectionEnd ?? start; const next = body.slice(0, start) + emoji + body.slice(end); if (next.length > 1000) return;
    setBody(next); requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + emoji.length, start + emoji.length); resizeComposer(); });
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
    setSelectedChatId(id); setMobileChatOpen(true); setChatInfo(null); setMessageMenuId(null); setNewChatOpen(false);
    try { setWallpaper(localStorage.getItem(`student-chat-wallpaper:${data?.user?.id}:${id}`) || 'classic'); } catch { setWallpaper('classic'); }
  }

  function persistChatList(key: 'pinned' | 'muted', next: string[]) {
    try { localStorage.setItem(`student-${key}-chats:${data?.user?.id}`, JSON.stringify(next)); } catch { /* Optional local preference. */ }
  }

  function togglePinned(chatId: string) {
    const next = pinnedChats.includes(chatId) ? pinnedChats.filter(id => id !== chatId) : [...pinnedChats, chatId];
    setPinnedChats(next); persistChatList('pinned', next); setChatMenuOpen(false);
  }

  function toggleMuted(chatId: string) {
    const next = mutedChats.includes(chatId) ? mutedChats.filter(id => id !== chatId) : [...mutedChats, chatId];
    setMutedChats(next); setMutedCurrentChat(next.includes(chatId)); persistChatList('muted', next); setChatMenuOpen(false);
  }

  function handleMediaFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; setAttachmentOpen(false); if (!file) return;
    if (file.type.startsWith('video/')) { setVideo(file); setPhoto(null); }
    else if (file.type.startsWith('image/')) { setPhoto(file); setVideo(null); }
    else setNotice('Choose an image or video for the chat.');
    setViewOnce(false);
  }

  async function copyMessage(message: Message) {
    if (message.body.startsWith('[')) { setNotice('Only text messages can be copied.'); return; }
    try { await navigator.clipboard.writeText(message.body); setNotice('Message copied.'); } catch { setNotice('Copy is not available in this browser.'); }
    setMessageMenuId(null);
  }

  function forwardMessage(message: Message) {
    if (!message.body.startsWith('[')) setBody(message.body);
    setMessageMenuId(null); setNotice('Message added to the composer. Choose a chat to send it.');
    requestAnimationFrame(() => { input.current?.focus(); resizeComposer(); });
  }

  function reactTo(messageId: string, emoji: string) {
    setReactions(previous => {
      const values = previous[messageId] || [];
      return { ...previous, [messageId]: values.includes(emoji) ? values.filter(value => value !== emoji) : [...values, emoji] };
    });
    setMessageMenuId(null);
  }

  function beginReply(message: Message) { setReplyTo(message); setMessageMenuId(null); requestAnimationFrame(() => input.current?.focus()); }
  function beginHold(id: string) { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = setTimeout(() => setMessageMenuId(id), 550); }
  function endHold() { if (holdTimer.current) clearTimeout(holdTimer.current); }

  function chooseAttachment(kind: 'document' | 'camera' | 'gallery' | 'audio' | 'location' | 'contact' | 'poll') {
    setAttachmentOpen(false);
    if (kind === 'gallery') { attachmentInput.current?.click(); return; }
    if (kind === 'camera') { cameraInput.current?.click(); return; }
    if (kind === 'audio') { void startRecording(); return; }
    if (kind === 'location') { setNotice('Location sharing is coming soon.'); return; }
    if (kind === 'contact') { setNotice('Contact sharing is coming soon.'); return; }
    if (kind === 'poll') { setNotice('Polls are coming soon.'); return; }
    setNotice('Document sharing is coming soon.');
  }

  function renderStatus(message: Message, mine: boolean) {
    if (!mine) return null;
    if (message.failed) return <button type="button" className={styles.failedStatus} onClick={() => void retryMessage(message)} aria-label="Retry sending message"><CircleAlert size={15}/></button>;
    if (message.pending) return <Clock3 size={14} className={styles.sendingStatus} aria-label="Sending"/>;
    if (message.status === 'read') return <CheckCheck size={15} className={styles.readChecks} aria-label="Read"/>;
    return message.status === 'sent' ? <Check size={14} className={styles.sentCheck} aria-label="Sent"/> : <CheckCheck size={15} className={styles.sentCheck} aria-label="Delivered"/>;
  }

  return <main className={`${styles.page} ${data?.user ? styles.chatPage : ''}`}>
    {openedPhoto && <div className={styles.photoOverlay} role="dialog" aria-modal="true" aria-label="View-once photo"><button type="button" onClick={() => setOpenedPhoto(null)} aria-label="Close photo"><X size={25}/></button><img src={openedPhoto} alt="View-once photo"/></div>}
    {!data?.user && <header className={styles.header}><Link href="/" className={styles.back}><ArrowLeft size={16}/> Marketplace</Link><div><span className={styles.eyebrow}>MAU CONNECT STUDENT COMMUNITY</span><h1>Student Block</h1><p>Private student messaging for study, support and everyday campus life.</p></div><div className={styles.headerActions}><ThemeToggle/></div></header>}
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    {loading ? <p>Opening Student Block...</p> : !data ? <button className={styles.primary} onClick={open}>Try again</button> : !data.user ? <section className={styles.join}><div className={styles.joinIcon}><Users size={28}/></div><h2>Join the student community</h2><p>Sign in or create an account to chat and access study materials.</p><form onSubmit={authenticate}>
      {authMode === 'signup' && <input name="username" required minLength={3} autoComplete="name" aria-label="Name" placeholder="Your name"/>}<input name="email" required type="email" autoComplete="email" aria-label="Email address" placeholder="Email address"/><PasswordInput name="password" required minLength={8} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} aria-label="Password" placeholder="Password (8+ characters)"/><button className={styles.primary} disabled={busy}>{busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</button></form><p className={styles.muted}>{authMode === 'signin' ? 'New to MAU Connect?' : 'Already registered?'} <button className={styles.authSwitch} onClick={() => { setNotice(''); setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); }}>{authMode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>{authMode === 'signin' && <p className={styles.muted}><Link href="/reset-password">Forgot your password?</Link></p>}</section> : <>
      <section className={`${styles.whatsappShell} ${mobileChatOpen ? styles.mobileChatActive : ''}`} aria-label="Student Block chats">
        <aside className={styles.chatSidebar} aria-label="Conversations">
          <div className={styles.sidebarHeader}><div className={styles.sidebarIdentity}><span className={styles.sidebarAvatar}>{data.user.avatar_url ? <img src={data.user.avatar_url} alt=""/> : initials(data.user)}</span><strong>{label(data.user)}</strong></div><div className={styles.sidebarActions}><button type="button" onClick={() => setNewChatOpen(!newChatOpen)} aria-label="New chat"><MessageSquarePlus size={20}/></button><button type="button" onClick={() => setNotice('Chat settings are available from the conversation toolbar.')} aria-label="More options"><MoreVertical size={20}/></button></div></div>
          <div className={styles.chatSearch}><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search or start new chat" aria-label="Search chats"/></div><div className={styles.chatFilters}>{(['all', 'unread', 'groups'] as ChatFilter[]).map(filter => <button type="button" key={filter} className={chatFilter === filter ? styles.filterActive : ''} aria-pressed={chatFilter === filter} onClick={() => setChatFilter(filter)}>{filter[0].toUpperCase() + filter.slice(1)}</button>)}</div>
          {newChatOpen && <div className={styles.contactPicker}><div className={styles.contactPickerTitle}><strong>New chat</strong><button type="button" onClick={() => setNewChatOpen(false)} aria-label="Close new chat"><X size={17}/></button></div>{data.contacts.length ? data.contacts.map(contact => <button type="button" className={styles.contactRow} key={contact.id} onClick={() => void startDirect(contact)}><span className={styles.listAvatar}>{contact.avatar_url ? <img src={contact.avatar_url} alt=""/> : initials(contact)}</span><span><strong>{label(contact)}</strong><small>{contact.username ? `@${contact.username}` : 'Student'}</small></span></button>) : <p className={styles.emptyContacts}>No other students yet.</p>}</div>}
          <div className={styles.chatList}>{filteredChats.length ? filteredChats.map(chat => <button type="button" key={chat.id} onClick={() => selectChat(chat.id)} className={`${styles.chatListItem} ${chat.id === selectedChat?.id ? styles.chatListItemActive : ''}`}><span className={styles.listAvatar}>{chat.avatar_url ? <img src={chat.avatar_url} alt=""/> : chat.kind === 'group' ? <Users size={19}/> : initials({ name: chat.display_name })}</span><span className={styles.chatListCopy}><span><strong>{chat.display_name}</strong><time>{chatTime(chat.last_at)}</time></span><span><small>{preview(chat.last_body)}</small><span className={styles.chatListBadges}>{pinnedChats.includes(chat.id) && <Pin size={12} className={styles.pinnedIcon}/>} {mutedChats.includes(chat.id) && <VolumeX size={12}/>} {chat.unread > 0 && <b>{chat.unread}</b>}</span></span></span></button>) : <p className={styles.emptyContacts}>No chats match your search.</p>}</div>
          <div className={styles.sidebarFooter}><span>Student Block</span><button disabled={busy} onClick={async () => { setBusy(true); try { await read(await post('/api/market', { action: 'signout' })); await refresh(); setNotice('Signed out.'); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); } }}>Sign out</button></div>
        </aside>
        <section className={styles.chatPane} aria-label={selectedChat ? selectedChat.display_name : 'Chat'}>
          {selectedChat ? <>
            <div className={styles.chatTopbar}><button type="button" className={styles.mobileBack} onClick={() => setMobileChatOpen(false)} aria-label="Back to chats"><ArrowLeft size={21}/></button><button type="button" className={styles.chatTopAvatarButton} onClick={() => void openChatInfo()} aria-label={`Open ${selectedChat.kind === 'group' ? 'group' : 'chat'} info`}><span className={styles.chatTopAvatar}>{selectedChat.avatar_url ? <img src={selectedChat.avatar_url} alt=""/> : selectedChat.kind === 'group' ? <Users size={20}/> : initials({ name: selectedChat.display_name })}</span></button><button type="button" className={styles.chatTopIdentity} onClick={() => void openChatInfo()} aria-label={`Open ${selectedChat.kind === 'group' ? 'group' : 'chat'} info`}><strong>{selectedChat.display_name}</strong><small>{chatSubtitle}</small></button><div className={styles.chatTopActions}><button type="button" onClick={() => setNotice('Voice calls are not enabled yet.')} aria-label="Start voice call"><Phone size={18}/></button><button type="button" onClick={() => setNotice('Video calls are not enabled yet.')} aria-label="Start video call"><Video size={19}/></button><button type="button" onClick={() => { setChatSearchOpen(previous => !previous); setChatMenuOpen(false); }} aria-label="Search in chat" aria-expanded={chatSearchOpen}><Search size={19}/></button><button type="button" onClick={() => { setChatMenuOpen(previous => !previous); setChatSearchOpen(false); }} aria-label="More chat options" aria-expanded={chatMenuOpen}><MoreVertical size={19}/></button>{chatMenuOpen && <div className={styles.chatMenu}><button type="button" onClick={() => void openChatInfo()}>Group info</button><button type="button" onClick={() => { setChatSearchOpen(true); setChatMenuOpen(false); }}>Search</button><button type="button" onClick={() => { setNotice('Shared media will appear here when available.'); setChatMenuOpen(false); }}>Media, links and docs</button><button type="button" onClick={() => toggleMuted(selectedChat.id)}>{mutedCurrentChat ? 'Unmute notifications' : 'Mute notifications'}</button><button type="button" onClick={() => togglePinned(selectedChat.id)}>{pinnedChats.includes(selectedChat.id) ? 'Unpin chat' : 'Pin chat'}</button><button type="button" onClick={() => { setNotice('Exit group is not available yet.'); setChatMenuOpen(false); }}>Exit group</button><button type="button" onClick={() => { void loadMessages(selectedChat.id); setChatMenuOpen(false); }}>Refresh messages</button></div>}</div></div>
            {chatSearchOpen && <div className={styles.inChatSearch}><Search size={16}/><input autoFocus value={chatSearch} onChange={event => setChatSearch(event.target.value)} placeholder="Search messages" aria-label="Search messages"/><button type="button" onClick={() => { setChatSearch(''); setChatSearchOpen(false); }} aria-label="Close message search"><X size={17}/></button></div>}
            {chatInfo && <aside className={styles.chatInfoPanel} aria-label="Chat information"><div className={styles.chatInfoHeader}><button type="button" onClick={() => setChatInfo(null)} aria-label="Close chat information"><ArrowLeft size={21}/></button><strong>{chatInfo.kind === 'group' ? 'Group info' : 'Contact info'}</strong><button type="button" onClick={() => setChatInfo(null)} aria-label="Close chat information"><X size={19}/></button></div><div className={styles.chatInfoHero}><span className={styles.chatInfoAvatar}>{selectedChat.avatar_url ? <img src={selectedChat.avatar_url} alt=""/> : selectedChat.kind === 'group' ? <Users size={34}/> : initials({ name: selectedChat.display_name })}</span><h2>{chatInfo.name || selectedChat.display_name}</h2><p>{chatInfo.kind === 'group' ? `${chatInfo.members.length} members` : 'Student contact'}</p></div><div className={styles.chatInfoSection}><strong><Info size={16}/> About this chat</strong><p>{chatInfo.kind === 'group' ? 'Study, support and everyday campus life.' : 'A private Student Block conversation.'}</p></div><div className={styles.chatInfoSection}><strong><Users size={16}/> {chatInfo.members.length} members</strong>{chatInfo.members.map(member => <div className={styles.memberRow} key={member.id}><span>{member.avatar_url ? <img src={member.avatar_url} alt=""/> : initials(member)}</span><strong>{label(member)}</strong>{member.id === data.user?.id && <small>You</small>}</div>)}</div></aside>}
            {wallpaperOpen && <div className={styles.wallpaperPicker} aria-label="Chat wallpaper"><div className={styles.wallpaperTitle}><div><strong>Chat wallpaper</strong><small>Only visible to you on this device</small></div><button type="button" onClick={() => setWallpaperOpen(false)} aria-label="Close wallpaper picker"><X size={18}/></button></div><div className={styles.wallpaperOptions}>{wallpapers.map(option => <button type="button" key={option.id} onClick={() => chooseWallpaper(option.id)} aria-pressed={wallpaper === option.id}><span style={{ backgroundColor: option.color }}/>{option.name}</button>)}</div><label className={styles.wallpaperUpload}><ImageIcon size={16}/> Choose a photo<input type="file" accept="image/*" onChange={uploadWallpaper}/></label><small className={styles.wallpaperHint}>Photos up to 20 MB</small>{wallpaperError && <p className={styles.wallpaperError} role="alert">{wallpaperError}</p>}</div>}
            <div className={styles.messages} aria-label="Messages" style={chatBackground}>
              {loadingMessages ? <div className={styles.chatLoading}>Loading messages…</div> : visibleMessages.length ? visibleMessages.map((message, index) => {
                const mine = message.user_id === data.user?.id;
                const previous = visibleMessages[index - 1];
                const grouped = Boolean(previous && previous.user_id === message.user_id && dayKey(previous.created_at) === dayKey(message.created_at));
                const isVoice = message.media === 'voice' || /^\[voice\][0-9a-f-]{36}\/[0-9a-f-]{36}\.(webm|ogg|mp4)$/i.test(message.body);
                const isViewOnce = message.media === 'view-once' || message.body === '[view-once]';
                const isImage = message.media === 'image' || /^\[image\][0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(message.body);
                const isVideo = message.media === 'video' || /^\[video\][0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov)$/i.test(message.body);
                const mediaBubble = isImage || isVideo || isViewOnce;
                const messageReactions = reactions[message.id] || [];
                return <Fragment key={message.id}>{(!previous || dayKey(previous.created_at) !== dayKey(message.created_at)) && <div className={styles.dateSeparator}><span>{dateLabel(message.created_at)}</span></div>}{selectedChat.unread > 0 && index === Math.max(0, visibleMessages.length - selectedChat.unread) && <div className={styles.unreadDivider}><span>UNREAD MESSAGES</span></div>}<article className={`${styles.message} ${mine ? styles.mine : ''} ${grouped ? styles.messageGrouped : ''}`} onContextMenu={event => { event.preventDefault(); setMessageMenuId(message.id); }} onTouchStart={() => beginHold(message.id)} onTouchEnd={endHold} onTouchMove={endHold}>
                  {!mine ? grouped ? <span className={styles.messageAvatarSpacer}/> : <span className={styles.messageAvatar}>{message.user.avatar_url ? <img src={message.user.avatar_url} alt={`${label(message.user)}'s profile picture`}/> : initials(message.user)}</span> : null}
                  <div className={`${styles.bubble} ${mediaBubble ? styles.mediaBubble : ''}`}>
                    {!mine && selectedChat.kind === 'group' && !grouped && <strong style={{ color: senderColor(message.user_id) }}>{label(message.user)}</strong>}
                    {message.reply_to && <div className={styles.replyQuote}><strong>{label(message.reply_to.user)}</strong><span>{preview(message.reply_to.body)}</span></div>}
                    {isViewOnce ? <button type="button" className={styles.viewOnceButton} disabled={busy || sending || mine || Boolean(message.viewed) || Boolean(message.pending)} onClick={() => void openViewOnce(message.id)}><EyeOff size={17}/> {message.pending ? 'Sending…' : mine ? 'View-once photo' : message.viewed ? 'Opened' : 'Open photo'}</button> : isVoice ? message.pending ? <div className={styles.pendingMedia}><Mic size={16}/> {message.failed ? 'Voice note failed' : 'Sending voice note…'}</div> : <audio className={styles.voiceAudio} controls preload="none" src={`/api/students/voice?id=${encodeURIComponent(message.id)}`} aria-label="Voice note"/> : isVideo ? message.pending ? <div className={styles.pendingMedia}><FileVideo size={16}/> {message.failed ? 'Video failed' : 'Sending video…'}</div> : <video className={styles.chatVideo} controls preload="metadata" src={`/api/students/video?id=${encodeURIComponent(message.id)}`} aria-label="Shared video"/> : isImage ? message.pending ? <div className={styles.pendingMedia}><ImageIcon size={16}/> {message.failed ? 'Photo failed' : 'Sending photo…'}</div> : <img className={styles.chatImage} loading="lazy" src={`/api/students/image?id=${encodeURIComponent(message.id)}`} alt="Shared photo"/> : <p>{renderMessageBody(message.body)}</p>}
                    <div className={styles.messageMeta}><small>{messageTime(message.created_at)}</small>{renderStatus(message, mine)}</div>
                    {messageReactions.length > 0 && <div className={styles.reactionBar}>{messageReactions.map(emoji => <span className={styles.reactionBadge} key={emoji}>{emoji}</span>)}</div>}
                    {messageMenuId === message.id && <div className={styles.messageMenu} role="menu"><div className={styles.reactionChoices}>{reactionEmojis.map(emoji => <button type="button" key={emoji} role="menuitem" aria-label={`React ${emoji}`} onClick={() => reactTo(message.id, emoji)}>{emoji}</button>)}</div><button type="button" role="menuitem" onClick={() => beginReply(message)}><Reply size={14}/> Reply</button><button type="button" role="menuitem" onClick={() => void copyMessage(message)}><Copy size={14}/> Copy</button><button type="button" role="menuitem" onClick={() => forwardMessage(message)}><Forward size={14}/> Forward</button><button type="button" role="menuitem" onClick={() => void deleteMessage(message.id, 'me')}><Trash2 size={14}/> Delete for me</button>{mine && <button type="button" role="menuitem" onClick={() => void deleteMessage(message.id, 'everyone')}><Trash2 size={14}/> Delete for everyone</button>}</div>}
                  </div>
                </article></Fragment>;
              }) : <div className={styles.chatEmpty}>{chatSearch.trim() ? 'No messages found.' : 'Say hello and start the conversation.'}</div>}
              <div ref={bottom}/>
            </div>
            {photo ? <div className={styles.photoComposer}><Camera size={18}/><span>{photo.name}</span><button type="button" className={styles.viewOnceToggle} aria-pressed={viewOnce} onClick={() => setViewOnce(!viewOnce)}><EyeOff size={15}/> {viewOnce ? 'View once on' : 'View once off'}</button><button type="button" onClick={() => setPhoto(null)} aria-label="Discard photo"><X size={20}/></button><button type="button" className={styles.sendButton} disabled={busy || sending} onClick={() => void sendImage()} aria-label="Send photo"><Send size={20}/></button></div> : video ? <div className={styles.videoComposer}><FileVideo size={18}/><span>{video.name}</span><video className={styles.videoPreview} controls muted src={videoUrl} aria-label="Preview video"/><button type="button" onClick={() => setVideo(null)} aria-label="Discard video"><X size={20}/></button><button type="button" className={styles.sendButton} disabled={busy || sending} onClick={() => void sendVideo()} aria-label="Send video"><Send size={20}/></button></div> : recording || voice ? <div className={styles.voiceComposer}>{recording ? <><span className={styles.recordingDot}/> Recording voice note… <button type="button" className={styles.sendButton} onClick={stopRecording} aria-label="Stop recording"><Square size={18}/></button></> : <><button type="button" className={styles.emojiButton} disabled={busy || sending} onClick={() => setVoice(null)} aria-label="Discard voice note"><Trash2 size={20}/></button><audio className={styles.voicePreview} controls src={voiceUrl} aria-label="Preview voice note"/><button type="button" className={styles.sendButton} disabled={busy || sending} onClick={() => void sendVoice()} aria-label="Send voice note"><Send size={20}/></button></>}</div> : <form className={styles.composer} onSubmit={send}>
              {replyTo && <div className={styles.replyComposer}><div><strong>Replying to {label(replyTo.user)}</strong><span>{preview(replyTo.body)}</span></div><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={17}/></button></div>}
              <div className={styles.composerRow}><button type="button" className={styles.emojiButton} aria-label={emojiOpen ? 'Close emoji picker' : 'Open emoji picker'} aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={22}/></button><div className={styles.composerField}><textarea ref={input} value={body} onChange={event => onBodyChange(event.target.value, event.target.selectionStart)} onKeyDown={onBodyKeyDown} onSelect={() => { if (input.current) updateMentionState(input.current.value, input.current.selectionStart || 0); }} maxLength={1000} rows={1} aria-label="Message" placeholder="Type a message" aria-autocomplete="list" aria-controls="student-mention-list"/><button type="button" className={styles.attachButton} onClick={() => { setAttachmentOpen(!attachmentOpen); setEmojiOpen(false); }} aria-label="Attach" aria-expanded={attachmentOpen}><Plus size={21}/></button>{emojiOpen && <div className={styles.emojiPicker} aria-label="Choose an emoji">{emojis.map(emoji => <button type="button" key={emoji} onClick={() => addEmoji(emoji)} aria-label={`Add ${emoji}`}>{emoji}</button>)}</div>}{mentionQuery !== null && <div className={styles.mentionPicker} id="student-mention-list" role="listbox" aria-label="Mention a student">{mentionOptions.length ? mentionOptions.map((profile, index) => <button type="button" role="option" aria-selected={mentionIndex === index} className={`${styles.mentionOption} ${mentionIndex === index ? styles.mentionOptionActive : ''}`} key={profile.id} onMouseDown={event => event.preventDefault()} onClick={() => selectMention(profile)}><span className={styles.mentionAvatar}>{profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : initials(profile)}</span><span className={styles.mentionCopy}><strong>@{mentionHandle(profile)}</strong><small>{label(profile)}</small></span></button>) : <p className={styles.mentionEmpty}>No matching students</p>}</div>}</div><button type="button" className={styles.cameraButton} onClick={() => cameraInput.current?.click()} aria-label="Camera"><Camera size={21}/></button>{body.trim() ? <button type="submit" className={styles.sendButton} aria-label="Send message" disabled={busy || sending}><Send size={20}/></button> : <button type="button" className={styles.sendButton} disabled={busy || sending} onClick={() => void startRecording()} aria-label="Record voice note"><Mic size={20}/></button>}</div>
              {attachmentOpen && <div className={styles.attachSheet} role="dialog" aria-label="Attach menu"><div className={styles.attachSheetHandle}/><strong>Attach</strong><div className={styles.attachGrid}>{([['document', FileText, 'Document'], ['camera', Camera, 'Camera'], ['gallery', ImageIcon, 'Gallery'], ['audio', Mic, 'Audio'], ['location', MapPin, 'Location'], ['contact', Users, 'Contact'], ['poll', Plus, 'Poll']] as const).map(([kind, Icon, name]) => <button type="button" key={kind} onClick={() => chooseAttachment(kind)}><span className={styles.attachIcon}><Icon size={21}/></span><small>{name}</small></button>)}</div></div>}
              <input ref={attachmentInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={busy || sending} onChange={handleMediaFile}/><input ref={cameraInput} type="file" accept="image/*,video/*" capture="environment" disabled={busy || sending} onChange={handleMediaFile}/>
            </form>}
            <div className={styles.chatToolbar}><button type="button" onClick={() => setWallpaperOpen(!wallpaperOpen)}><ImageIcon size={15}/> Wallpaper</button><button type="button" onClick={() => void openChatInfo()}><Info size={15}/> Chat info</button><span>Messages are protected by your account session.</span></div>
          </> : <div className={styles.noChat}><MessageCircle size={46}/><h2>Student Block</h2><p>Select a conversation or start a new chat.</p></div>}
        </section>
      </section>
    </>}
  </main>;
}
