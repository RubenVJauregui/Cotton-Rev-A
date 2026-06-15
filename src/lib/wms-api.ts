import { WMS_API_BASE_URL, DEFAULT_FACILITY, DEFAULT_TENANT, DEFAULT_TIMEZONE, COTTON_JOSE, JOSE_DUPLICATE } from './constants';

interface FetchOptions {
  method?: string;
  body?: unknown;
  token: string;
  facilityId?: string;
}

async function wmsRequest<T>(path: string, opts: FetchOptions): Promise<T> {
  const { method = 'POST', body, token, facilityId = DEFAULT_FACILITY } = opts;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-tenant-id': DEFAULT_TENANT,
    'x-facility-id': facilityId,
    'item-time-zone': DEFAULT_TIMEZONE,
  };

  const res = await fetch('/api/wms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      body,
      token,
      facilityId,
      tenantId: DEFAULT_TENANT,
      timezone: DEFAULT_TIMEZONE,
    }),
  });

  if (!res.ok) throw new Error('Warehouse data is unavailable.');
  const json = await res.json();
  if (json && json.code !== undefined && String(json.code) !== '0') {
    throw new Error(json.message || json.msg || 'Warehouse data is unavailable.');
  }
  return json;
}

interface PageResult<T> {
  code?: number;
  data?: {
    records?: T[];
    list?: T[];
    total?: number;
    currentPage?: number;
    pageNo?: number;
    pageSize?: number;
  } | T[];
}

function rowsFrom<T>(res: PageResult<T>): T[] {
  if (Array.isArray(res.data)) return res.data;
  return res.data?.records || res.data?.list || [];
}

export interface OutboundOrder {
  id?: string;
  orderId?: string;
  orderNo?: string;
  orderNumber?: string;
  status?: string;
  customerId?: string;
  customerName?: string;
  customer?: { name?: string; id?: string };
  shipToName?: string;
  orderType?: string;
  priority?: number;
  createdAt?: string;
  createdTime?: string;
  expectedShipDate?: string;
  appointmentTime?: string;
  referenceNo?: string;
  poNo?: string;
}

export interface Load {
  id?: string;
  loadId?: string;
  loadNo?: string;
  loadNumber?: string;
  status?: string;
  carrierId?: string;
  carrierName?: string;
  appointmentTime?: string;
  shipDate?: string;
  doorId?: string;
  dockId?: string;
  orderCount?: number;
}

export interface LoadTask {
  id?: string;
  taskId?: string;
  taskNo?: string;
  status?: string;
  assigneeUserId?: string;
  assigneeUserName?: string;
  loadId?: string;
  loadNo?: string;
}

export interface PickTask {
  id?: string;
  taskId?: string;
  taskNo?: string;
  originalTaskId?: string;
  status?: string;
  pickType?: string;
  pickMethod?: string;
  assigneeUserId?: string;
  assigneeUserName?: string;
  priority?: number;
  orderPlanId?: string;
  orderIds?: string[];
  customerNames?: string[];
  createdAt?: string;
  createdTime?: string;
  startTime?: string;
  endTime?: string;
}

export interface Receipt {
  id?: string;
  receiptId?: string;
  receiptNo?: string;
  receiptNumber?: string;
  status?: string;
  customerId?: string;
  customerName?: string;
  poNo?: string;
  referenceNo?: string;
  entryId?: string;
  createdAt?: string;
  createdTime?: string;
}

export interface WmsUser {
  userId?: string;
  id?: string;
  username?: string;
  userName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  status?: string;
  defaultFacilityId?: string;
}

function normalizeCode(value?: string) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function isJoseDuplicate(user: WmsUser): boolean {
  const uname = (user.username || user.userName || '').toLowerCase();
  const uid = String(user.userId || user.id || '');
  return uname === JOSE_DUPLICATE.username.toLowerCase() || uid === JOSE_DUPLICATE.userId;
}

function normalizeJose(user: WmsUser): WmsUser {
  const uname = (user.username || user.userName || '').toLowerCase();
  const uid = String(user.userId || user.id || '');
  const fullName = normalizeCode(user.name || `${user.firstName || ''} ${user.lastName || ''}`);
  if (uname === COTTON_JOSE.username || uid === COTTON_JOSE.userId || fullName === 'JOSE VILLASENOR') {
    return { ...user, userId: COTTON_JOSE.userId, id: COTTON_JOSE.userId, username: COTTON_JOSE.username, userName: COTTON_JOSE.username, name: COTTON_JOSE.name, employeeCode: COTTON_JOSE.employeeCode, status: 'ACTIVE' };
  }
  return user;
}

export function filterAndNormalizeUsers(users: WmsUser[]): WmsUser[] {
  const normalized = users.filter((u) => !isJoseDuplicate(u)).map(normalizeJose);
  if (!normalized.some((u) => String(u.userId || u.id) === COTTON_JOSE.userId || (u.username || u.userName) === COTTON_JOSE.username)) {
    normalized.unshift({ userId: COTTON_JOSE.userId, id: COTTON_JOSE.userId, username: COTTON_JOSE.username, userName: COTTON_JOSE.username, name: COTTON_JOSE.name, employeeCode: COTTON_JOSE.employeeCode, status: 'ACTIVE' });
  }
  return normalized;
}

export async function searchOutboundOrders(token: string, facilityId?: string): Promise<OutboundOrder[]> {
  try {
    const res = await wmsRequest<PageResult<OutboundOrder>>('/wms-bam/outbound/order/search-by-paging', {
      token,
      facilityId,
      body: { pageNo: 1, currentPage: 1, pageSize: 100, sortingFields: [{ field: 'createdTime', orderBy: 'DESC' }] },
    });
    return rowsFrom(res);
  } catch { return []; }
}

export async function searchLoads(token: string, facilityId?: string): Promise<Load[]> {
  try {
    const res = await wmsRequest<PageResult<Load>>('/wms-bam/outbound/load/search-by-paging', {
      token,
      facilityId,
      body: { pageNo: 1, currentPage: 1, pageSize: 100 },
    });
    return rowsFrom(res);
  } catch { return []; }
}

export async function searchLoadTasks(token: string, facilityId?: string): Promise<LoadTask[]> {
  try {
    const res = await wmsRequest<PageResult<LoadTask>>('/wms-bam/outbound/load-task/search-by-paging', {
      token,
      facilityId,
      body: { pageNo: 1, currentPage: 1, pageSize: 100 },
    });
    return rowsFrom(res);
  } catch { return []; }
}

export async function searchPickTasks(token: string, facilityId?: string, statuses?: string[]): Promise<PickTask[]> {
  try {
    const res = await wmsRequest<PageResult<PickTask>>('/wms-bam/outbound/pick-task/search-by-paging', {
      token,
      facilityId,
      body: { pageNo: 1, currentPage: 1, pageSize: 100, statuses: statuses || ['NEW', 'IN_PROGRESS'] },
    });
    return rowsFrom(res);
  } catch { return []; }
}

export async function searchReceipts(token: string, facilityId?: string): Promise<Receipt[]> {
  try {
    const res = await wmsRequest<PageResult<Receipt>>('/wms-bam/inbound/receipt/search-by-paging', {
      token,
      facilityId,
      body: { pageNo: 1, currentPage: 1, pageSize: 100 },
    });
    return rowsFrom(res);
  } catch { return []; }
}

export async function searchUsers(token: string, facilityId?: string): Promise<WmsUser[]> {
  try {
    const res = await wmsRequest<PageResult<WmsUser>>('/wms-bam/user/facility/search-by-paging', {
      token,
      facilityId,
      body: { pageNo: 1, currentPage: 1, pageSize: 300, facilityId: facilityId || DEFAULT_FACILITY, facilityIds: [facilityId || DEFAULT_FACILITY] },
    });
    return filterAndNormalizeUsers(rowsFrom(res));
  } catch { return filterAndNormalizeUsers([]); }
}

export interface AssignmentPayload {
  taskIds: string[];
  assigneeUserId: string;
  includesTaskSteps: boolean;
  lastAssignedWhen: string;
}

export async function assignPickTasks(token: string, payload: AssignmentPayload, facilityId?: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await wmsRequest<{ code?: number; message?: string }>('/wms/outbound/pick-task/batch-assignment', { token, facilityId, body: payload });
    if (res.code === 0 || res.code === 200) return { success: true, message: 'Assignment completed successfully.' };
    return { success: false, message: res.message || 'Assignment failed.' };
  } catch { return { success: false, message: 'Unable to complete assignment. Please try again.' }; }
}