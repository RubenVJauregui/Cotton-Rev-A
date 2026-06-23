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
      method,
      body,
      token,
      facilityId,
      tenantId: DEFAULT_TENANT,
      timezone: DEFAULT_TIMEZONE,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Warehouse data is unavailable.');
  }
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

export interface OrderPlan {
  id?: string;
  orderPlanId?: string;
  planId?: string;
  status?: string;
  orderIds?: string[];
  orderId?: string;
  orderNo?: string;
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
  entry?: string;
  createdAt?: string;
  createdTime?: string;
  containerNo?: string;
  trailerNo?: string;
  equipmentNo?: string;
  inYardTime?: string;
  devannedTime?: string;
  devanTime?: string;
  devannedWhen?: string;
  isDevanned?: boolean;
  dockId?: string;
  dockName?: string;
}

export interface EntryTicket {
  id?: string;
  entryTicketId?: string;
  status?: string;
  receipts?: Array<{ id?: string; status?: string; containerNo?: string; equipmentNo?: string; customerName?: string }>;
  entryTicketCheck?: { containerNOs?: string[]; trailers?: string[] };
  checkInStartTime?: string;
  checkInEndTime?: string;
  createdWhen?: string;
  dockId?: string;
  dockName?: string;
}

export interface EntryTicketDetail {
  id?: string;
  equipmentActions?: Array<{
    equipmentNo?: string;
    containerNo?: string;
    trailerNo?: string;
    receiptIds?: string[];
    currentLocationId?: string;
    currentLocationName?: string;
  }>;
  receipts?: Array<{ id?: string; containerNo?: string; equipmentNo?: string; dockId?: string; dockName?: string }>;
  checkInEndTime?: string;
  checkInStartTime?: string;
  dockId?: string;
  dockName?: string;
}

export interface InYardRow {
  equipmentNumber: string;
  equipmentType: string;
  entryTicket: string;
  receiptId: string;
  dockId: string;
  dockName: string;
  checkIn: string;
  timeInYard: string;
  customer: string;
  customerName: string;
  location: string;
  status: string;
  id: string;
  containerNo: string;
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

export async function searchOrderPlansByDn(token: string, dn: string, facilityId?: string): Promise<OrderPlan[]> {
  const bodies = [
    { pageNo: 1, currentPage: 1, pageSize: 20, orderIds: [dn] },
    { pageNo: 1, currentPage: 1, pageSize: 20, orderId: dn },
    { pageNo: 1, currentPage: 1, pageSize: 20, orderNo: dn },
  ];
  for (const body of bodies) {
    try {
      const res = await wmsRequest<PageResult<OrderPlan>>('/wms-bam/outbound/order-plan/search-by-paging', { token, facilityId, body });
      const rows = rowsFrom(res);
      if (rows.length) return rows;
    } catch {}
  }
  return [];
}

export async function searchPickTasksByDn(token: string, dn: string, facilityId?: string): Promise<PickTask[]> {
  const bodies = [
    { pageNo: 1, currentPage: 1, pageSize: 50, orderIds: [dn] },
    { pageNo: 1, currentPage: 1, pageSize: 50, orderId: dn },
    { pageNo: 1, currentPage: 1, pageSize: 50, orderNo: dn },
  ];
  for (const body of bodies) {
    try {
      const res = await wmsRequest<PageResult<PickTask>>('/wms-bam/outbound/pick-task/search-by-paging', { token, facilityId, body });
      const rows = rowsFrom(res);
      if (rows.length) return rows;
    } catch {}
  }
  return [];
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


export async function searchPickTaskHistory(token: string, facilityId?: string): Promise<PickTask[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const bodies = [
    { pageNo: 1, currentPage: 1, pageSize: 500, statuses: ['CLOSED'], endTimeFrom: start.toISOString(), endTimeTo: end.toISOString() },
    { pageNo: 1, currentPage: 1, pageSize: 500, statuses: ['CLOSED'], createdTimeStart: start.toISOString(), createdTimeEnd: end.toISOString() },
    { pageNo: 1, currentPage: 1, pageSize: 500, statuses: ['CLOSED', 'IN_PROGRESS'] },
  ];
  for (const body of bodies) {
    try {
      const res = await wmsRequest<PageResult<PickTask>>('/wms-bam/outbound/pick-task/search-by-paging', { token, facilityId, body });
      const rows = rowsFrom(res);
      if (rows.length) return rows;
    } catch {}
  }
  return [];
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

export async function searchInYardReceipts(token: string, facilityId?: string): Promise<InYardRow[]> {
  const rows: InYardRow[] = [];
  const seenContainers = new Set<string>();
  const seenReceipts = new Set<string>();

  // Step 1: Query entry tickets with yard-checked-in statuses (reference logic)
  try {
    const res = await wmsRequest<PageResult<EntryTicket>>('/wms-bam/entry-ticket/search-by-paging', {
      token,
      facilityId,
      body: {
        statuses: ['Gate Checked In', 'Window Checked In', 'Dock Checked In', 'Waiting'],
        currentPage: 1,
        pageSize: 500,
      },
    });
    const tickets = rowsFrom(res);
    const CLOSED_STATUSES = new Set(['CLOSED', 'FORCE_CLOSED', 'TASK_COMPLETED', 'CANCELLED']);

    for (const ticket of tickets) {
      const etId = ticket.id || '';
      const ticketReceipts = ticket.receipts || [];
      const check = ticket.entryTicketCheck || {};
      const containers = check.containerNOs || [];
      const trailers = check.trailers || [];
      const containerNo = containers[0] || trailers[0] || '';
      const checkIn = ticket.checkInStartTime || ticket.createdWhen || '';

      if (!ticketReceipts.some(r => !CLOSED_STATUSES.has(r.status || ''))) continue;

      const openReceipt = ticketReceipts.find(r => !CLOSED_STATUSES.has(r.status || ''));
      const customer = openReceipt?.customerName || '';
      const equipNum = containerNo || openReceipt?.containerNo || '';

      if (!equipNum || equipNum.length < 5 || !customer) continue;

      let receiptId = openReceipt?.id || '';

      // Try to get better receipt data from entry-ticket detail
      try {
        const detail = await wmsRequest<{ data?: EntryTicketDetail } & EntryTicketDetail>(
          `/wms-bam/entry-ticket/${encodeURIComponent(etId)}`,
          { token, facilityId, method: 'GET' }
        );
        const d = detail?.data || detail || {};
        const actions = Array.isArray(d.equipmentActions) ? d.equipmentActions : [];
        const matchAction = actions.find(a => {
          const eqNo = String(a.equipmentNo || a.containerNo || a.trailerNo || '').trim();
          return equipNum && eqNo === equipNum;
        }) || actions.find(a => Array.isArray(a.receiptIds) && a.receiptIds.length > 0);

        if (matchAction?.receiptIds?.[0]) receiptId = matchAction.receiptIds[0];
        const detailCheckIn = d.checkInEndTime || d.checkInStartTime || '';
        if (detailCheckIn && !checkIn) Object.assign(ticket, { checkInStartTime: detailCheckIn });
      } catch {}

      if (!receiptId) continue;

      seenContainers.add(equipNum);
      seenReceipts.add(receiptId);

      rows.push({
        equipmentNumber: equipNum,
        equipmentType: 'Container',
        entryTicket: etId,
        receiptId,
        dockId: ticket.dockId || '',
        dockName: ticket.dockName || '',
        checkIn: ticket.checkInStartTime || ticket.createdWhen || '',
        timeInYard: '',
        customer,
        customerName: customer,
        location: ticket.dockName || '',
        status: ticket.status || '',
        id: etId,
        containerNo: equipNum,
      });
    }
  } catch {}

  // Step 2: Supplement with open receipts that have containers and haven't been devanned
  try {
    const res = await wmsRequest<PageResult<Receipt>>('/wms-bam/inbound/receipt/search-by-paging', {
      token,
      facilityId,
      body: {
        excludeStatuses: ['CLOSED', 'FORCE_CLOSED', 'TASK_COMPLETED', 'CANCELLED'],
        currentPage: 1,
        pageSize: 500,
      },
    });
    const receipts = rowsFrom(res);

    const supplementRows: InYardRow[] = [];
    for (const r of receipts) {
      const containerNo = r.containerNo || '';
      const rid = r.id || '';
      const customer = r.customerName || '';
      const entryId = r.entryId || r.entry || '';

      if (!containerNo || containerNo.length < 6) continue;
      if (!entryId || !customer) continue;
      if (r.devannedTime || r.devanTime || r.devannedWhen || r.isDevanned) continue;
      if (seenContainers.has(containerNo) || seenReceipts.has(rid)) continue;

      seenContainers.add(containerNo);
      supplementRows.push({
        equipmentNumber: containerNo,
        equipmentType: 'Container',
        entryTicket: entryId,
        receiptId: rid,
        dockId: r.dockId || '',
        dockName: r.dockName || '',
        checkIn: '',
        timeInYard: '',
        customer,
        customerName: customer,
        location: r.dockName || '',
        status: r.status || 'OPEN',
        id: entryId || rid,
        containerNo,
      });
    }

    // Resolve checkIn times for supplement rows
    for (const row of supplementRows) {
      if (row.entryTicket) {
        try {
          const detail = await wmsRequest<{ data?: EntryTicketDetail } & EntryTicketDetail>(
            `/wms-bam/entry-ticket/${encodeURIComponent(row.entryTicket)}`,
            { token, facilityId, method: 'GET' }
          );
          const d = detail?.data || detail || {};
          const checkIn = d.checkInEndTime || d.checkInStartTime || '';
          if (checkIn) row.checkIn = checkIn;
        } catch {}
      }
    }

    rows.push(...supplementRows);
  } catch {}

  return rows;
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

function taskIdOf(task: PickTask): string {
  return String(task.id || task.taskId || task.originalTaskId || task.taskNo || '');
}

function planIdOf(plan: OrderPlan): string {
  return String(plan.id || plan.orderPlanId || plan.planId || '');
}

async function createPickTaskForPlan(token: string, planId: string, facilityId?: string): Promise<void> {
  const candidates = [
    `/wms/outbound/order-plan/${encodeURIComponent(planId)}/doCreatePickTask`,
    `/wms/outbound/order-plan/${encodeURIComponent(planId)}/create-task`,
  ];
  let lastError = 'Could not create pick task.';
  for (const path of candidates) {
    try {
      await wmsRequest(path, { token, facilityId, method: path.endsWith('doCreatePickTask') ? 'PUT' : 'POST', body: {} });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  throw new Error(lastError);
}

export async function assignDnToUser(token: string, dn: string, assigneeUserId: string, facilityId?: string): Promise<{ success: boolean; message: string }> {
  try {
    let pickTasks = await searchPickTasksByDn(token, dn, facilityId);
    if (!pickTasks.length) {
      const plans = await searchOrderPlansByDn(token, dn, facilityId);
      const planId = planIdOf(plans[0] || {});
      if (!planId) return { success: false, message: `No pick task or order plan was found for ${dn}.` };
      await createPickTaskForPlan(token, planId, facilityId);
      pickTasks = await searchPickTasksByDn(token, dn, facilityId);
    }

    const taskIds = pickTasks.map(taskIdOf).filter(Boolean);
    if (!taskIds.length) return { success: false, message: `A pick task could not be found for ${dn}.` };

    const result = await assignPickTasks(token, {
      taskIds,
      assigneeUserId,
      includesTaskSteps: true,
      lastAssignedWhen: new Date().toISOString(),
    }, facilityId);
    if (!result.success) return result;

    const verified = await searchPickTasksByDn(token, dn, facilityId);
    const assigned = verified.some((task) => String(task.assigneeUserId || '') === String(assigneeUserId));
    return { success: true, message: assigned ? `${dn} was assigned successfully.` : `${dn} assignment was submitted. Refresh WISE to verify.` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : `Unable to assign ${dn}.` };
  }
}
