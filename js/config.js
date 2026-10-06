// App configuration — Zewar POS: Imitation Jewellery Wholesale
export const CONFIG = {
  APP_NAME: 'Zewar POS',
  APP_ID: 'zewarpos',
  APP_VERSION: '1.0.0',
  SCHEMA_VERSION: 1,
  BACKUP_VERSION: 1,
  AUTH_API_BASE: 'https://eposwala.com/api',
  SUPPORT_PHONE: '0300-1234567',
};

export const CDN = {
  html5qrcode: 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
};

export const storageKey = (name) => `${CONFIG.APP_ID}.${name}`;
