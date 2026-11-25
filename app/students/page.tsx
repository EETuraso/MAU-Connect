'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon, MessageCircle, Mic, Send, Smile, Square, Trash2, Users, X } from 'lucide-react';
import PasswordInput from '../password-input';
import styles from './students.module.css';

type Message = { id: string; user_id: string; body: string; created_at: string; user: { username: string; avatar_url?: string } };
type Profile = { id: string; name: string; username?: string; avatar_url?: string };
type Data = { user: Profile | null; messages: Message[] };
async function read<T>(response: Response): Promise<T> {
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Unable to complete request.');
  return result as T;
}
const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const emojis = ['😀', '😂', '😊', '😍', '🥰', '😎', '🤔', '😅', '😭', '😢', '😮', '🙌', '👏', '👍', '👋', '🙏', '💪', '❤️', '🔥', '🎉', '✅', '📚', '💯', '✨'];
const wallpapers = [
  { id: 'classic', name: 'Classic', color: '#efeae2' },
  { id: 'sage', name: 'Sage', color: '#dceadf' },
  { id: 'sky', name: 'Sky', color: '#dcebf1' },
  { id: 'sand', name: 'Sand', color: '#f3e4ce' },
  { id: 'lavender', name: 'Lavender', color: '#ebe2f1' },
  { id: 'slate', name: 'Slate', color: '#cbd8d6' },
];

export default function Students() {
  const [data, setData] = useState<Data | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState('classic');
  const [wallpaperError, setWallpaperError] = useState('');
  const [members, setMembers] = useState<{ id: string; username: string; avatar_url?: string }[] | null>(null);
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  async function refresh() {
    const result = await read<Data>(await fetch('/api/students', { cache: 'no-store' }));
    if (result.user) {
      try { setWallpaper(localStorage.getItem(`student-chat-wallpaper:${result.user.id}`) || 'classic'); }
      catch { setWallpaper('classic'); }
    }
    setData(result);
  }
  async function open() { setLoading(true); setNotice(''); try { await refresh(); } catch (error) { setNotice((error as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void open(); }, []);
  useEffect(() => {
    if (!data?.user) return;
    let active = true;
    async function poll() {
      if (document.hidden) return;
      try {
        const result = await read<{ messages: Message[] }>(await fetch('/api/students?chat=1', { cache: 'no-store' }));
        if (active) setData(previous => previous?.user ? { ...previous, messages: result.messages } : previous);
      } catch { if (active) setNotice('Could not update messages. Check your connection or sign in again.'); }
    }
    const timer = window.setInterval(poll, 6000);
    return () => { active = false; window.clearInterval(timer); };
  }, [data?.user?.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [data?.messages.length]);
  useEffect(() => () => { if (recordingTimer.current) clearTimeout(recordingTimer.current); stream.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => {
    if (!voice) return;
    const url = URL.createObjectURL(voice);
    setVoiceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [voice]);
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const result = await read<{ message: string }>(await post('/api/market', { action: authMode, email: form.get('email'), password: form.get('password'), name: form.get('username') }));
      await refresh(); setNotice(result.message);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!body.trim()) return;
    setBusy(true); setNotice('');
    try {
      await read(await post('/api/students', { action: 'message', body }));
      setBody('');
      const result = await read<{ messages: Message[] }>(await fetch('/api/students?chat=1', { cache: 'no-store' }));
      setData(previous => previous ? { ...previous, messages: result.messages } : previous);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setNotice('Voice recording is not supported in this browser.'); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) { media.getTracks().forEach(track => track.stop()); setNotice('Voice recording is not supported in this browser.'); return; }
      const instance = new MediaRecorder(media, { mimeType });
      const chunks: Blob[] = [];
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => { media.getTracks().forEach(track => track.stop()); stream.current = null; setRecording(false); if (chunks.length) setVoice(new Blob(chunks, { type: mimeType })); };
      instance.onerror = () => { media.getTracks().forEach(track => track.stop()); setRecording(false); setNotice('Recording failed. Please try again.'); };
      recorder.current = instance;
      instance.start(); setRecording(true); setNotice('');
      recordingTimer.current = setTimeout(() => { if (instance.state === 'recording') instance.stop(); }, 120000);
    } catch { setNotice('Microphone access is needed to record a voice note. Check your browser permissions.'); }
  }
  function stopRecording() {
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }
  async function sendVoice() {
    if (!voice) return;
    setBusy(true); setNotice('');
    try {
      const form = new FormData(); form.append('file', voice, 'voice-note');
      await read(await fetch('/api/students/voice', { method: 'POST', body: form }));
      setVoice(null);
      const result = await read<{ messages: Message[] }>(await fetch('/api/students?chat=1', { cache: 'no-store' }));
      setData(previous => previous ? { ...previous, messages: result.messages } : previous);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function deleteMessage(id: string) {
    if (!confirm('Delete this message for everyone?')) return;
    setBusy(true); setNotice('');
    try {
      await read(await post('/api/students', { action: 'delete_message', id }));
      setData(previous => previous ? { ...previous, messages: previous.messages.filter(message => message.id !== id) } : previous);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function openMembers() {
    if (members) { setMembers(null); return; }
    try { const result = await read<{ members: { id: string; username: string; avatar_url?: string }[] }>(await fetch('/api/students?members=1', { cache: 'no-store' })); setMembers(result.members); }
    catch (error) { setNotice((error as Error).message); }
  }
  async function sendImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setBusy(true); setNotice('');
    try {
      const form = new FormData(); form.append('file', file);
      await read(await fetch('/api/students/image', { method: 'POST', body: form }));
      const result = await read<{ messages: Message[] }>(await fetch('/api/students?chat=1', { cache: 'no-store' }));
      setData(previous => previous ? { ...previous, messages: result.messages } : previous);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  function addEmoji(emoji: string) {
    const start = input.current?.selectionStart ?? body.length;
    const end = input.current?.selectionEnd ?? start;
    const next = body.slice(0, start) + emoji + body.slice(end);
    if (next.length > 1000) return;
    setBody(next);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + emoji.length, start + emoji.length); });
  }
  function chooseWallpaper(value: string) {
    setWallpaper(value);
    setWallpaperError('');
    try {
      localStorage.setItem(`student-chat-wallpaper:${data?.user?.id}`, value);
    } catch { setWallpaperError('Wallpaper applied, but this browser could not save it for your next visit.'); }
  }
  function uploadWallpaper(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
      setWallpaperError('Choose an image smaller than 20 MB.'); return;
    }
    setWallpaperError('');
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        chooseWallpaper(canvas.toDataURL('image/jpeg', 0.78));
      } catch { setWallpaperError('Could not use this photo. Try a different image.'); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => { URL.revokeObjectURL(url); setWallpaperError('This photo format is not supported by your browser. Try a JPG or PNG.'); };
    image.src = url;
  }
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.back}><ArrowLeft size={16}/> Marketplace</Link><div><span className={styles.eyebrow}>MAU CONNECT STUDENT COMMUNITY</span><h1>Student Block</h1><p>Learn together and keep in touch with your classmates.</p></div></header>
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    {loading ? <p>Opening Student Block...</p> : !data ? <button className={styles.primary} onClick={open}>Try again</button> : !data.user ?
      <section className={styles.join}><Users size={28}/><h2>Join the student community</h2><p>Sign in or create an account to chat and access study materials.</p><form onSubmit={authenticate}>
        {authMode === 'signup' && <input name="username" required minLength={3} autoComplete="name" aria-label="Name" placeholder="Your name"/>}
        <input name="email" required type="email" autoComplete="email" aria-label="Email address" placeholder="Email address"/>
        <PasswordInput name="password" required minLength={8} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} aria-label="Password" placeholder="Password (8+ characters)"/>
        <button className={styles.primary} disabled={busy}>{busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</button></form>
        <p className={styles.muted}>{authMode === 'signin' ? 'New to MAU Connect?' : 'Already registered?'} <button className={styles.authSwitch} onClick={() => { setNotice(''); setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); }}>{authMode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
        {authMode === 'signin' && <p className={styles.muted}><Link href="/reset-password">Forgot your password?</Link></p>}</section> : <>
      <nav className={styles.tabs} aria-label="Student Block"><span className={styles.active}><MessageCircle size={17}/> Student chat</span><Link href="/students/past-q">Past Q</Link><Link href="/students/handouts">Handouts</Link></nav>
      <section className={styles.chat} aria-label="Student group chat"><div className={styles.chatHeading}><button type="button" className={styles.groupIcon} onClick={openMembers} aria-label="Group info"><Users size={22}/></button><div><strong>Student group chat</strong><button type="button" className={styles.groupInfoButton} onClick={openMembers}>Group info</button></div><button type="button" className={styles.wallpaperButton} onClick={() => setWallpaperOpen(!wallpaperOpen)} aria-expanded={wallpaperOpen} aria-controls="wallpaper-picker"><ImageIcon size={18}/><span>Wallpaper</span></button></div>
        {members && <div className={styles.memberList}><div className={styles.wallpaperTitle}><strong>Group members ({members.length})</strong><button type="button" onClick={() => setMembers(null)} aria-label="Close group info"><X size={18}/></button></div>{members.map(member => <div className={styles.memberRow} key={member.id}>{member.avatar_url ? <img src={member.avatar_url} alt=""/> : <span>{member.username.slice(0, 1).toUpperCase()}</span>}<strong>{member.username}</strong>{member.id === data.user?.id && <small>You</small>}</div>)}</div>}
        {wallpaperOpen && <div id="wallpaper-picker" className={styles.wallpaperPicker} aria-label="Chat wallpaper"><div className={styles.wallpaperTitle}><div><strong>Chat wallpaper</strong><small>Only visible to you on this device</small></div><button type="button" onClick={() => setWallpaperOpen(false)} aria-label="Close wallpaper picker"><X size={18}/></button></div><div className={styles.wallpaperOptions}>{wallpapers.map(option => <button type="button" key={option.id} onClick={() => chooseWallpaper(option.id)} aria-pressed={wallpaper === option.id}><span style={{ backgroundColor: option.color }}/>{option.name}</button>)}</div><label className={styles.wallpaperUpload}><ImageIcon size={16}/> Choose a photo<input type="file" accept="image/*" onChange={uploadWallpaper}/></label><small className={styles.wallpaperHint}>Photos up to 20 MB</small>{wallpaperError && <p className={styles.wallpaperError} role="alert">{wallpaperError}</p>}</div>}
        <div className={styles.messages} aria-label="Messages" style={wallpaper.startsWith('data:image/') ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: wallpapers.find(option => option.id === wallpaper)?.color || wallpapers[0].color }}>{data.messages.length ? data.messages.map(message => { const mine = message.user_id === data.user?.id; const isVoice = /^\[voice\][0-9a-f-]{36}\/[0-9a-f-]{36}\.(webm|ogg|mp4)$/i.test(message.body); const isImage = /^\[image\][0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(message.body); return <article className={`${styles.message} ${mine ? styles.mine : ''}`} key={message.id}><div className={styles.bubble}>{!mine && <strong>{message.user?.username || 'Student'}</strong>}{isVoice ? <audio className={styles.voiceAudio} controls preload="none" src={`/api/students/voice?id=${encodeURIComponent(message.id)}`} aria-label="Voice note"/> : isImage ? <img className={styles.chatImage} loading="lazy" src={`/api/students/image?id=${encodeURIComponent(message.id)}`} alt="Shared photo"/> : <p>{message.body}</p>}<div className={styles.messageMeta}><small>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>{mine && <button type="button" disabled={busy} onClick={() => deleteMessage(message.id)} aria-label={isVoice ? 'Delete voice note' : 'Delete message'}><Trash2 size={13}/></button>}</div></div></article>; }) : <div className={styles.chatEmpty}>Start the conversation with your classmates.</div>}<div ref={bottom}/></div>
        {recording || voice ? <div className={styles.voiceComposer}>{recording ? <><span className={styles.recordingDot}/> Recording voice note… <button type="button" className={styles.sendButton} onClick={stopRecording} aria-label="Stop recording"><Square size={18}/></button></> : <><button type="button" className={styles.emojiButton} disabled={busy} onClick={() => setVoice(null)} aria-label="Discard voice note"><Trash2 size={20}/></button><audio className={styles.voicePreview} controls src={voiceUrl} aria-label="Preview voice note"/><button type="button" className={styles.sendButton} disabled={busy} onClick={sendVoice} aria-label="Send voice note"><Send size={20}/></button></>}</div> : <form className={styles.composer} onSubmit={send}><div className={styles.composerField}><label className={styles.photoButton} aria-label="Send a photo"><ImageIcon size={21}/><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={sendImage}/></label><button type="button" className={styles.emojiButton} aria-label={emojiOpen ? 'Close emoji picker' : 'Open emoji picker'} aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={23}/></button>{emojiOpen && <div className={styles.emojiPicker} aria-label="Choose an emoji">{emojis.map(emoji => <button type="button" key={emoji} onClick={() => addEmoji(emoji)} aria-label={`Add ${emoji}`}>{emoji}</button>)}</div>}<input ref={input} value={body} onChange={event => setBody(event.target.value)} maxLength={1000} aria-label="Message" placeholder="Type a message"/></div>{body.trim() ? <button className={styles.sendButton} aria-label="Send message" disabled={busy}><Send size={20}/></button> : <button type="button" className={styles.sendButton} disabled={busy} onClick={startRecording} aria-label="Record voice note"><Mic size={20}/></button>}</form>}</section>
      <div className={styles.accountActions}><Link href="/profile">My profile</Link><Link href="/?dashboard=1">Open my dashboard</Link><button disabled={busy} onClick={async () => { setBusy(true); try { await read(await post('/api/market', { action: 'signout' })); await refresh(); setNotice('Signed out.'); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); } }}>Sign out</button></div>
    </>}</main>;
}
