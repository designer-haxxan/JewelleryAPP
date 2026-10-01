// IndexedDB schema — Zewar POS (jewellery wholesale).
import { CONFIG } from '../config.js';

export const DB_NAME = `${CONFIG.APP_ID}_db`;
export const LEGACY_DB_NAME = 'disterp_pos';
export const DB_VERSION = 1;

export const DATA_STORES = ['categories', 'products', 'customers', 'sales', 'meta'];

const STORES = {
  meta:       { keyPath: 'key', indexes: {} },
  categories: { indexes: { nameLc: 'nameLc' } },
  products:   { indexes: { nameLc: 'nameLc', sku: 'sku', categoryId: 'categoryId', active: 'active' } },
  customers:  { indexes: { nameLc: 'nameLc', phone: 'phone' } },
  sales:      { indexes: { number: ['number', true], date: 'date', customerId: 'customerId' } },
};

const DEFAULT_CATS = [
  { id: 'cat-earrings',  name: 'Earrings / Baliyan' },
  { id: 'cat-necklaces', name: 'Necklaces / Haar' },
  { id: 'cat-bangles',   name: 'Bangles / Choorian' },
  { id: 'cat-rings',     name: 'Rings / Angoothi' },
  { id: 'cat-bracelets', name: 'Bracelets / Kara' },
  { id: 'cat-sets',      name: 'Jewellery Sets' },
  { id: 'cat-hairpins',  name: 'Hairpins & Clips' },
  { id: 'cat-anklets',   name: 'Anklets / Payal' },
  { id: 'cat-other',     name: 'Other Items' },
];

export function upgrade(db, oldVersion, t) {
  if (oldVersion < 1) {
    for (const [name, def] of Object.entries(STORES)) {
      const os = db.createObjectStore(name, { keyPath: def.keyPath || 'id' });
      for (const [idx, spec] of Object.entries(def.indexes)) {
        const [keyPath, unique] = Array.isArray(spec) ? spec : [spec, false];
        os.createIndex(idx, keyPath, { unique: !!unique });
      }
    }
    const now = new Date().toISOString();
    const cats = t.objectStore('categories');
    for (const c of DEFAULT_CATS) {
      cats.put({ ...c, nameLc: c.name.toLowerCase(), createdAt: now });
    }
    t.objectStore('meta').put({ key: 'schemaVersion', value: 1 });
    t.objectStore('meta').put({ key: 'createdAt', value: now });
    t.objectStore('meta').put({ key: 'nextBillNo', value: 1 });
  }
}
