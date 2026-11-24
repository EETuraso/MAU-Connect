'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ImagePlus, MessageCircle, Send, Users } from 'lucide-react';
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

export default function Students() {
  const [data, setData] = useState<Data | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  async function refresh() {
    const result = await read<Data>(await fetch('/api/students', { cache: 'no-store' }));
    setData(result);
    if (result.user) { setUsername(result.user.username || result.user.name || ''); setAvatar(result.user.avatar_url || ''); }
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
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await read(await post('/api/students', { action: 'profile', username, avatar_url: avatar })); await refresh(); setNotice('Student profile saved.'); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function chooseAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { const form = new FormData(); form.append('file', file); const result = await read<{ url: string }>(await fetch('/api/students/avatar', { method: 'POST', body: form })); setAvatar(result.url); setNotice('Picture uploaded. Save your profile to finish.'); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
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
      <section className={styles.chat} aria-label="Student group chat"><div className={styles.chatHeading}><strong>Student group chat</strong><small>Messages are visible to signed-in members</small></div>
        <div className={styles.messages}>{data.messages.length ? data.messages.map(message => <article className={`${styles.message} ${message.user_id === data.user?.id ? styles.mine : ''}`} key={message.id}><div><strong>{message.user_id === data.user?.id ? 'You' : message.user?.username || 'Student'}</strong><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString()}</small></div></article>) : <div className={styles.empty}><p>Start the conversation with your classmates.</p></div>}<div ref={bottom}/></div>
        <form className={styles.composer} onSubmit={send}><input value={body} onChange={event => setBody(event.target.value)} maxLength={1000} aria-label="Message" placeholder="Type a message…"/><button className={styles.primary} disabled={busy || !body.trim()}><Send size={17}/> Send</button></form></section>
      <div className={styles.accountActions}><Link href="/?dashboard=1">Open my dashboard</Link><button disabled={busy} onClick={async () => { setBusy(true); try { await read(await post('/api/market', { action: 'signout' })); await refresh(); setNotice('Signed out.'); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); } }}>Sign out</button></div>
      <form className={styles.profile} onSubmit={saveProfile}><div><span className={styles.avatar}>{(username || 'S').slice(0, 1).toUpperCase()}</span><div><strong>Your student profile</strong><small>Choose how classmates see you.</small></div></div><input aria-label="Student username" value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={30} required/><label className={styles.upload}><ImagePlus size={16}/> Upload picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar}/></label><button className={styles.secondary} disabled={busy}>Save profile</button></form>
    </>}</main>;
}
