'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, CircleHelp, Clock3, Eye, Flag, LayoutDashboard, LogOut, Package, RefreshCw, Search, Settings, ShieldCheck, Store, Trash2, Users, X } from 'lucide-react';
import { defaults, seed, type Listing } from '../data';
import { restoreDemoState } from '../demo-state';
import { demoUsers } from '../demo-users';
import styles from './admin.module.css';

type State = ReturnType<typeof restoreDemoState>;
type Seller = State['users'][number];
type Report = { id: string; listing_id: string | null; reason: string; status: string; created_at?: string | null };
type Data = Omit<State, 'reports'> & { reports: Report[]; demo: boolean; user: Seller | null };
type MarketResponse = { demo: boolean; listings?: Listing[]; settings: typeof defaults; user?: Seller | null; users?: Seller[]; audit?: State['audit']; reports?: Report[] };
type Tab = 'overview' | 'listings' | 'sellers' | 'reports' | 'settings' | 'activity';
type Confirmation = { title: string; description: string; label: string; payload: Record<string, unknown> };
type Snapshot = { seller: Omit<Seller, 'role'>; listings: Listing[]; expires_at: string };
const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'listings', label: 'Listings', icon: Package },
  { id: 'sellers', label: 'Sellers', icon: Users },
  { id: 'reports', label: 'Reports', icon: Flag },
  { id: 'settings', label: 'Site settings', icon: Settings },
  { id: 'activity', label: 'Activity log', icon: Clock3 },
] as const;
const currency = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
const actionLabels: Record<string, string> = { remove: 'Listing removed', suspend: 'Seller access updated', settings: 'Site settings updated', resolve: 'Report resolved', impersonate: 'Support snapshot opened', reports: 'Reports reviewed' };
async function response<T>(result: Response): Promise<T> {
  const body: unknown = await result.json();
  if (!result.ok) throw new Error(typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : 'Unable to complete the request.');
  return body as T;
}
async function post<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return response<T>(await fetch('/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
}
async function fetchMarket(signal?: AbortSignal): Promise<MarketResponse> {
  return response<MarketResponse>(await fetch('/api/market', { cache: 'no-store', signal }));
}
function loadDemo(): State {
  let stored: unknown;
  try { stored = JSON.parse(localStorage.getItem('mau-demo') || 'null'); } catch { /* Fall back to sample data. */ }
  return restoreDemoState(stored, { items: seed, settings: defaults, users: demoUsers, audit: [], reports: [] });
}
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog className={styles.dialog} ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.dialogHeading}><h2>{title}</h2><button type="button" aria-label="Close dialog" onClick={close}><X size={20} /></button></div>{children}
  </dialog>;
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.empty}><ShieldCheck size={28} /><h3>{title}</h3><p>{children}</p></div>;
}
function Status({ value }: { value: string }) {
  return <span className={[styles.status, value === 'active' || value === 'resolved' ? styles.positive : value === 'removed' || value === 'suspended' ? styles.negative : styles.neutral].join(' ')}>{value}</span>;
}
export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [detail, setDetail] = useState<Listing | null>(null);
  const [supportSeller, setSupportSeller] = useState<Seller | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const applyMarket = useCallback((market: MarketResponse) => {
    if (market.demo) setData({ ...loadDemo(), demo: true, user: null });
    else setData({ items: market.listings || [], settings: market.settings, users: market.users || [], audit: market.audit || [], reports: market.reports || [], demo: false, user: market.user || null });
  }, []);
  async function refresh() { applyMarket(await fetchMarket()); }
  useEffect(() => {
    const controller = new AbortController();
    fetchMarket(controller.signal).then(market => {
      if (!controller.signal.aborted) applyMarket(market);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load dashboard.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applyMarket]);
  useEffect(() => {
    if (!snapshot) return;
    const timer = setTimeout(() => { setSnapshot(null); setNotice('The support snapshot expired. Open a new one if needed.'); }, Math.max(0, new Date(snapshot.expires_at).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [snapshot]);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to complete the request.'); } finally { setBusy(false); }
  }
  function navigate(next: Tab) { setTab(next); setQuery(''); setStatus('all'); }
  async function mutate(payload: Record<string, unknown>) {
    if (!data) return;
    if (data.demo) {
      const next = { ...data, audit: [{ id: crypto.randomUUID(), action: String(payload.action), details: { ...payload, settings: undefined }, created_at: new Date().toISOString() }, ...data.audit] };
      if (payload.action === 'remove') next.items = data.items.map(item => item.id === payload.id ? { ...item, status: 'removed' } : item);
      if (payload.action === 'suspend') next.users = data.users.map(seller => seller.id === payload.id ? { ...seller, suspended: Boolean(payload.suspended) } : seller);
      if (payload.action === 'resolve') next.reports = data.reports.map(report => report.id === payload.id ? { ...report, status: 'resolved' } : report);
      if (payload.action === 'settings') next.settings = payload.settings as typeof defaults;
      try { localStorage.setItem('mau-demo', JSON.stringify({ items: next.items, settings: next.settings, users: next.users, audit: next.audit, reports: next.reports })); }
      catch { throw new Error('Browser storage is full or unavailable. Your change was not saved.'); }
      setData(next);
    } else { await post(payload); await refresh(); }
  }
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    await run(async () => { await post({ action: 'signin', email: String(fields.get('email')), password: String(fields.get('password')) }); await refresh(); });
  }
  async function signOut() { await run(async () => { if (!data?.demo) await post({ action: 'signout' }); router.push('/'); router.refresh(); }); }
  function remove(item: Listing) { setConfirmation({ title: 'Remove this listing?', description: '“' + item.title + '” will be hidden from the marketplace. The seller will not be able to restore it.', label: 'Remove listing', payload: { action: 'remove', id: item.id } }); }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    await run(async () => {
      const settings = { site_name: String(fields.get('site_name')).trim(), hero_title: String(fields.get('hero_title')).trim(), hero_subtitle: String(fields.get('hero_subtitle')).trim(), categories: [...new Set(String(fields.get('categories')).split('\n').map(value => value.trim()).filter(Boolean))], payment_mode: String(fields.get('payment_mode')), payment_instructions: String(fields.get('payment_instructions')).trim() };
      if (!settings.site_name || !settings.hero_title) throw new Error('Website name and homepage headline are required.');
      if (new Set(settings.categories.map(value => value.toLowerCase())).size !== settings.categories.length) throw new Error('Category names must be unique.');
      if (!settings.categories.length || settings.categories.length > 40 || settings.categories.some(value => value.length > 80)) throw new Error('Use 1–40 categories, each no longer than 80 characters.');
      await mutate({ action: 'settings', settings }); setSettingsRevision(value => value + 1); setNotice('Site settings saved. The marketplace will use these changes.');
    });
  }
  async function openSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')).trim();
    if (!supportSeller || !data) return;
    await run(async () => {
      if (reason.length < 5) throw new Error('Please describe the support request in at least 5 characters.');
      let result: Snapshot;
      if (data.demo) {
        result = { seller: supportSeller, listings: data.items.filter(item => item.seller_id === supportSeller.id), expires_at: new Date(Date.now() + 900000).toISOString() };
        await mutate({ action: 'impersonate', id: supportSeller.id, reason });
      } else { result = await post<Snapshot>({ action: 'impersonate', id: supportSeller.id, reason }); await refresh(); }
      setSupportSeller(null); setSnapshot(result);
    });
  }
  const message = <>{error && <div className={styles.error} role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}{notice && <div className={styles.notice} role="status"><Check size={17} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}</>;
  if (loading) return <div className={styles.gate}><ShieldCheck size={32} /><h1>Opening your workspace</h1><p>Checking your account and loading marketplace data…</p></div>;
  if (!data) return <div className={styles.gate}><h1>Dashboard unavailable</h1>{message}<button className={styles.primary} disabled={busy} onClick={() => run(refresh)}>Try again</button><Link href="/">Back to marketplace</Link></div>;
  if (!data.demo && (data.user?.role !== 'admin' || data.user.suspended)) return <div className={styles.gate}>
    <Link href="/" className={styles.back}><ArrowLeft size={16} /> Marketplace</Link><div className={styles.gateIcon}><ShieldCheck size={30} /></div><span className={styles.eyebrow}>MAU CONNECT ADMIN</span>
    <h1>{data.user ? 'Admin access required' : 'Welcome back'}</h1><p>{data.user ? 'This account does not have active administrator access. Sign in with an administrator account to continue.' : 'Sign in with your administrator account to manage the marketplace.'}</p>{message}
    {data.user ? <button className={styles.primary} disabled={busy} onClick={signOut}>Sign out</button> : <form className={styles.form} onSubmit={signIn}><label>Email address<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" minLength={8} autoComplete="current-password" required /></label><button className={styles.primary} disabled={busy}>{busy ? 'Signing in…' : 'Sign in to dashboard'}<ArrowUpRight size={16} /></button></form>}
  </div>;
  const sellers = data.users.filter(seller => seller.role === 'seller');
  const active = data.items.filter(item => item.status === 'active' && !data.users.find(seller => seller.id === item.seller_id)?.suspended);
  const openReports = data.reports.filter(report => report.status === 'open');
  const search = query.trim().toLowerCase();
  const visibleItems = data.items.filter(item => (status === 'all' || item.status === status) && [item.title, item.category, item.location].join(' ').toLowerCase().includes(search));
  const visibleSellers = sellers.filter(seller => (status === 'all' || (status === 'suspended') === seller.suspended) && [seller.name, seller.phone, seller.id].join(' ').toLowerCase().includes(search));
  const visibleReports = data.reports.filter(report => (status === 'all' || status === report.status) && [report.reason, data.items.find(item => item.id === report.listing_id)?.title || ''].join(' ').toLowerCase().includes(search));
  const visibleAudit = data.audit.filter(entry => [actionLabels[entry.action] || entry.action, entry.details.reason || '', entry.details.id || ''].join(' ').toLowerCase().includes(search));
  const breakdown = [...new Set(active.map(item => item.category))].map(category => ({ category, count: active.filter(item => item.category === category).length })).sort((a, b) => b.count - a.count);
  const names: Record<Tab, string> = { overview: 'Marketplace overview', listings: 'Manage listings', sellers: 'Your seller community', reports: 'Reports & moderation', settings: 'Site settings', activity: 'Activity log' };
  const descriptions: Record<Tab, string> = { overview: 'A clear view of your marketplace and what needs your attention.', listings: 'Review every listing and keep the marketplace a good place to trade.', sellers: 'Manage seller access and help your community with confidence.', reports: 'Review community concerns and resolve issues with care.', settings: 'Make the marketplace yours. Changes appear on the public website.', activity: 'A record of administrative changes and support access.' };
  const activity = (limit?: number) => (limit ? visibleAudit.slice(0, limit) : visibleAudit).map(entry => <div className={styles.activityRow} key={entry.id}><span className={styles.activityIcon}><ShieldCheck size={16} /></span><div><strong>{actionLabels[entry.action] || entry.action}</strong><p>{String(entry.details.reason || entry.details.id || 'Marketplace configuration')}</p><time dateTime={entry.created_at}>{date(entry.created_at)}</time></div></div>);
  return <div className={styles.shell}>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}><span>m↗</span><div>MAU Connect<small>ADMIN WORKSPACE</small></div></Link><div className={styles.sideLabel}>MANAGE MARKETPLACE</div>
      <div className={styles.navigation} role="navigation" aria-label="Administration">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? styles.selected : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19} />{label}{id === 'reports' && openReports.length > 0 && <span className={styles.count}>{openReports.length}</span>}</button>)}</div>
      <div className={styles.sideBottom}><div className={styles.help}><ShieldCheck size={22} /><strong>A marketplace built on trust.</strong><p>Every moderation action is recorded in your activity log.</p></div><Link href="/"><Store size={17} /> View marketplace<ArrowUpRight size={15} /></Link><button disabled={busy} onClick={signOut}><LogOut size={17} />{data.demo ? 'Exit demo' : 'Sign out'}</button></div>
    </aside>
    <div className={styles.workspace}>
      <div className={styles.topbar}><span>Workspace <ChevronRight size={14} /> <strong>{tabs.find(item => item.id === tab)?.label}</strong></span><div><span className={[styles.mode, data.demo ? styles.demoMode : ''].join(' ')}><i />{data.demo ? 'Demo workspace' : 'Live marketplace'}</span><span className={styles.avatar}>{(data.user?.name || 'Admin').slice(0, 1)}</span><span className={styles.account}>{data.user?.name || 'Demo admin'}<small>Administrator</small></span></div></div>
      <div className={styles.content} role="main">
        {data.demo && <div className={styles.demoBanner}><CircleHelp size={17} /><span><strong>You’re exploring the admin demo.</strong> Changes stay in this browser. Live accounts and shared data require a connected backend.</span></div>}
        <div className={styles.heading}><div><span className={styles.eyebrow}>YOUR MARKETPLACE, IN GOOD HANDS</span><h1>{names[tab]}</h1><p>{descriptions[tab]}</p></div><button className={styles.secondary} disabled={busy} onClick={() => run(async () => { await refresh(); setSettingsRevision(value => value + 1); setNotice('Dashboard refreshed.'); })}><RefreshCw size={16} className={busy ? styles.spinning : ''} />Refresh</button></div>
        {message}
        {tab === 'overview' && <>
          <div className={styles.stats}>{[
            { label: 'Active listings', value: active.length, note: 'Visible on the marketplace', icon: Package, target: 'listings' as Tab },
            { label: 'Active sellers', value: sellers.filter(seller => !seller.suspended).length, note: sellers.length + ' registered sellers', icon: Users, target: 'sellers' as Tab },
            { label: 'Open reports', value: openReports.length, note: openReports.length ? 'Ready for your review' : 'Your review queue is clear', icon: Flag, target: 'reports' as Tab },
            { label: 'Removed listings', value: data.items.filter(item => item.status === 'removed').length, note: 'Hidden by moderation', icon: ShieldCheck, target: 'listings' as Tab },
          ].map(({ label, value, note, icon: Icon, target }) => <button key={label} className={styles.stat} onClick={() => navigate(target)}><div><span>{label}</span><Icon size={19} /></div><strong>{value}</strong><small>{note}</small></button>)}</div>
          <div className={styles.overviewGrid}><section className={styles.panel}><div className={styles.panelHeading}><div><h2>Marketplace composition</h2><p>Active listings by category</p></div><Package size={20} /></div>{breakdown.length ? <div className={styles.breakdown}>{breakdown.map(({ category, count }) => <div key={category}><div><span>{category}</span><strong>{count} <small>{count === 1 ? 'listing' : 'listings'}</small></strong></div><div className={styles.track}><span style={{ width: count / active.length * 100 + '%' }} /></div></div>)}</div> : <Empty title="Room to grow">Active listings will appear here when sellers start posting.</Empty>}<div className={styles.valueSummary}><span>Total asking value<strong>{currency(active.reduce((sum, item) => sum + item.price, 0))}</strong></span><small>Listed prices, not sales revenue.</small></div></section>
            <section className={styles.panel}><div className={styles.panelHeading}><div><h2>Needs your attention</h2><p>Keep your community moving</p></div><Flag size={20} /></div>{openReports.length ? openReports.slice(0, 3).map(report => <button key={report.id} className={styles.reportPreview} onClick={() => navigate('reports')}><span className={styles.reportIcon}><Flag size={17} /></span><span><strong>{data.items.find(item => item.id === report.listing_id)?.title || 'Listing report'}</strong><small>{report.reason}</small></span><ChevronRight size={17} /></button>) : <Empty title="You’re all caught up">There are no open reports to review right now.</Empty>}<button className={styles.panelLink} onClick={() => navigate('reports')}>View all reports<ArrowUpRight size={16} /></button></section>
            <section className={styles.panel}><div className={styles.panelHeading}><div><h2>Recent listings</h2><p>The latest additions to your marketplace</p></div><button onClick={() => navigate('listings')}>View all <ArrowUpRight size={15} /></button></div>{data.items.length ? data.items.slice(0, 4).map(item => <button key={item.id} className={styles.recentItem} onClick={() => setDetail(item)}><Image unoptimized src={item.images[0]} width={48} height={48} alt="" /><span><strong>{item.title}</strong><small>{item.category}</small></span><b>{currency(item.price)}</b></button>) : <Empty title="No listings yet">New listings will appear here automatically.</Empty>}</section>
            <section className={styles.panel}><div className={styles.panelHeading}><div><h2>Recent activity</h2><p>Administrative changes and support</p></div><button onClick={() => navigate('activity')}>View all <ArrowUpRight size={15} /></button></div>{data.audit.length ? activity(4) : <Empty title="A fresh activity log">Moderation and settings changes will be recorded here.</Empty>}</section></div>
        </>}
        {['listings', 'sellers', 'reports', 'activity'].includes(tab) && <div className={styles.toolbar}><label className={styles.search}><Search size={18} /><input aria-label={'Search ' + tab} placeholder={tab === 'listings' ? 'Search title, category or location…' : 'Search ' + tab + '…'} value={query} onChange={event => setQuery(event.target.value)} /></label>{tab !== 'activity' && <select aria-label={'Filter ' + tab + ' by status'} value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{(tab === 'listings' ? ['active', 'sold', 'removed'] : tab === 'sellers' ? ['active', 'suspended'] : ['open', 'resolved']).map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select>}</div>}
        {tab === 'listings' && <section className={styles.panel}><div className={styles.panelHeading}><h2>All listings <span>{visibleItems.length}</span></h2><p>Listings publish immediately</p></div>{visibleItems.length ? <div className={styles.tableWrap}><table><thead><tr><th>Listing</th><th>Seller</th><th>Asking price</th><th>Status</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{visibleItems.map(item => <tr key={item.id}><td><button className={styles.itemCell} onClick={() => setDetail(item)}><Image unoptimized src={item.images[0]} alt="" width={46} height={46} /><span><strong>{item.title}</strong><small>{item.category} · {item.location}</small></span></button></td><td>{data.users.find(seller => seller.id === item.seller_id)?.name || 'Seller'}</td><td className={styles.price}>{currency(item.price)}</td><td><Status value={item.status} /></td><td><div className={styles.rowActions}><button aria-label={'View ' + item.title} onClick={() => setDetail(item)}><Eye size={17} /></button><button aria-label={'Remove ' + item.title} className={styles.dangerText} disabled={busy || item.status === 'removed'} onClick={() => remove(item)}><Trash2 size={17} /></button></div></td></tr>)}</tbody></table></div> : <Empty title="No matching listings">Try another search or status filter.</Empty>}</section>}
        {tab === 'sellers' && <section className={styles.panel}><div className={styles.panelHeading}><h2>Sellers <span>{visibleSellers.length}</span></h2><p>Support access is read-only and audited</p></div>{visibleSellers.length ? <div className={styles.sellerList}>{visibleSellers.map(seller => <div key={seller.id} className={styles.sellerRow}><span className={styles.sellerAvatar}>{seller.name.slice(0, 1)}</span><div className={styles.sellerInfo}><strong>{seller.name}</strong><small>{data.items.filter(item => item.seller_id === seller.id).length} listings · {seller.phone || 'No phone added'}</small></div><Status value={seller.suspended ? 'suspended' : 'active'} /><div className={styles.sellerActions}><button className={styles.secondary} disabled={busy} onClick={() => setSupportSeller(seller)}><Eye size={15} />Support view</button><button className={styles.dangerText} disabled={busy} onClick={() => setConfirmation({ title: seller.suspended ? 'Restore seller access?' : 'Suspend this seller?', description: seller.suspended ? seller.name + ' will be able to manage listings again. Their active listings will return to the marketplace.' : seller.name + ' will lose access to seller actions and their listings will be hidden until you restore access.', label: seller.suspended ? 'Restore access' : 'Suspend seller', payload: { action: 'suspend', id: seller.id, suspended: !seller.suspended } })}>{seller.suspended ? 'Restore access' : 'Suspend'}</button></div></div>)}</div> : <Empty title="No matching sellers">Try another name or status filter.</Empty>}</section>}
        {tab === 'reports' && <section className={styles.panel}><div className={styles.panelHeading}><h2>Listing reports <span>{visibleReports.length}</span></h2><p>{openReports.length} open</p></div>{visibleReports.length ? visibleReports.map(report => { const item = data.items.find(listing => listing.id === report.listing_id); return <div className={styles.reportRow} key={report.id}><span className={styles.reportIcon}><Flag size={19} /></span><div><strong>{item?.title || 'Listing no longer available'}</strong><p>{report.reason}</p><small>{report.created_at ? date(report.created_at) : 'Submitted in this demo'}</small><div className={styles.reportActions}>{item && <button onClick={() => setDetail(item)}>View listing<ArrowUpRight size={14} /></button>}{item && item.status !== 'removed' && <button className={styles.dangerText} disabled={busy} onClick={() => remove(item)}>Remove listing</button>}{report.status === 'open' && <button disabled={busy} onClick={() => setConfirmation({ title: 'Resolve this report?', description: 'Mark this report as reviewed. Resolving a report does not remove the listing.', label: 'Resolve report', payload: { action: 'resolve', id: report.id } })}><Check size={15} />Resolve report</button>}</div></div><Status value={report.status} /></div>; }) : <Empty title="No reports here">Reports matching your search and status will appear here.</Empty>}</section>}
        {tab === 'activity' && <section className={styles.panel}><div className={styles.panelHeading}><h2>Admin activity <span>{visibleAudit.length}</span></h2><p>Most recent 100 events in live mode</p></div>{visibleAudit.length ? activity() : <Empty title="No matching activity">New admin actions appear here after they are completed.</Empty>}</section>}
        {tab === 'settings' && <form key={settingsRevision} onSubmit={saveSettings} className={styles.form + ' ' + styles.settingsForm}><fieldset disabled={busy}><section className={styles.panel}><div className={styles.panelHeading}><div><h2>Marketplace identity</h2><p>Your name and the first words visitors see.</p></div><Store size={20} /></div><label>Website name<input name="site_name" required maxLength={80} defaultValue={data.settings.site_name} /></label><label>Homepage headline<textarea name="hero_title" required maxLength={200} rows={2} defaultValue={data.settings.hero_title} /></label><label>Homepage description<textarea name="hero_subtitle" maxLength={500} rows={3} defaultValue={data.settings.hero_subtitle} /></label></section><section className={styles.panel}><div className={styles.panelHeading}><div><h2>Categories</h2><p>Help buyers find what they’re looking for.</p></div><LayoutDashboard size={20} /></div><label>One category per line<textarea name="categories" required rows={8} defaultValue={data.settings.categories.join('\n')} /></label><small>Up to 40 categories. Existing listings keep their assigned category.</small></section><section className={styles.panel}><div className={styles.panelHeading}><div><h2>Payment instructions</h2><p>Choose the guidance buyers see when contacting sellers.</p></div><Settings size={20} /></div><label>Who provides payment instructions?<select name="payment_mode" defaultValue={data.settings.payment_mode}><option value="seller">Each seller</option><option value="platform">Marketplace administrator</option></select></label><label>Platform payment instructions<textarea name="payment_instructions" maxLength={2000} rows={4} defaultValue={data.settings.payment_instructions} placeholder="Agree on the item and inspect it before payment." /></label><p className={styles.formNote}>These are instructions only. MAU Connect does not process payments or provide checkout.</p></section><div className={styles.saveBar}><p>Changes apply to the public marketplace.</p><button className={styles.primary}>{busy ? 'Saving…' : 'Save changes'}<Check size={17} /></button></div></fieldset></form>}
        <div className={styles.footer}><span>MAU Connect · Admin workspace</span><Link href="/">Back to marketplace <ArrowUpRight size={14} /></Link></div>
      </div>
    </div>
    {detail && <Modal title="Listing details" close={() => setDetail(null)}><div className={styles.detailPhoto}><Image unoptimized src={detail.images[0]} alt={detail.title} width={600} height={360} /></div><div className={styles.detailHeading}><h3>{detail.title}</h3><Status value={data.items.find(item => item.id === detail.id)?.status || detail.status} /></div><strong className={styles.detailPrice}>{currency(detail.price)}</strong><p>{detail.description}</p><dl className={styles.details}><dt>Seller</dt><dd>{data.users.find(seller => seller.id === detail.seller_id)?.name || 'Seller'}</dd><dt>Category</dt><dd>{detail.category}</dd><dt>Location</dt><dd>{detail.location}</dd><dt>Condition</dt><dd>{detail.condition}</dd><dt>Listed</dt><dd>{date(detail.created_at)}</dd></dl><div className={styles.dialogActions}><button className={styles.secondary} onClick={() => setDetail(null)}>Close</button><button className={styles.dangerButton} disabled={busy || data.items.find(item => item.id === detail.id)?.status === 'removed'} onClick={() => { remove(detail); setDetail(null); }}>Remove listing</button></div></Modal>}
    {confirmation && <Modal title={confirmation.title} close={() => { if (!busy) setConfirmation(null); }}><p>{confirmation.description}</p><p className={styles.formNote}>This action will be recorded in the activity log.</p>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.dialogActions}><button className={styles.secondary} disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button><button className={confirmation.payload.action === 'resolve' || confirmation.payload.suspended === false ? styles.primary : styles.dangerButton} disabled={busy} onClick={() => run(async () => { await mutate(confirmation.payload); setConfirmation(null); setNotice('Your change has been saved.'); })}>{busy ? 'Saving…' : confirmation.label}</button></div></Modal>}
    {supportSeller && <Modal title={'Support: ' + supportSeller.name} close={() => { if (!busy) setSupportSeller(null); }}><p>Open a read-only snapshot of this seller’s profile and listings. Access lasts 15 minutes and is recorded in the activity log.</p><form className={styles.form} onSubmit={openSupport}><label>Reason for access<textarea name="reason" required minLength={5} maxLength={1000} rows={3} placeholder="Describe the seller’s support request…" /></label>{error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy}>Open support snapshot<Eye size={16} /></button></form></Modal>}
    {snapshot && <Modal title={snapshot.seller.name + ' · Support snapshot'} close={() => setSnapshot(null)}><p className={styles.formNote}>Read only · Expires {date(snapshot.expires_at)}. You are still signed in as the administrator.</p><dl className={styles.details}><dt>Phone</dt><dd>{snapshot.seller.phone || 'Not provided'}</dd><dt>Payment method</dt><dd>{snapshot.seller.payment_method}</dd><dt>Instructions</dt><dd>{snapshot.seller.payment_instructions || 'Not provided'}</dd></dl><h3>Seller listings</h3>{snapshot.listings.length ? snapshot.listings.map(item => <div key={item.id} className={styles.snapshotRow}><strong>{item.title}</strong><span>{currency(item.price)}</span><Status value={item.status} /></div>) : <p>This seller has no listings.</p>}</Modal>}
  </div>;
}
