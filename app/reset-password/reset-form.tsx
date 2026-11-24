'use client';
import PasswordInput from '../password-input';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

export default function ResetForm() {
  const [email, setEmail] = useState(''), [token, setToken] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get('type') === 'recovery' && hash.get('access_token')) setToken(hash.get('access_token')!);
    else if (hash.get('error')) setError(hash.get('error_description') || 'This recovery link is invalid or expired.');
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (token && password !== confirm) throw new Error('Passwords do not match.');
      const result = await fetch(token ? '/api/auth/update-password' : '/api/auth/reset-password', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(token ? {accessToken: token, password} : {email})
      });
      const body = await result.json() as { error?: string; message?: string };
      if (!result.ok) throw new Error(body.error || 'Unable to complete the request.');
      if (token) { setToken(''); setPassword(''); setConfirm(''); setMessage('Password updated. You can now sign in.'); }
      else setMessage(body.message || 'If an account exists for that email, a password reset link is on its way.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to complete the request.'); }
    finally { setBusy(false); }
  }
  const input = {display:'block',width:'100%',marginTop:6,padding:11,border:'1px solid #dce5d8',borderRadius:7};
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f9faf7',color:'#263b31',fontFamily:'Arial,sans-serif'}}>
    <section style={{maxWidth:460,width:'100%',padding:32,background:'#fff',border:'1px solid #e1e9dd',borderRadius:12}}>
      <p style={{color:'#547b52',fontSize:11,fontWeight:700,letterSpacing:1.5}}>MAU CONNECT ADMIN</p>
      <h1>{token ? 'Choose a new password' : 'Password reset'}</h1>
      <p>{token ? 'Enter and confirm your new password.' : 'Enter your account email and we’ll send a secure password reset link.'}</p>
      {error && <p role="alert" style={{color:'#a53e3e'}}>{error}</p>}{message && <p role="status" style={{color:'#216547'}}>{message}</p>}
      <form onSubmit={submit} style={{display:'grid',gap:12}}>
        {token ? <><label>New password<PasswordInput value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={8} required autoComplete="new-password" style={input}/></label><label>Confirm password<PasswordInput value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" minLength={8} required autoComplete="new-password" style={input}/></label></> : <label>Email address<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required autoComplete="email" style={input}/></label>}
        <button disabled={busy} style={{padding:12,border:0,borderRadius:7,background:'#216547',color:'#fff',fontWeight:700}}>{busy ? 'Please wait…' : token ? 'Update password' : 'Send reset email'}</button>
      </form><p><Link href="/admin" style={{color:'#216547',fontWeight:700}}>Back to admin sign in</Link></p>
    </section>
  </main>;
}
