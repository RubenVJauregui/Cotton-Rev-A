import { WMS_API_BASE_URL, DEFAULT_FACILITY, COTTON_JOSE, JOSE_DUPLICATE } from './constants';

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
    'x-facility-id': facilityId,
  };

  const res = await fetch(`${WMS_API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`WMS API error: ${res.status}`);
  }

  return res.json();
}

interface PageResult<T> {
  code?: number;
  data?: {
    records?: T[];
    total?: number;
    currentPage?: number;
    pageSize?: number;
  };
}

export interface OutboundOrder {
  id?: string;
  orderId?: string;
  orderNo?: string;
  status?: string;
  customerId?: string;
  customerName?: string;
  shipToName?: string;
  orderType?: string;
  priority?: number;
  createdAt?: string;
  expectedShipDate?: string;
}

export interface Load {
  id?: string;
  loadId?: string;
  loadNo?: string;
  status?: string;
  carrierId?: string;
  carrierName?: string;
  appointmentTime?: string;
  shipDate?: string;
  doorId?: string;
  orderCount?: number;
}

export interface PickTask {
  id?: string;
  taskNo?: string;
  status?: string;
  pickType?: string;
  pickMethod?: string;
  assigneeUserId?: string;
  assigneeUserName?: string;
  priority?: number;
  orderPlanId?: string;
  createdAt?: string;
  startTime?: string;
  endTime?: string;
}

export interface Receipt {
  id?: string;
  receiptId?: string;
  receiptNo?: string;
  status?: string;
  customerId?: string;
  poNo?: string;
  referenceNo?: string;
  createdAt?: string;
}

export interface WmsUser {
  userId?: string;
  username?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  status?: string;
}

function isJoseDuplicate(user: WmsUser): boolean {
  const uname = (user.username || '').toLowerCase();
  const uid = String(user.userId || '');
  return uname === JOSE_DUPLICATE.username.toLowerCase() || uid === JOSE_DUPLICATE.userId;
}

function normalizeJose(user: WmsUser): WmsUser {
  const uname = (user.username || '').toLowerCase();
  const uid = String(user.userId || '');
  const fullName = (user.name || `${user.firstName || ''} ${user.lastName || ''}`).trim().toLowerCase();

  if (uname === COTTON_JOSE.username || uid === COTTON_JOSE.userId || fullName === 'jose villasenor') {
    return {
      ...user,
      userId: COTTON_JOSE.userId,
      username: COTTON_JOSE.username,
      name: COTTON_JOSE.name,
      employeeCode: COTTON_JOSE.employeeCode,
    };
  }
  return user;
}

export function filterAndNormalizeUsers(users: WmsUser[]): WmsUser[] {
  return users.filter((u) => !isJoseDuplicate(u)).map(normalizeJose);
}

export async function searchOutboundOrders(token: string, facilityId?: string): Promise<OutboundOrder[]> {
  try {
    const res = await wmsRequest<PageResult<OutboundOrder>>(
      '/v1/public/edi/outbound/order-level/search-by-paging',
      {
        token,
        facilityId,
        body: {
          currentPage: 1,
          pageSize: 20,
        },
      }
    );
    return res.data?.records || [];
  } catch {
    return [];
  }
}

export async function searchLoads(token: string, facilityId?: string): Promise<Load[]> {
  try {
    const res = await wmsRequest<PageResult<Load>>('/outbound/load/search-by-paging', {
      token,
      facilityId,
      body: {
        currentPage: 1,
        pageSize: 20,
        statuses: ['NEW', 'LOADING', 'LOADED'],
      },
    });
    return res.data?.records || [];
  } catch {
    return [];
  }
}

export async function searchPickTasks(
  token: string,
  facilityId?: string,
  statuses?: string[]
): Promise<PickTask[]> {
  try {
    const res = await wmsRequest<PageResult<PickTask>>('/outbound/pick-task/search-by-paging', {
      token,
      facilityId,
      body: {
        currentPage: 1,
        pageSize: 50,
        statuses: statuses || ['NEW', 'IN_PROGRESS'],
      },
    });
    return res.data?.records || [];
  } catch {
    return [];
  }
}

export async function searchReceipts(token: string, facilityId?: string): Promise<Receipt[]> {
  try {
    const res = await wmsRequest<PageResult<Receipt>>('/inbound/receipt/search-by-paging', {
      token,
      facilityId,
      body: {
        currentPage: 1,
        pageSize: 20,
        statuses: ['OPEN', 'IN_PROGRESS', 'APPOINTMENT_MADE'],
      },
    });
    return res.data?.records || [];
  } catch {
    return [];
  }
}

export async function searchUsers(token: string, facilityId?: string): Promise<WmsUser[]> {
  try {
    const res = await wmsRequest<PageResult<WmsUser>>('/user/search-by-paging', {
      token,
      facilityId,
      body: {
        currentPage: 1,
        pageSize: 100,
        facilityIds: [facilityId || DEFAULT_FACILITY],
      },
    });
    const users = res.data?.records || [];
    return filterAndNormalizeUsers(users);
  } catch {
    return [];
  }
}

export interface AssignmentPayload {
  taskIds: string[];
  assigneeUserId: string;
  includesTaskSteps: boolean;
  lastAssignedWhen: string;
}

export async function assignPickTasks(
  token: string,
  payload: AssignmentPayload,
  facilityId?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await wmsRequest<{ code?: number; message?: string }>(
      '/outbound/pick-task/batch-assignment',
      { token, facilityId, body: payload }
    );
    if (res.code === 0 || res.code === 200) {
      return { success: true, message: 'Assignment completed successfully.' };
    }
    return { success: false, message: res.message || 'Assignment failed.' };
  } catch (err) {
    return { success: false, message: 'Unable to complete assignment. Please try again.' };
  }
}
