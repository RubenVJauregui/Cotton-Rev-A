export const IAM_BASE_URL = process.env.NEXT_PUBLIC_IAM_BASE_URL || 'https://id.item.com';
export const WMS_API_BASE_URL = process.env.NEXT_PUBLIC_WMS_API_BASE_URL || 'https://unis.item.com/api';

export const DEFAULT_TENANT = 'LT';
export const DEFAULT_FACILITY = 'LT_F34';
export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

export const COTTON_JOSE = {
  name: 'Jose Villasenor',
  username: 'jvilasenor',
  employeeCode: '3677',
  userId: '3138',
  facility: 'LT_F34',
} as const;

export const JOSE_DUPLICATE = {
  username: 'jvillasenor',
  userId: '789',
} as const;
