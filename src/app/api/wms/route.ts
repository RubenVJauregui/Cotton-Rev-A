import { NextRequest, NextResponse } from 'next/server';

const WMS_API_BASE_URL = process.env.WMS_API_BASE_URL || process.env.NEXT_PUBLIC_WMS_API_BASE_URL || 'https://unis.item.com/api';
const ALLOWED_PATHS = new Set([
  '/wms-bam/outbound/order/search-by-paging',
  '/wms-bam/outbound/order-plan/search-by-paging',
  '/wms-bam/outbound/pick-task/search-by-paging',
  '/wms-bam/outbound/load/search-by-paging',
  '/wms-bam/outbound/load-task/search-by-paging',
  '/wms-bam/inbound/receipt/search-by-paging',
  '/wms-bam/user/facility/search-by-paging',
  '/wms/outbound/pick-task/batch-assignment',
]);

function isAllowedPath(path: string) {
  if (ALLOWED_PATHS.has(path)) return true;
  return /^\/wms\/outbound\/order-plan\/[^/]+\/(doCreatePickTask|create-task|release)$/.test(path);
}

export async function POST(req: NextRequest) {
  try {
    const { path, method, body, token, facilityId, tenantId, timezone } = await req.json();
    if (!path || typeof path !== 'string' || !isAllowedPath(path)) {
      return NextResponse.json({ message: 'Requested warehouse data is unavailable.' }, { status: 400 });
    }
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ message: 'Please sign in again.' }, { status: 401 });
    }

    const upstream = await fetch(`${WMS_API_BASE_URL}${path}`, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId || 'LT',
        'x-facility-id': facilityId || 'LT_F34',
        'item-time-zone': timezone || 'America/Los_Angeles',
      },
      body: JSON.stringify(body || {}),
      cache: 'no-store',
    });

    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json({ message: 'Warehouse data is unavailable right now.' }, { status: upstream.status });
    }
    return NextResponse.json(json, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'Warehouse data is unavailable right now.' }, { status: 500 });
  }
}
