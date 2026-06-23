'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { login, decodeJwt, getSessionFromStorage, saveSession, clearSession, JwtPayload } from '@/lib/auth';
import { DEFAULT_FACILITY, DEFAULT_TIMEZONE, COTTON_JOSE } from '@/lib/constants';
import { searchOutboundOrders, searchLoads, searchPickTasks, searchReceipts, searchUsers, assignDnToUser, OutboundOrder, Load, PickTask, Receipt, WmsUser } from '@/lib/wms-api';

interface UserSession { token: string; userId: string; username: string; name: string; tenant: string; facilityId: string; }
interface Toast { message: string; type: 'success' | 'error'; }
type SuggestionRow = { id: string; workType: string; reference: string; customer: string; status: string; orderType: string; defaultAssignee: string; historyCount: number; rule: string; created?: string; carrier?: string; schedule?: string; mabd?: string; };

export default function Home() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const stored = getSessionFromStorage();
    if (stored) {
      const payload = decodeJwt(stored.accessToken);
      if (payload.exp && payload.exp * 1000 > Date.now()) setSession(buildSession(stored.accessToken, payload));
      else clearSession();
    }
    setLoading(false);
  }, []);

  function buildSession(token: string, payload: JwtPayload): UserSession {
    const data = payload.data || {};
    return { token, userId: data.user_id || '', username: data.username || '', name: data.name || '', tenant: data.tenant_id || data.company_code || 'LT', facilityId: DEFAULT_FACILITY };
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoginError(''); setLoginLoading(true);
    const form = new FormData(e.currentTarget);
    try { const tokens = await login(form.get('username') as string, form.get('password') as string); saveSession(tokens); setSession(buildSession(tokens.accessToken, decodeJwt(tokens.accessToken))); }
    catch (err: unknown) { setLoginError(err instanceof Error ? err.message : 'Sign in failed.'); }
    finally { setLoginLoading(false); }
  }

  if (loading) return <div className="loading-spinner">Loading...</div>;
  if (!session) return <LoginPage onSubmit={handleLogin} error={loginError} loading={loginLoading} />;
  return <Dashboard session={session} onLogout={() => { clearSession(); setSession(null); }} />;
}

function LoginPage({ onSubmit, error, loading }: { onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; error: string; loading: boolean }) {
  return <div className="login-container"><div className="login-card"><p className="eyebrow">Warehouse dashboard</p><h1>Cotton Dashboard</h1><p>Sign in to review Cotton WISE work and assignment suggestions.</p><form onSubmit={onSubmit}><div className="form-group"><label htmlFor="username">Username</label><input id="username" name="username" type="text" required autoComplete="username" /></div><div className="form-group"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" /></div><button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>{error && <div className="error-msg">{error}</div>}</form></div></div>;
}

function Dashboard({ session, onLogout }: { session: UserSession; onLogout: () => void }) {
  const [orders, setOrders] = useState<OutboundOrder[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [tasks, setTasks] = useState<PickTask[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [users, setUsers] = useState<WmsUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [assigneeByRow, setAssigneeByRow] = useState<Record<string, string>>({});
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [assigningRowId, setAssigningRowId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [o, l, t, r, u] = await Promise.all([searchOutboundOrders(session.token, session.facilityId), searchLoads(session.token, session.facilityId), searchPickTasks(session.token, session.facilityId), searchReceipts(session.token, session.facilityId), searchUsers(session.token, session.facilityId)]);
      setOrders(o); setLoads(l); setTasks(t); setReceipts(r); setUsers(ensureJose(u)); setLastRefreshed(new Date());
    } finally { setDataLoading(false); }
  }, [session.token, session.facilityId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const validAssignees = useMemo(() => ensureJose(users), [users]);
  const cottonAssignees = useMemo(() => validAssignees.slice(0, 9), [validAssignees]);
  const defaultAssignee = displayUser(cottonAssignees.find((u) => u.userId === COTTON_JOSE.userId) || cottonAssignees[0]);

  const plannedRows: SuggestionRow[] = useMemo(() => orders.filter((o) => isAssignableStatus(o.status)).map((o, index) => ({
    id: `order-${o.id || o.orderId || o.orderNo || index}`,
    workType: 'Outbound Order', reference: o.orderNo || o.orderId || o.id || `Order ${index + 1}`,
    customer: o.customerName || o.customerId || 'Cotton customer', status: o.status || 'PLANNED', orderType: o.orderType || 'RG',
    defaultAssignee, historyCount: 0, rule: 'Customer history', created: o.createdTime || o.createdAt || '', carrier: o.referenceNo || o.poNo || '', schedule: o.expectedShipDate || '', mabd: o.appointmentTime || ''
  })).slice(0, 120), [orders, defaultAssignee]);

  const yardRows = useMemo(() => tasks.filter((t) => String(t.status || '').toUpperCase() === 'NEW' || String(t.status || '').toUpperCase() === 'IN_PROGRESS').slice(0, 3), [tasks]);
  const suggestionsCount = plannedRows.length + tasks.filter((t) => String(t.status || '').toUpperCase() === 'NEW' && !t.assigneeUserId).length + loads.filter((l) => isAssignableStatus(l.status)).length + receipts.filter((r) => isAssignableStatus(r.status)).length;

  useEffect(() => { setAssigneeByRow((prev) => { const next = { ...prev }; for (const row of plannedRows) if (!next[row.id]) next[row.id] = row.defaultAssignee; return next; }); }, [plannedRows]);

  function showToast(message: string, type: 'success' | 'error' = 'success') { setToast({ message, type }); setTimeout(() => setToast(null), 4500); }
  function userIdForDisplay(value: string) {
    const user = cottonAssignees.find((u) => displayUser(u) === value || String(u.userId || u.id || '') === value);
    return String(user?.userId || user?.id || (value === COTTON_JOSE.name ? COTTON_JOSE.userId : ''));
  }

  async function reviewAssignment(row: SuggestionRow) {
    const assignee = assigneeByRow[row.id] || row.defaultAssignee;
    const assigneeUserId = userIdForDisplay(assignee);
    if (!assigneeUserId) { showToast('Select a valid Cotton assignee before assigning.', 'error'); return; }
    if (!window.confirm(`Confirm assignment?

DN: ${row.reference}
Customer: ${row.customer}
Assign to: ${assignee}

If no pick task exists, WISE will create the pick task first, then assign it.`)) return;
    setAssigningRowId(row.id);
    const result = await assignDnToUser(session.token, row.reference, assigneeUserId, session.facilityId);
    showToast(result.message, result.success ? 'success' : 'error');
    setAssigningRowId(null);
    if (result.success) await fetchData();
  }

  async function autoAssignAll() {
    if (!plannedRows.length) return;
    if (!window.confirm(`Confirm Auto Assign All?

${plannedRows.length} Cotton order(s) will be assigned. If a DN has no pick task, WISE will create one first, then assign it.`)) return;
    let success = 0;
    for (const row of plannedRows) {
      const assignee = assigneeByRow[row.id] || row.defaultAssignee;
      const assigneeUserId = userIdForDisplay(assignee);
      if (!assigneeUserId) continue;
      setAssigningRowId(row.id);
      const result = await assignDnToUser(session.token, row.reference, assigneeUserId, session.facilityId);
      if (result.success) success += 1;
    }
    setAssigningRowId(null);
    showToast(`${success} Cotton assignment(s) submitted.`, success ? 'success' : 'error');
    await fetchData();
  }

  const refreshed = lastRefreshed.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE, month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const older48 = orders.filter((o) => olderThanHours(o.createdAt || o.createdTime, 48) && !isDropship(o.orderType)).length;
  const ecomm = orders.filter((o) => isDropship(o.orderType)).length;

  return <div className="bay-dashboard"><div className="storm-bg" />
    <div className="top-actions"><div><button type="button" onClick={() => showToast('Auto Suggest is already showing Cotton work available for assignment.', 'success')}>Auto Suggest</button><button type="button" onClick={autoAssignAll}>Auto Assign All</button><button type="button" onClick={autoAssignAll}>Autonomous</button></div><div><button onClick={fetchData}>Refresh</button><button>Download CSV</button><button onClick={onLogout}>Sign out</button></div></div>
    <header className="page-title"><h1>Cotton Dashboard</h1><p>Cotton ({session.facilityId})</p><span>Last refreshed {refreshed}</span></header>
    <div className="hintbar">• Fresh WISE data every 5 minutes &nbsp;&nbsp; • Auto Suggest holds Cotton RNs and orders until Auto Assign is confirmed &nbsp;&nbsp; • Auto Assign assigns new tasks only after confirmation</div>
    <section className="stat-grid"><Stat value={0} label="In-Yard Full" /><Stat value={orders.length} label="Planned Orders" /><Stat value={older48} label="Older Than 48h" /></section>

    <main className="content-layout">
      <div className="main-col">
        <section className="dash-panel"><PanelTitle title="Section 1 — In-Yard FULL Equipment" count={`${yardRows.length} rows`} /><table className="dash-table"><thead><tr><th>Equipment #</th><th>RN #</th><th>Check-In (PT)</th><th>Time in Yard</th><th>Customer</th><th>Location</th><th>Assignee</th><th>Action</th></tr></thead><tbody>{yardRows.length ? yardRows.map((t, i) => <tr key={t.id || i}><td>{t.taskNo || t.id || `TASK-${i+1}`}</td><td>{receiptRef(t)}</td><td>{fmtDate(t.createdTime || t.createdAt)}</td><td>Pending</td><td>{(t.customerNames || [])[0] || 'Cotton task'}</td><td><select><option>DOCK{String(51+i).padStart(2,'0')}</option></select></td><td><select className="inline-select" value={assigneeByRow[`yard-${t.id || i}`] || t.assigneeUserName || defaultAssignee} onChange={(e) => setAssigneeByRow((p) => ({...p, [`yard-${t.id || i}`]: e.target.value}))}>{cottonAssignees.map((u) => <option key={u.userId || u.username} value={displayUser(u)}>{displayUser(u)}</option>)}</select></td><td><button type="button" className="tiny-assign" disabled={assigningRowId === `yard-${t.id || i}`} onClick={() => reviewAssignment({ id: `yard-${t.id || i}`, workType: 'Pick Task', reference: (t.orderIds || [])[0] || t.taskNo || t.id || `TASK-${i+1}`, customer: (t.customerNames || [])[0] || 'Cotton task', status: t.status || 'NEW', orderType: t.pickType || 'Pick', defaultAssignee: assigneeByRow[`yard-${t.id || i}`] || t.assigneeUserName || defaultAssignee, historyCount: 0, rule: 'Open task' })}>{assigningRowId === `yard-${t.id || i}` ? 'Assigning...' : 'Assign'}</button></td></tr>) : <tr><td colSpan={8} className="empty-cell">No in-yard full equipment rows returned.</td></tr>}</tbody></table></section>
        <section className="dash-panel planned-panel"><PanelTitle title="Section 2 — PLANNED Outbound Orders" count={`${plannedRows.length} of ${orders.length}`} /><div className="filters"><button className="chip active">All</button>{uniqueCustomers(orders).slice(0,5).map((c) => <button className="chip" key={c}>{c}</button>)}<input placeholder="Search orders..." /></div><table className="dash-table"><thead><tr><th>Order #</th><th>Customer</th><th>Assignee</th><th>Action</th><th>PO #</th><th>Created</th><th>Ship Method</th><th>Carrier</th><th>Schedule</th><th>MABD</th></tr></thead><tbody>{dataLoading ? <tr><td colSpan={10} className="empty-cell">Loading Cotton WISE data...</td></tr> : plannedRows.length ? plannedRows.map((row) => <tr key={row.id}><td className="purple-text">{row.reference}</td><td>{row.customer}</td><td><select className="inline-select" value={assigneeByRow[row.id] || row.defaultAssignee} onChange={(e) => setAssigneeByRow((p) => ({...p,[row.id]: e.target.value}))}>{cottonAssignees.map((u) => <option key={u.userId || u.username} value={displayUser(u)}>{displayUser(u)}</option>)}</select></td><td><button type="button" className="tiny-assign" disabled={assigningRowId === row.id} onClick={() => reviewAssignment(row)}>{assigningRowId === row.id ? 'Assigning...' : 'Assign'}</button></td><td>{row.created ? fmtDate(row.created) : '—'}</td><td>{row.created ? fmtDate(row.created) : '—'}</td><td>{row.orderType}</td><td>{row.carrier || '—'}</td><td>{row.schedule || '—'}</td><td>{row.mabd || '—'}</td></tr>) : <tr><td colSpan={10} className="empty-cell">No planned Cotton outbound orders found.</td></tr>}</tbody></table></section>
      </div>
      <aside className="right-rail"><SidePanel title="Assigned Today" count="3 tasks" rows={tasks.filter((t)=>t.assigneeUserName).slice(0,3).map((t)=>[t.taskNo || t.id || 'Task', t.assigneeUserName || 'Assigned', fmtTime(t.startTime || t.createdTime || t.createdAt)])} /><SidePanel title="Cotton Assignees" count={`${cottonAssignees.length} assignees`} rows={cottonAssignees.map((u)=>[initials(displayUser(u)), displayUser(u), ''])} assignees /></aside>
    </main>{toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}</div>;
}


function receiptRef(task: PickTask) {
  const anyTask = task as PickTask & {
    rn?: string;
    rnNo?: string;
    receiptNo?: string;
    receiptId?: string;
    receiptIds?: string[];
    receiptNumbers?: string[];
    referenceNo?: string;
    inboundReceiptNo?: string;
  };
  const candidates = [
    anyTask.rnNo,
    anyTask.rn,
    anyTask.receiptNo,
    anyTask.receiptId,
    anyTask.inboundReceiptNo,
    anyTask.referenceNo,
    ...(anyTask.receiptNumbers || []),
    ...(anyTask.receiptIds || []),
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return candidates.find((value) => !/^DN-/i.test(value)) || '—';
}

function Stat({ value, label }: { value: number; label: string }) { return <article className="stat-card"><strong>{value.toLocaleString()}</strong><span>{label}</span></article>; }
function PanelTitle({ title, count }: { title: string; count: string }) { return <div className="panel-title"><h2>{title}</h2><span>{count}</span></div>; }
function SidePanel({ title, count, rows, assignees }: { title: string; count: string; rows: string[][]; assignees?: boolean }) { return <section className="side-panel"><PanelTitle title={title} count={count} /><div className={assignees ? 'assignee-list' : 'side-list'}>{rows.length ? rows.map((r,i)=><div className="side-row" key={i}>{assignees ? <><span className="avatar">{r[0]}</span><strong>{r[1]}</strong></> : <><strong>{r[0]}</strong><span>{r[1]}</span><em>{r[2]}</em></>}</div>) : <div className="empty-cell">No rows.</div>}</div></section>; }
function ensureJose(users: WmsUser[]): WmsUser[] { const deduped = users.filter((u) => String(u.userId || u.id || '') !== '789' && String(u.username || u.userName || '').toLowerCase() !== 'jvillasenor'); const joseIndex = deduped.findIndex((u) => String(u.userId || u.id || '') === COTTON_JOSE.userId || String(u.username || u.userName || '').toLowerCase() === COTTON_JOSE.username); const jose = { userId: COTTON_JOSE.userId, id: COTTON_JOSE.userId, username: COTTON_JOSE.username, userName: COTTON_JOSE.username, name: COTTON_JOSE.name, employeeCode: COTTON_JOSE.employeeCode, status: 'ACTIVE' }; if (joseIndex >= 0) deduped[joseIndex] = { ...deduped[joseIndex], ...jose }; else deduped.unshift(jose); return deduped; }
function displayUser(u?: WmsUser) { if (!u) return COTTON_JOSE.name; return u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || u.userName || 'Assignee'; }
function isAssignableStatus(status?: string) { return ['NEW', 'OPEN', 'PLANNED', 'APPOINTMENT_MADE', 'IMPORTED'].includes(String(status || '').toUpperCase()); }
function isDropship(type?: string) { return /DS|DROPSHIP|DROP SHIP/i.test(String(type || '')); }
function olderThanHours(value: string | undefined, hours: number) { const t = new Date(value || '').getTime(); return Number.isFinite(t) && Date.now() - t > hours * 3600000; }
function uniqueCustomers(orders: OutboundOrder[]) { return Array.from(new Set(orders.map((o) => o.customerName || o.customerId).filter(Boolean) as string[])); }
function fmtDate(v?: string) { if (!v) return '—'; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE, month: '2-digit', day: '2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : v; }
function fmtTime(v?: string) { if (!v) return '—'; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-US', { timeZone: DEFAULT_TIMEZONE, hour:'2-digit', minute:'2-digit' }) : v; }
function initials(v: string) { return v.split(/\s+/).filter(Boolean).slice(0,2).map((p)=>p[0]).join('').toUpperCase(); }
