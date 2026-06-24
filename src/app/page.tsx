'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { login, decodeJwt, getSessionFromStorage, saveSession, clearSession, JwtPayload } from '@/lib/auth';
import { DEFAULT_FACILITY, DEFAULT_TIMEZONE, COTTON_JOSE } from '@/lib/constants';
import { searchOutboundOrders, searchLoads, searchPickTasks, searchReceipts, searchInYardReceipts, searchUsers, searchPickTaskHistory, assignDnToUser, OutboundOrder, Load, PickTask, Receipt, WmsUser, InYardRow } from '@/lib/wms-api';

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

function isSelectableAssignee(user: WmsUser) {
  const label = displayUser(user);
  const username = String(user.username || user.userName || '').toLowerCase();
  return !/dashboard|test|demo|system|service|admin/i.test(label) && !/dashboard|test|demo|system|service|admin/i.test(username);
}

function Dashboard({ session, onLogout }: { session: UserSession; onLogout: () => void }) {
  const [orders, setOrders] = useState<OutboundOrder[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [tasks, setTasks] = useState<PickTask[]>([]);
  const [historyTasks, setHistoryTasks] = useState<PickTask[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [inYardReceipts, setInYardReceipts] = useState<InYardRow[]>([]);
  const [users, setUsers] = useState<WmsUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [assigneeByRow, setAssigneeByRow] = useState<Record<string, string>>({});
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [assigningRowId, setAssigningRowId] = useState<string | null>(null);
  const [section1Customer, setSection1Customer] = useState('ALL');
  const [section2Customer, setSection2Customer] = useState('ALL');
  const [section3Customer, setSection3Customer] = useState('ALL');
  const [locationByRow, setLocationByRow] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [o, l, t, h, r, iy, u] = await Promise.all([searchOutboundOrders(session.token, session.facilityId), searchLoads(session.token, session.facilityId), searchPickTasks(session.token, session.facilityId), searchPickTaskHistory(session.token, session.facilityId), searchReceipts(session.token, session.facilityId), searchInYardReceipts(session.token, session.facilityId), searchUsers(session.token, session.facilityId)]);
      setOrders(o); setLoads(l); setTasks(t); setHistoryTasks(h); setReceipts(r); setInYardReceipts(iy); setUsers(ensureJose(u)); setLastRefreshed(new Date());
    } finally { setDataLoading(false); }
  }, [session.token, session.facilityId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const validAssignees = useMemo(() => ensureJose(users), [users]);
  const cottonAssignees = useMemo(() => {
    const humans = validAssignees.filter(isSelectableAssignee);
    return humans.slice(0, 9);
  }, [validAssignees]);
  const defaultAssignee = displayUser(cottonAssignees.find((u) => u.userId === COTTON_JOSE.userId) || cottonAssignees[0] || { name: COTTON_JOSE.name, userId: COTTON_JOSE.userId });

  function historicalAssigneeForCustomer(customer: string, workType = '') {
    const allowed = new Set(cottonAssignees.map((u) => displayUser(u)));
    const counts = new Map<string, number>();
    const target = norm(customer);
    const type = norm(workType);
    for (const task of historyTasks) {
      const assignee = displayUser({ name: task.assigneeUserName, userId: task.assigneeUserId } as WmsUser);
      if (!assignee || !allowed.has(assignee) || /dashboard|test|demo|system|service|admin/i.test(assignee)) continue;
      const taskCustomers = (task.customerNames || []).map(norm);
      const customerMatch = !target || taskCustomers.some((c) => c && (c === target || c.includes(target) || target.includes(c)));
      const typeMatch = !type || norm(task.pickType || task.pickMethod).includes(type) || type.includes(norm(task.pickType || task.pickMethod));
      if (customerMatch && typeMatch) counts.set(assignee, (counts.get(assignee) || 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { assignee: best?.[0] || defaultAssignee, count: best?.[1] || 0 };
  }

  const plannedRows: SuggestionRow[] = useMemo(() => orders.filter((o) => isAssignableStatus(o.status)).map((o, index) => {
    const customer = o.customerName || o.customerId || 'Cotton customer';
    const hist = historicalAssigneeForCustomer(customer, o.orderType || '');
    return {
      id: `order-${o.id || o.orderId || o.orderNo || index}`,
      workType: 'Outbound Order', reference: o.orderNo || o.orderId || o.id || `Order ${index + 1}`,
      customer, status: o.status || 'PLANNED', orderType: o.orderType || 'RG',
      defaultAssignee: hist.assignee, historyCount: hist.count, rule: hist.count ? '30-day customer history' : 'Default Cotton assignee', created: o.createdTime || o.createdAt || '', carrier: o.referenceNo || o.poNo || '', schedule: o.expectedShipDate || '', mabd: o.appointmentTime || ''
    };
  }).slice(0, 120), [orders, defaultAssignee, historyTasks, cottonAssignees]);

  const yardRows = useMemo(() => inYardReceipts.slice(0, 50), [inYardReceipts]);
  const section1Customers = useMemo(() => customerChipData(yardRows.map((r) => r.customerName || r.customer || '')), [yardRows]);
  const filteredYardRows = useMemo(() => yardRows.filter((r) => section1Customer === 'ALL' || (r.customerName || r.customer || '') === section1Customer), [yardRows, section1Customer]);
  const section2Customers = useMemo(() => customerChipData(plannedRows.map((row) => row.customer)), [plannedRows]);
  const filteredPlannedRows = useMemo(() => plannedRows.filter((row) => section2Customer === 'ALL' || row.customer === section2Customer), [plannedRows, section2Customer]);
  const shippingRows = useMemo(() => buildShippingRows(loads, orders, defaultAssignee), [loads, orders, defaultAssignee]);
  const section3Customers = useMemo(() => customerChipData(shippingRows.map((row) => row.customer)), [shippingRows]);
  const filteredShippingRows = useMemo(() => shippingRows.filter((row) => section3Customer === 'ALL' || row.customer === section3Customer), [shippingRows, section3Customer]);
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
    <section className="stat-grid"><Stat value={filteredYardRows.length} label="In-Yard Full" /><Stat value={orders.length} label="Planned Orders" /><Stat value={older48} label="Older Than 48h" /></section>

    <main className="content-layout">
      <div className="main-col">
        <section className="dash-panel"><PanelTitle title="Section 1 — In-Yard FULL Equipment" count={`${filteredYardRows.length} rows`} /><CustomerChips customers={section1Customers} selected={section1Customer} onSelect={setSection1Customer} /><table className="dash-table"><thead><tr><th>Equipment #</th><th>RN #</th><th>Check-In (PT)</th><th>Time in Yard</th><th>Customer</th><th>Location</th><th>Assignee</th><th>Action</th></tr></thead><tbody>{filteredYardRows.length ? filteredYardRows.map((r, i) => <tr key={r.id || r.receiptId || i}><td>{r.equipmentNumber || r.containerNo || '—'}</td><td className="purple-text">{r.receiptId || '—'}</td><td>{fmtDate(r.checkIn)}</td><td>{timeInYard(r.checkIn)}</td><td>{r.customerName || r.customer || '—'}</td><td><DockSelect value={locationByRow[`yard-${r.id || r.receiptId || i}`] || r.location || r.dockName || ''} onChange={(value) => setLocationByRow((p) => ({ ...p, [`yard-${r.id || r.receiptId || i}`]: value }))} /></td><td><select className="inline-select" value={assigneeByRow[`yard-${r.id || r.receiptId || i}`] || defaultAssignee} onChange={(e) => setAssigneeByRow((p) => ({...p, [`yard-${r.id || r.receiptId || i}`]: e.target.value}))}>{cottonAssignees.map((u) => <option key={u.userId || u.username} value={displayUser(u)}>{displayUser(u)}</option>)}</select></td><td><button type="button" className="tiny-assign" disabled={assigningRowId === `yard-${r.id || r.receiptId || i}`} onClick={() => reviewAssignment({ id: `yard-${r.id || r.receiptId || i}`, workType: 'Receipt', reference: r.receiptId || r.entryTicket || `RN-${i+1}`, customer: r.customerName || r.customer || 'Cotton', status: r.status || 'IN_YARD', orderType: 'Inbound', defaultAssignee: assigneeByRow[`yard-${r.id || r.receiptId || i}`] || defaultAssignee, historyCount: 0, rule: 'In-yard receipt' })}>{assigningRowId === `yard-${r.id || r.receiptId || i}` ? 'Assigning...' : 'Assign'}</button></td></tr>) : <tr><td colSpan={8} className="empty-cell">No in-yard full equipment at this time.</td></tr>}</tbody></table></section>
        <section className="dash-panel planned-panel"><PanelTitle title="Section 2 — PLANNED Outbound Orders" count={`${filteredPlannedRows.length} of ${plannedRows.length}`} /><CustomerChips customers={section2Customers} selected={section2Customer} onSelect={setSection2Customer} showSearch /><table className="dash-table"><thead><tr><th>Order #</th><th>Customer</th><th>Assignee</th><th>Action</th><th>Created</th><th>Ship Method</th><th>Carrier</th><th>Schedule</th><th>MABD</th></tr></thead><tbody>{dataLoading ? <tr><td colSpan={9} className="empty-cell">Loading Cotton WISE data...</td></tr> : filteredPlannedRows.length ? filteredPlannedRows.map((row) => <tr key={row.id}><td className="purple-text">{row.reference}</td><td>{row.customer}</td><td><select className="inline-select" value={assigneeByRow[row.id] || row.defaultAssignee} onChange={(e) => setAssigneeByRow((p) => ({...p,[row.id]: e.target.value}))}>{cottonAssignees.map((u) => <option key={u.userId || u.username} value={displayUser(u)}>{displayUser(u)}</option>)}</select></td><td><button type="button" className="tiny-assign" disabled={assigningRowId === row.id} onClick={() => reviewAssignment(row)}>{assigningRowId === row.id ? 'Assigning...' : 'Assign'}</button></td><td>{row.created ? fmtDate(row.created) : '—'}</td><td>{row.orderType}</td><td>{row.carrier || '—'}</td><td>{row.schedule || '—'}</td><td>{row.mabd || '—'}</td></tr>) : <tr><td colSpan={9} className="empty-cell">No planned Cotton outbound orders matched this customer.</td></tr>}</tbody></table></section>
        <section className="dash-panel planned-panel"><PanelTitle title="Section 3 - Outbound Shipping" count={`${filteredShippingRows.length} rows`} /><CustomerChips customers={section3Customers} selected={section3Customer} onSelect={setSection3Customer} /><table className="dash-table"><thead><tr><th>DN / Order</th><th>Customer</th><th>DN Status</th><th>Load Status</th><th>Dock</th><th>Assignee</th><th>Action</th></tr></thead><tbody>{filteredShippingRows.length ? filteredShippingRows.map((row, i) => <tr key={row.id || i}><td className="purple-text">{row.reference}</td><td>{row.customer}</td><td><span className="status-pill success">{row.status}</span></td><td><span className="status-pill accent">{row.loadStatus}</span></td><td><DockSelect value={locationByRow[row.id] || row.dock || ''} onChange={(value) => setLocationByRow((p) => ({ ...p, [row.id]: value }))} /></td><td><select className="inline-select" value={assigneeByRow[row.id] || row.defaultAssignee} onChange={(e) => setAssigneeByRow((p) => ({...p,[row.id]: e.target.value}))}>{cottonAssignees.map((u) => <option key={u.userId || u.username} value={displayUser(u)}>{displayUser(u)}</option>)}</select></td><td><button type="button" className="tiny-assign" disabled={assigningRowId === row.id} onClick={() => reviewAssignment({ id: row.id, workType: 'Outbound Shipping', reference: row.reference, customer: row.customer, status: row.status, orderType: 'Shipping', defaultAssignee: assigneeByRow[row.id] || row.defaultAssignee, historyCount: 0, rule: 'Outbound shipping' })}>{assigningRowId === row.id ? 'Assigning...' : 'Assign'}</button></td></tr>) : <tr><td colSpan={7} className="empty-cell">No outbound shipping rows matched this customer.</td></tr>}</tbody></table></section>
      </div>
      <aside className="right-rail"><SidePanel title="Assigned Today" count="3 tasks" rows={tasks.filter((t)=>t.assigneeUserName).slice(0,3).map((t)=>[t.taskNo || t.id || 'Task', t.assigneeUserName || 'Assigned', fmtTime(t.startTime || t.createdTime || t.createdAt)])} /><SidePanel title="Cotton Assignees" count={`${cottonAssignees.length} assignees`} rows={cottonAssignees.map((u)=>[initials(displayUser(u)), displayUser(u), ''])} assignees /></aside>
    </main>{toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}</div>;
}


const DOCK_DOORS = Array.from({ length: 120 }, (_, index) => `DOCK${String(index + 1).padStart(2, '0')}`);

function DockSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = value && !DOCK_DOORS.includes(value) ? [value, ...DOCK_DOORS] : DOCK_DOORS;
  return <select value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">Select dock</option>{options.map((dock) => <option key={dock} value={dock}>{dock}</option>)}</select>;
}

function buildShippingRows(loads: Load[], orders: OutboundOrder[], defaultAssignee: string) {
  const orderByIndex = orders.length ? orders : [];
  return loads
    .filter((load) => ['NEW', 'OPEN', 'LOADING', 'LOADED'].includes(String(load.status || '').toUpperCase()))
    .map((load, index) => {
      const order = orderByIndex[index % Math.max(orderByIndex.length, 1)] || {};
      return {
        id: `ship-${load.id || load.loadId || load.loadNo || index}`,
        reference: order.orderNo || order.orderId || load.loadNo || load.loadId || `Load ${index + 1}`,
        customer: order.customerName || order.customerId || load.carrierName || load.carrierId || 'Cotton shipping',
        status: order.status || 'PICKED',
        loadStatus: load.status || 'NEW',
        dock: load.doorId || load.dockId || '—',
        et: load.loadNo || load.loadNumber || load.loadId || '—',
        defaultAssignee,
      };
    })
    .slice(0, 80);
}


function receiptNumber(row: InYardRow | Receipt) {
  if ('receiptId' in row && 'entryTicket' in row) return (row as InYardRow).receiptId || '—';
  const r = row as Receipt;
  return r.receiptNo || r.receiptNumber || r.receiptId || r.id || r.referenceNo || '—';
}
function customerNameFromReceipt(row: InYardRow | Receipt) {
  if ('customerName' in row && row.customerName) return row.customerName;
  if ('customer' in row && (row as InYardRow).customer) return (row as InYardRow).customer;
  return (row as Receipt).customerId || 'Cotton receipt';
}
function timeInYard(value?: string) {
  if (!value) return '—';
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffMs = Date.now() - t;
  if (diffMs < 0) return '—';
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function customerNameFromTask(task: PickTask) {
  return (task.customerNames || [])[0] || 'Cotton task';
}

function customerChipData(customers: string[]) {
  const counts = new Map<string, number>();
  for (const customer of customers) {
    const name = String(customer || 'Unknown').trim() || 'Unknown';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  return { total, rows };
}

function CustomerChips({ customers, selected, onSelect, showSearch = false }: { customers: { total: number; rows: [string, number][] }; selected: string; onSelect: (value: string) => void; showSearch?: boolean }) {
  return <div className="filters customer-chips"><button type="button" className={`chip ${selected === 'ALL' ? 'active' : ''}`} onClick={() => onSelect('ALL')}>All ({customers.total})</button>{customers.rows.map(([name, count]) => <button type="button" className={`chip ${selected === name ? 'active' : ''}`} key={name} onClick={() => onSelect(name)}>{name} ({count})</button>)}{showSearch && <input placeholder="Search orders..." />}</div>;
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

function norm(value?: string) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); }
