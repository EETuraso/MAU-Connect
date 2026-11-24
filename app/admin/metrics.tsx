'use client';
import { useEffect, useState } from 'react';
import styles from './admin.module.css';
type Metrics = { visitors_today: number; visitors_by_day: { day: string; visitors: number }[]; registered_profiles: number; past_downloads: number; handout_downloads: number };
export default function Metrics() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/metrics', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Activity totals are temporarily unavailable.');
      return response.json() as Promise<Metrics>;
    }).then(setData).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Activity totals are unavailable.'); });
    return () => controller.abort();
  }, []);
  return <section className={styles.panel}><div className={styles.panelHeading}><div><h2>Website activity</h2><p>Visits are unique browsers per Lagos calendar day. Download counts measure downloads started through this website.</p></div></div>
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading activity…</p> : <>
      <div className={styles.metricsGrid}>
        <div><strong>{data.visitors_today}</strong><span>Visitors today</span></div>
        <div><strong>{data.registered_profiles}</strong><span>Registered profiles</span></div>
        <div><strong>{data.past_downloads}</strong><span>Past Q downloads</span></div>
        <div><strong>{data.handout_downloads}</strong><span>Handout downloads</span></div>
      </div>
      <p>Tracking begins when this feature is enabled. Totals do not include earlier activity.</p>
      <h3>Visitors per day</h3>
      {data.visitors_by_day.length ? <div className={styles.metricsDays}>{data.visitors_by_day.map(day => <div key={day.day}><time dateTime={day.day}>{day.day}</time><strong>{day.visitors}</strong></div>)}</div> : <p>No visits recorded yet.</p>}
    </>}
  </section>;
}
