// In-memory product/category/customer cache for instant search.
import * as idb from '../db/idb.js';
import { lc } from '../core/utils.js';

const products = new Map();
const categories = new Map();
const bySku = new Map();
const customers = new Map();

function indexProduct(p) {
  const old = products.get(p.id);
  if (old?.sku) bySku.delete(lc(old.sku));
  products.set(p.id, p);
  if (p.sku) bySku.set(lc(p.sku), p);
  p._s = lc([p.name, p.sku, categories.get(p.categoryId)?.name].filter(Boolean).join(' '));
}

export async function load() {
  const [ps, cs, cus] = await idb.read(['products', 'categories', 'customers'], (t) =>
    Promise.all([t.getAll('products'), t.getAll('categories'), t.getAll('customers')]));
  products.clear(); categories.clear(); bySku.clear(); customers.clear();
  cs.forEach((c) => categories.set(c.id, c));
  ps.forEach(indexProduct);
  cus.forEach((c) => customers.set(c.id, c));
}

export async function refreshProducts(ids) {
  const fresh = await idb.read(['products'], (t) => Promise.all(ids.map((id) => t.get('products', id))));
  ids.forEach((id, i) => {
    if (fresh[i]) indexProduct(fresh[i]);
    else { const old = products.get(id); if (old?.sku) bySku.delete(lc(old.sku)); products.delete(id); }
  });
}
export async function refreshCategories() {
  const cs = await idb.getAll('categories');
  categories.clear(); cs.forEach((c) => categories.set(c.id, c));
  products.forEach(indexProduct);
}
export async function refreshCustomer(id) {
  const c = await idb.get('customers', id);
  if (c) customers.set(id, c); else customers.delete(id);
}

export const product = (id) => products.get(id);
export const allProducts = () => [...products.values()];
export const category = (id) => categories.get(id);
export const allCategories = () => [...categories.values()];
export const customer = (id) => customers.get(id);
export const allCustomers = () => [...customers.values()];

export function findBySku(code) {
  const c = lc(code);
  if (!c) return null;
  const p = bySku.get(c);
  if (p && p.active) return p;
  return null;
}

export function searchProducts(q, { limit = 40, categoryId = null } = {}) {
  const terms = lc(q).split(/\s+/).filter(Boolean);
  const out = [];
  for (const p of products.values()) {
    if (!p.active) continue;
    if (categoryId && p.categoryId !== categoryId) continue;
    if (terms.every((t) => p._s.includes(t))) {
      out.push(p);
      if (!terms.length && out.length >= limit * 4) break;
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out.slice(0, limit);
}

export function searchCustomers(q, limit = 50) {
  const terms = lc(q).split(/\s+/).filter(Boolean);
  return [...customers.values()]
    .filter((c) => terms.every((t) => lc(`${c.name} ${c.phone || ''}`).includes(t)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}
