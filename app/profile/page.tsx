'use client';

import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, CalendarDays, MessageCircle, Phone, Store, UserRound } from 'lucide-react';
import styles from './profile.module.css';

type Profile = { id: string; name: string; username?: string; avatar_url?: string; phone?: string; payment_method?: string; payment_instructions?: string; created_at?: string; role: string };
async function read<T>(response: Response): Promise<T> {
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Something went wrong. Please try again.');
  return result as T;
}
export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [photoError, setPhotoError] = useState('');
  async function refresh() {
    const data = await read<{ user?: Profile | null; demo?: boolean }>(await fetch('/api/market', { cache: 'no-store' }));
    setProfile(data.user || null);
  }
  useEffect(() => { refresh().catch(error => setMessage((error as Error).message)).finally(() => setLoading(false)); }, []);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setMessage('');
    try { const form = new FormData(); form.append('file', file); await read(await fetch('/api/students/avatar', { method: 'POST', body: form })); await refresh(); setPhotoError(''); setMessage('Profile picture updated.'); }
    catch (error) { setMessage((error as Error).message); } finally { event.target.value = ''; setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage('');
    try { const username = String(form.get('username') || '').trim(); if (username !== (profile?.username || '')) await read(await fetch('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'profile', username, avatar_url: profile?.avatar_url || '' }) })); await read(await fetch('/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'profile', name: form.get('name'), phone: form.get('phone'), payment_method: form.get('payment_method'), payment_instructions: form.get('payment_instructions') }) })); await refresh(); setEditing(false); setMessage('Profile saved.'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  if (loading) return <main className={styles.page}><p>Loading your profile…</p></main>;
  if (!profile) return <main className={styles.page}><div className={styles.gate}><UserRound size={32}/><h1>Your profile</h1><p>{message || 'Sign in to see your profile.'}</p><Link href="/students">Go to sign in</Link><Link href="/">Back to marketplace</Link></div></main>;
  const joined = profile.created_at && !Number.isNaN(Date.parse(profile.created_at)) ? new Date(profile.created_at).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) : '';
  return <main className={styles.page}>
    <Link className={styles.back} href="/"><ArrowLeft size={17}/> Back to marketplace</Link>
    <section className={styles.card} aria-label="Your profile">
      <div className={styles.cover}><span>MAU CONNECT COMMUNITY</span></div>
      <div className={styles.identity}>
        <div className={styles.portrait}>{profile.avatar_url && photoError !== profile.avatar_url ? <img src={profile.avatar_url} alt={`${profile.name}'s profile picture`} onError={() => setPhotoError(profile.avatar_url || '')}/> : <span>{(profile.name || 'M').slice(0, 1).toUpperCase()}</span>}<label className={styles.camera} aria-label="Change profile picture"><Camera size={18}/><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload}/></label></div>
        <div className={styles.identityText}><h1>{profile.name}</h1><p>{profile.username ? `@${profile.username}` : 'MAU Connect member'}</p></div>
        <button type="button" className={styles.editButton} onClick={() => setEditing(!editing)} disabled={busy}>{editing ? 'Cancel' : 'Edit profile'}</button>
      </div>
      <div className={styles.profileNav}><span>About</span><Link href="/students">Student Block</Link><Link href={profile.role === 'admin' ? '/admin' : '/?dashboard=1'}>Dashboard</Link></div>
    </section>
    {message && <p className={styles.notice} role="status">{message}</p>}
    <div className={styles.columns}><section className={styles.about}><h2>About</h2><p className={styles.intro}>Your information on MAU Connect.</p><div className={styles.detail}><UserRound size={19}/><span>{profile.name}</span></div>{profile.phone && <div className={styles.detail}><Phone size={19}/><span>{profile.phone}</span></div>}{joined && <div className={styles.detail}><CalendarDays size={19}/><span>Joined {joined}</span></div>}<Link className={styles.shortcut} href="/students"><MessageCircle size={18}/> Visit Student Block</Link><Link className={styles.shortcut} href={profile.role === 'admin' ? '/admin' : '/?dashboard=1'}><Store size={18}/> Open dashboard</Link></section>
      <section className={styles.information}><h2>{editing ? 'Edit your information' : 'Profile information'}</h2>{editing ? <form className={styles.form} onSubmit={save}><label>Display name<input name="name" required maxLength={80} defaultValue={profile.name}/></label><label>Student nickname<input name="username" minLength={3} maxLength={30} defaultValue={profile.username || ''} placeholder="Choose a nickname"/></label><label>Phone / WhatsApp number<input name="phone" type="tel" maxLength={25} defaultValue={profile.phone || ''} placeholder="Add your phone number"/></label><label>Preferred payment method<input name="payment_method" maxLength={100} defaultValue={profile.payment_method || ''}/></label><label>Payment instructions<textarea name="payment_instructions" maxLength={500} defaultValue={profile.payment_instructions || ''}/></label><button className={styles.saveButton} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form> : <div className={styles.fields}><div><small>Display name</small><strong>{profile.name}</strong></div><div><small>Student username</small><strong>{profile.username || 'Not added'}</strong></div><div><small>Phone / WhatsApp</small><strong>{profile.phone || 'Not added'}</strong></div><div><small>Preferred payment</small><strong>{profile.payment_method || 'Not added'}</strong></div><p>Contact and payment details may be shared with signed-in buyers when they request them.</p></div>}</section></div>
  </main>;
}
