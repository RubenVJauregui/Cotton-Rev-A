'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { login, decodeJwt, getSessionFromStorage, saveSession, clearSession, JwtPayload } from '@/lib/auth';
import { DEFAULT_FACILITY, DEFAULT_TIMEZONE, COTTON_JOSE } from '@/lib/constants';
import {
  searchOutboundOrders,
  searchLoads,
  searchPickTasks,
  searchReceipts,
  searchUsers,
  OutboundOrder,
  Load,
  PickTask,
  Receipt,
  WmsUser,
} from '@/lib/wms-api';

interface UserSession {
  token: string;
  userId: string;
  username: string;
  name: string;
  tenant: string;
  facilityId: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

type SuggestionRow = {
  id: string;
  workType: 'Outbound Order' | 'Pick Task' | 'Load' | 'Receipt';
  reference: string;
  customer: string;
  status: string;
  orderType: string;
  defaultAssignee: string;
  historyCount: number;
  rule: string;
  raw: OutboundOrder | PickTask | Load | Receipt;
};

export default function Home() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const stored = getSessionFromStorage();
    if (stored) {
      const payload = decodeJwt(stored.accessToken);
      if (payload.exp && payload.exp * 1000 > Date.now()) {
        setSession(buildSession(stored.accessToken, payload));
      } else {
        clearSession();
      }
    }
    setLoading(false);
  }, []);

  function buildSession(token: string, payload: JwtPayload): UserSession {
    const data = payload.data || {};
    return {
      token,
      userId: data.user_id || '',
      username: data.username || '',
      name: data.name || '',
      tenant: data.tenant_id || data.company_code || 'LT',
      facilityId: DEFAULT_FACILITY,
    };
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const tokens = await login(form.get('username') as string, form.get('password') as string);
      saveSession(tokens);
      setSession(buildSession(tokens.accessToken, decodeJwt(tokens.accessToken)));
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoginLoading(false);
    }
  }

  if (loading) return <div className="loading-spinner">Loading...</div>;
  if (!session) return <LoginPage onSubmit={handleLogin} error={loginError} loading={loginLoading} />;
  return <Dashboard session={session} onLogout={() => { clearSession(); setSession(null); }} />;
}

function LoginPage({ onSubmit, error, loading }: { onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; error: string; loading: boolean }) {
  return (
    <div className="login-container">
      <div className="login-card">
        <p className="eyebrow">Warehouse dashboard</p>
        <h1>Cotton Dashboard</h1>
        <p>Sign in to review Cotton WISE work and assignment suggestions.</p>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" required autoComplete="username" />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          {error && <div className="error-msg">{error}</div>}
        </form>
      </div>
    </div>
  );
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
  const assignmentVerified = false;

  const fetchData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [o, l, t, r, u] = await Promise.all([
        searchOutboundOrders(session.token, session.facilityId),
        searchLoads(session.token, session.facilityId),
        searchPickTasks(session.token, session.facilityId),
        searchReceipts(session.token, session.facilityId),
        searchUsers(session.token, session.facilityId),
      ]);
      setOrders(o);
      setLoads(l);
      setTasks(t);
      setReceipts(r);
      setUsers(ensureJose(u));
    } finally {
      setDataLoading(false);
    }
  }, [session.token, session.facilityId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const validAssignees = useMemo(() => ensureJose(users), [users]);

  const suggestions = useMemo(() => {
    const jose = validAssignees.find((u) => u.userId === COTTON_JOSE.userId) || validAssignees[0];
    const defaultName = displayUser(jose);
    const rows: SuggestionRow[] = [];

    orders
      .filter((o) => isAssignableStatus(o.status))
      .forEach((o, index) => rows.push({
        id: `order-${o.id || o.orderId || o.orderNo || index}`,
        workType: 'Outbound Order',
        reference: o.orderNo || o.orderId || o.id || `Order ${index + 1}`,
        customer: o.customerName || o.customerId || 'Cotton customer',
        status: o.status || 'PLANNED',
        orderType: o.orderType || 'Outbound',
        defaultAssignee: defaultName,
        historyCount: 0,
        rule: 'Customer history',
        raw: o,
      }));

    tasks
      .filter((t) => String(t.status || '').toUpperCase() === 'NEW' && !t.assigneeUserId)
      .forEach((t, index) => rows.push({
        id: `task-${t.id || t.taskNo || index}`,
        workType: 'Pick Task',
        reference: t.taskNo || t.id || `Task ${index + 1}`,
        customer: 'Cotton task',
        status: t.status || 'NEW',
        orderType: t.pickType || t.pickMethod || 'Pick',
        defaultAssignee: defaultName,
        historyCount: 0,
        rule: 'Open task',
        raw: t,
      }));

    loads
      .filter((l) => isAssignableStatus(l.status))
      .forEach((l, index) => rows.push({
        id: `load-${l.id || l.loadId || l.loadNo || index}`,
        workType: 'Load',
        reference: l.loadNo || l.loadId || l.id || `Load ${index + 1}`,
        customer: l.carrierName || l.carrierId || 'Cotton load',
        status: l.status || 'NEW',
        orderType: 'Load',
        defaultAssignee: defaultName,
        historyCount: Number(l.orderCount || 0),
        rule: 'Open load',
        raw: l,
      }));

    receipts
      .filter((r) => isAssignableStatus(r.status))
      .forEach((r, index) => rows.push({
        id: `receipt-${r.id || r.receiptId || r.receiptNo || index}`,
        workType: 'Receipt',
        reference: r.receiptNo || r.receiptId || r.id || `Receipt ${index + 1}`,
        customer: r.customerId || 'Cotton receipt',
        status: r.status || 'OPEN',
        orderType: 'Inbound',
        defaultAssignee: defaultName,
        historyCount: 0,
        rule: 'Open receipt',
        raw: r,
      }));

    return rows.slice(0, 80);
  }, [orders, tasks, loads, receipts, validAssignees]);

  useEffect(() => {
    setAssigneeByRow((prev) => {
      const next = { ...prev };
      for (const row of suggestions) if (!next[row.id]) next[row.id] = row.defaultAssignee;
      return next;
    });
  }, [suggestions]);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  }

  function reviewAssignment(row: SuggestionRow) {
    const assignee = assigneeByRow[row.id] || row.defaultAssignee;
    const confirmed = window.confirm(`Confirm assignment?\n\nTask: ${row.reference}\nCustomer: ${row.customer}\nAssign to: ${assignee}\n\nPress OK to continue.`);
    if (!confirmed) return;
    if (!assignmentVerified) {
      showToast(`Assignment for ${row.reference} is ready for review. Write-back is pending verification.`, 'error');
      return;
    }
  }

  function autoAssignAll() {
    if (!suggestions.length) return;
    const confirmed = window.confirm(`Confirm Auto Assign All?\n\n${suggestions.length} Cotton work item(s) will be prepared for assignment review.`);
    if (!confirmed) return;
    showToast(`${suggestions.length} Cotton assignment(s) prepared for review.`, 'error');
  }

  const refreshed = new Date().toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE, month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const older48 = orders.filter((o) => olderThanHours(o.createdAt, 48) && !isDropship(o.orderType)).length;
  const ecomm = orders.filter((o) => isDropship(o.orderType)).length;

  return (
    <div className="cotton-shell">
      <div className="hero-bg" />
      <header className="cotton-header">
        <div>
          <h1>Cotton Dashboard</h1>
          <p>Refreshed {refreshed} · Cotton facility · {session.facilityId}</p>
        </div>
        <div className="header-actions">
          <button className="refresh-button" onClick={fetchData} disabled={dataLoading}>{dataLoading ? 'Refreshing...' : 'Refresh'}</button>
          <button className="btn-logout" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="cotton-main">
        <section className="auto-card">
          <div className="auto-title-row">
            <div>
              <h2>Auto Suggest</h2>
              <p>Showing all assignable Cotton RNs, loads, tasks, and planned orders. Suggestions use Cotton WISE data only.</p>
            </div>
            <button className="auto-assign-all" onClick={autoAssignAll} disabled={!suggestions.length || dataLoading}>Auto Assign All</button>
          </div>
          {!assignmentVerified && <div className="safe-banner">Assignment write-back is pending verification. The dashboard will prepare assignments for review and will not make unverified WISE changes.</div>}
          <div className="auto-table-wrap">
            <table className="auto-table">
              <thead>
                <tr>
                  <th>Work Type</th>
                  <th>Order / RN</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Order Type</th>
                  <th>Logged-in Assignee</th>
                  <th>Action</th>
                  <th>History Count</th>
                  <th>Rule</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <tr><td colSpan={9} className="table-empty">Loading Cotton WISE data...</td></tr>
                ) : suggestions.length ? suggestions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.workType}</td>
                    <td className="strong-link">{row.reference}</td>
                    <td>{row.customer}</td>
                    <td><span className={`pill ${statusClass(row.status)}`}>{row.status}</span></td>
                    <td>{row.orderType}</td>
                    <td>
                      <select className="assignee-select" value={assigneeByRow[row.id] || row.defaultAssignee} onChange={(e) => setAssigneeByRow((prev) => ({ ...prev, [row.id]: e.target.value }))}>
                        {validAssignees.map((u) => <option key={u.userId || u.username} value={displayUser(u)}>{displayUser(u)}</option>)}
                      </select>
                    </td>
                    <td><button className="row-assign" onClick={() => reviewAssignment(row)}>Assign</button></td>
                    <td className="number-cell">{row.historyCount.toLocaleString()}</td>
                    <td>{row.rule}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={9} className="table-empty">No assignable Cotton work found right now.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="metrics-strip">
          <Kpi icon="🚚" label="In-Yard Full Equipment" value={0} sub="not yet devanned" />
          <Kpi icon="👥" label="Customers" value={uniqueCustomers(orders).length} sub="Cotton facility" />
          <Kpi icon="📋" label="Planned FTL/LTL Orders" value={orders.length} sub="All customers" />
          <Kpi icon="🕘" label="Older Than 48 Hours" value={older48} sub="Pending non-Dropship" />
          <Kpi icon="🛒" label="E-Comm Orders" value={ecomm} sub="Planned Orders" />
          <Kpi icon="⚠️" label="Assignable Work" value={suggestions.length} sub="Review queue" />
        </section>

        <section className="lower-grid">
          <CompactPanel title="Outbound Orders" count={orders.length} rows={orders.slice(0, 8).map((o, i) => [o.orderNo || o.orderId || o.id || `Order ${i + 1}`, o.customerName || o.customerId || 'Cotton customer', o.status || 'Pending'])} />
          <CompactPanel title="Pick Tasks" count={tasks.length} rows={tasks.slice(0, 8).map((t, i) => [t.taskNo || t.id || `Task ${i + 1}`, t.assigneeUserName || 'Unassigned', t.status || 'Pending'])} />
          <CompactPanel title="Loads" count={loads.length} rows={loads.slice(0, 8).map((l, i) => [l.loadNo || l.loadId || `Load ${i + 1}`, l.carrierName || l.carrierId || 'Carrier pending', l.status || 'Pending'])} />
          <CompactPanel title="Inbound Receipts" count={receipts.length} rows={receipts.slice(0, 8).map((r, i) => [r.receiptNo || r.receiptId || `Receipt ${i + 1}`, r.poNo || r.referenceNo || 'Reference pending', r.status || 'Pending'])} />
        </section>
      </main>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

function ensureJose(users: WmsUser[]): WmsUser[] {
  const deduped = users.filter((u) => String(u.userId || '') !== '789' && String(u.username || '').toLowerCase() !== 'jvillasenor');
  const joseIndex = deduped.findIndex((u) => String(u.userId || '') === COTTON_JOSE.userId || String(u.username || '').toLowerCase() === COTTON_JOSE.username);
  const jose = { userId: COTTON_JOSE.userId, username: COTTON_JOSE.username, name: COTTON_JOSE.name, employeeCode: COTTON_JOSE.employeeCode, status: 'ACTIVE' };
  if (joseIndex >= 0) deduped[joseIndex] = { ...deduped[joseIndex], ...jose };
  else deduped.unshift(jose);
  return deduped;
}

function displayUser(u?: WmsUser) {
  if (!u) return COTTON_JOSE.name;
  const name = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'Assignee';
  return u.employeeCode ? `${name}` : name;
}

function isAssignableStatus(status?: string) {
  return ['NEW', 'OPEN', 'PLANNED', 'APPOINTMENT_MADE'].includes(String(status || '').toUpperCase());
}
function isDropship(type?: string) { return /DS|DROPSHIP|DROP SHIP/i.test(String(type || '')); }
function olderThanHours(value: string | undefined, hours: number) { const t = new Date(value || '').getTime(); return Number.isFinite(t) && Date.now() - t > hours * 3600000; }
function uniqueCustomers(orders: OutboundOrder[]) { return Array.from(new Set(orders.map((o) => o.customerName || o.customerId).filter(Boolean))); }

function Kpi({ icon, label, value, sub }: { icon: string; label: string; value: number; sub: string }) {
  return <article className="kpi-card"><span className="kpi-icon">{icon}</span><div><p>{label}</p><strong>{value.toLocaleString()}</strong><small>{sub}</small></div></article>;
}

function CompactPanel({ title, count, rows }: { title: string; count: number; rows: string[][] }) {
  return (
    <section className="compact-panel">
      <div className="panel-head"><h3>{title}</h3><span>{count.toLocaleString()}</span></div>
      <div className="mini-table-wrap">
        <table className="mini-table"><tbody>{rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>) : <tr><td>No current rows.</td></tr>}</tbody></table>
      </div>
    </section>
  );
}

function statusClass(status?: string): string {
  switch (status?.toUpperCase()) {
    case 'NEW': return 'status-new';
    case 'IN_PROGRESS': return 'status-progress';
    case 'LOADING': case 'LOADED': return 'status-loaded';
    case 'OPEN': case 'APPOINTMENT_MADE': return 'status-open';
    case 'PLANNED': return 'status-planned';
    default: return 'status-new';
  }
}
