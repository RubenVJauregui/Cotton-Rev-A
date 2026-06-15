'use client';

import { useState, useEffect, useCallback } from 'react';
import { login, decodeJwt, getSessionFromStorage, saveSession, clearSession, AuthTokens, JwtPayload } from '@/lib/auth';
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
    const username = form.get('username') as string;
    const password = form.get('password') as string;

    try {
      const tokens = await login(username, password);
      saveSession(tokens);
      const payload = decodeJwt(tokens.accessToken);
      setSession(buildSession(tokens.accessToken, payload));
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
  }

  if (loading) {
    return <div className="loading-spinner">Loading...</div>;
  }

  if (!session) {
    return <LoginPage onSubmit={handleLogin} error={loginError} loading={loginLoading} />;
  }

  return <Dashboard session={session} onLogout={handleLogout} />;
}

function LoginPage({
  onSubmit,
  error,
  loading,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  error: string;
  loading: boolean;
}) {
  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Cotton WISE</h1>
        <p>Sign in to access warehouse operations</p>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" required autoComplete="username" />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
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
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [assignmentVerified] = useState(false);

  const fetchData = useCallback(async () => {
    setDataLoading(true);
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
    setUsers(u);
    setDataLoading(false);
  }, [session.token, session.facilityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleTask(taskId: string) {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function handleAssignReview() {
    if (!assignmentVerified) {
      showToast(
        'Assignment write-back is pending API verification. Tasks are queued for review.',
        'error'
      );
      return;
    }
  }

  const now = new Date().toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE });
  const assignableTasks = tasks.filter((t) => t.status === 'NEW' && !t.assigneeUserId);

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Cotton WISE</h1>
          <span className="facility-badge">{session.facilityId}</span>
        </div>
        <div className="topbar-right">
          <span className="user-info">{session.name || session.username} &middot; {now}</span>
          <button className="btn-logout" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="dashboard-content">
        {dataLoading ? (
          <div className="loading-spinner">Loading warehouse data...</div>
        ) : (
          <>
            <div className="metrics-row">
              <MetricCard label="Outbound Orders" value={orders.length} sub="Active orders" />
              <MetricCard label="Active Loads" value={loads.length} sub="New / Loading / Loaded" />
              <MetricCard label="Pick Tasks" value={tasks.length} sub="New & In Progress" />
              <MetricCard label="Inbound Receipts" value={receipts.length} sub="Open / In Progress" />
            </div>

            <div className="section-grid">
              <OrdersSection orders={orders} />
              <LoadsSection loads={loads} />
              <TasksSection tasks={tasks} />
              <ReceiptsSection receipts={receipts} />

              <div className="section-card assignment-section">
                <div className="section-header">
                  <h2>Auto Suggest &mdash; Task Assignment</h2>
                  <span className="badge">{assignableTasks.length} assignable</span>
                </div>
                <div className="assignment-controls">
                  <select
                    value={selectedAssignee}
                    onChange={(e) => setSelectedAssignee(e.target.value)}
                    aria-label="Select assignee"
                  >
                    <option value="">Select assignee...</option>
                    {users.map((u) => (
                      <option key={u.userId} value={u.userId || ''}>
                        {u.name || u.username} {u.employeeCode ? `(${u.employeeCode})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-assign"
                    disabled={selectedTasks.size === 0 || !selectedAssignee}
                    onClick={handleAssignReview}
                  >
                    Assign ({selectedTasks.size})
                  </button>
                </div>
                {!assignmentVerified && (
                  <div className="assignment-notice">
                    Assignment write-back is pending endpoint verification. Selected tasks will be held for review.
                  </div>
                )}
                <div className="section-body">
                  {assignableTasks.length === 0 ? (
                    <div className="empty-state">No unassigned tasks available at this time.</div>
                  ) : (
                    assignableTasks.map((task) => (
                      <div key={task.id} className="list-row list-row-selectable" onClick={() => task.id && toggleTask(task.id)}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            className="task-check"
                            checked={selectedTasks.has(task.id || '')}
                            onChange={() => task.id && toggleTask(task.id)}
                            aria-label={`Select task ${task.taskNo || task.id}`}
                          />
                          <div className="row-main">
                            <span className="row-title">{task.taskNo || task.id}</span>
                            <span className="row-sub">{task.pickType || 'Pick'} &middot; Priority {task.priority ?? '-'}</span>
                          </div>
                        </div>
                        <span className="status-badge status-new">NEW</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-sub">{sub}</div>
    </div>
  );
}

function statusClass(status?: string): string {
  switch (status?.toUpperCase()) {
    case 'NEW': return 'status-new';
    case 'IN_PROGRESS': return 'status-progress';
    case 'LOADING': case 'LOADED': return 'status-loaded';
    case 'OPEN': case 'APPOINTMENT_MADE': return 'status-open';
    default: return 'status-new';
  }
}

function OrdersSection({ orders }: { orders: OutboundOrder[] }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <h2>Outbound Orders</h2>
        <span className="badge">{orders.length}</span>
      </div>
      <div className="section-body">
        {orders.length === 0 ? (
          <div className="empty-state">No active outbound orders.</div>
        ) : (
          orders.slice(0, 15).map((o, i) => (
            <div key={o.id || i} className="list-row">
              <div className="row-main">
                <span className="row-title">{o.orderNo || o.orderId || `Order ${i + 1}`}</span>
                <span className="row-sub">{o.customerName || o.customerId || ''} {o.expectedShipDate ? `· Ship ${o.expectedShipDate}` : ''}</span>
              </div>
              <span className={`status-badge ${statusClass(o.status)}`}>{o.status || 'N/A'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LoadsSection({ loads }: { loads: Load[] }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <h2>Active Loads</h2>
        <span className="badge">{loads.length}</span>
      </div>
      <div className="section-body">
        {loads.length === 0 ? (
          <div className="empty-state">No active loads at this time.</div>
        ) : (
          loads.slice(0, 15).map((l, i) => (
            <div key={l.id || i} className="list-row">
              <div className="row-main">
                <span className="row-title">{l.loadNo || l.loadId || `Load ${i + 1}`}</span>
                <span className="row-sub">{l.carrierName || l.carrierId || ''} {l.doorId ? `· Door ${l.doorId}` : ''}</span>
              </div>
              <span className={`status-badge ${statusClass(l.status)}`}>{l.status || 'N/A'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TasksSection({ tasks }: { tasks: PickTask[] }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <h2>Pick Tasks</h2>
        <span className="badge">{tasks.length}</span>
      </div>
      <div className="section-body">
        {tasks.length === 0 ? (
          <div className="empty-state">No pick tasks in progress.</div>
        ) : (
          tasks.slice(0, 15).map((t, i) => (
            <div key={t.id || i} className="list-row">
              <div className="row-main">
                <span className="row-title">{t.taskNo || t.id || `Task ${i + 1}`}</span>
                <span className="row-sub">
                  {t.assigneeUserName || 'Unassigned'} &middot; {t.pickType || 'Pick'}
                </span>
              </div>
              <span className={`status-badge ${statusClass(t.status)}`}>{t.status || 'N/A'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReceiptsSection({ receipts }: { receipts: Receipt[] }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <h2>Inbound Receipts</h2>
        <span className="badge">{receipts.length}</span>
      </div>
      <div className="section-body">
        {receipts.length === 0 ? (
          <div className="empty-state">No active inbound receipts.</div>
        ) : (
          receipts.slice(0, 15).map((r, i) => (
            <div key={r.id || i} className="list-row">
              <div className="row-main">
                <span className="row-title">{r.receiptNo || r.receiptId || `Receipt ${i + 1}`}</span>
                <span className="row-sub">{r.poNo ? `PO: ${r.poNo}` : ''} {r.referenceNo ? `Ref: ${r.referenceNo}` : ''}</span>
              </div>
              <span className={`status-badge ${statusClass(r.status)}`}>{r.status || 'N/A'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
