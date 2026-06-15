import { IAM_BASE_URL } from './constants';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  data?: {
    user_id?: string;
    tenant_id?: string;
    company_code?: string;
    username?: string;
    name?: string;
  };
  exp?: number;
}

export async function login(username: string, password: string): Promise<AuthTokens> {
  const res = await fetch(`${IAM_BASE_URL}/auth/exchange-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', username, password }),
  });

  const json = await res.json();

  if (String(json.code) !== '0' || !json.data?.access_token) {
    throw new Error(json.message || 'Sign in failed. Please check your credentials.');
  }

  return {
    accessToken: json.data.access_token,
    refreshToken: json.data.refresh_token,
    expiresIn: json.data.expires_in,
  };
}

export function decodeJwt(token: string): JwtPayload {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return {};
  }
}

export function getSessionFromStorage(): { accessToken: string; refreshToken: string } | null {
  if (typeof window === 'undefined') return null;
  const accessToken = sessionStorage.getItem('cotton_access_token');
  const refreshToken = sessionStorage.getItem('cotton_refresh_token');
  if (!accessToken) return null;
  return { accessToken, refreshToken: refreshToken || '' };
}

export function saveSession(tokens: AuthTokens): void {
  sessionStorage.setItem('cotton_access_token', tokens.accessToken);
  sessionStorage.setItem('cotton_refresh_token', tokens.refreshToken);
}

export function clearSession(): void {
  sessionStorage.removeItem('cotton_access_token');
  sessionStorage.removeItem('cotton_refresh_token');
}
