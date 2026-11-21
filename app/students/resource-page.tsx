'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Download, FileText } from 'lucide-react';
import styles from './students.module.css';

type Resource = { id: string; title: string; course: string; level?: string; year?: number; description?: string; file_url: string };
export default function ResourcePage({ kind }: { kind: 'past' | 'handouts' }) {
  const [resources, setResources] = useState<Resource[]>([]); const [error, setError] = useState('');
  useEffect(() => { fetch('/api/students', { cache: 'no-store' }).then(async result => { const body: any = await result.json(); if (!result.ok) throw new Error(body.error || 'Unable to load resources.'); setResources(kind === 'past' ? body.past_questions : body.handouts); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load resources.')); }, [kind]);
  const past = kind === 'past'; const Icon = past ? FileText : BookOpen;
  return <main className={styles.page}><header className={styles.header}><Link href="/students" className={styles.back}><ArrowLeft size={16}/> Student Block</Link><div><span className={styles.eyebrow}>MAU CONNECT STUDENT COMMUNITY</span><h1>{past ? 'Past Question Papers' : 'Available Handouts'}</h1><p>{past ? 'Practice with papers uploaded by the administrator.' : 'Download course handouts uploaded by the administrator.'}</p></div></header><nav className={styles.tabs}><Link className={past ? styles.active : ''} href="/students/past-q"><FileText size={16}/> Past Q</Link><Link className={!past ? styles.active : ''} href="/students/handouts"><BookOpen size={16}/> Handouts</Link><Link href="/students">Student chat</Link></nav>{error&&<div className={styles.notice}>{error}</div>}<section className={styles.grid}>{resources.map(resource=><article className={styles.card} key={resource.id}><Icon size={23}/><strong>{resource.title}</strong><small>{resource.course}{past ? ` · ${resource.level} · ${resource.year}` : ''}</small>{!past&&resource.description&&<p>{resource.description}</p>}<a href={resource.file_url} target="_blank" rel="noreferrer" download><Download size={15}/> Download PDF</a></article>)}{!error&&!resources.length&&<div className={styles.empty}><Icon size={28}/><p>{past ? 'Past question papers will appear here when the administrator uploads them.' : 'Handouts will appear here when the administrator uploads them.'}</p></div>}</section></main>;
}
