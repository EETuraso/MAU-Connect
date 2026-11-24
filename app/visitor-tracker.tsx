'use client';
import { useEffect, useRef } from 'react';
export default function VisitorTracker() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch('/api/metrics', { method: 'POST', keepalive: true }).catch(() => {});
  }, []);
  return null;
}
