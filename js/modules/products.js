// Products — jewellery catalogue management.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, uuid, lc, nowISO, AppError } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import * as Catalog from '../services/catalog.js';

const $ = window.jQuery;
const cur = () => getSettings().currency;

// ── Product form ──────────────────────────────────────────────────────────────
async function productForm(p = null) {
  const cats = Catalog.allCategories();
  const catOptions = cats.map((c) => `<option value="${esc(c.id)}" ${p?.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  return UI.formModal({
    title: p ? 'Edit Product' : 'New Product',
    body: `
      <div class="mb-3">
        <label class="form-label">Product Name *</label>
        <input name="name" class="form-control" required value="${esc(p?.name || '')}" placeholder="e.g. Earrings Style A - Gold Plated">
      </div>
      <div class="row g-2 mb-3">
        <div class="col-8">
          <label class="form-label">Category</label>
          <select name="categoryId" class="form-select"><option value="">-- No Category --</option>${catOptions}</select>
        </div>
        <div class="col-4">
          <label class="form-label">SKU / Code</label>
          <input name="sku" class="form-control" value="${esc(p?.sku || '')}" placeholder="E-001">
        </div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-6">
          <label class="form-label">Price / Piece (${cur()}) *</label>
          <input name="pricePc" type="number" class="form-control" value="${p?.pricePc || ''}" min="0" step="1" required placeholder="0">
        </div>
        <div class="col-6">
          <label class="form-label">Price / Dozen (${cur()})</label>
          <input name="priceDz" type="number" class="form-control" value="${p?.priceDz || ''}" min="0" step="1" placeholder="0 (optional)">
        </div>
      </div>
      ${p ? `<div class="form-check mb-2"><input class="form-check-input" type="checkbox" name="active" id="active-chk" ${p.active ? 'checked' : ''}><label class="form-check-label" for="active-chk">Active (show in POS)</label></div>` : ''}`,
    submitLabel: p ? 'Save Changes' : 'Add Product',
    async onSubmit(vals) {
      const name = vals.name.trim();
      if (!name) throw new AppError('Product name is required.');
      const pricePc = parseFloat(vals.pricePc) || 0;
      if (pricePc <= 0) throw new AppError('Price per piece must be greater than 0.');
      const product = {
        id: p?.id || uuid(),
        name, nameLc: lc(name),
        categoryId: vals.categoryId || null,
        sku: vals.sku.trim(),
        pricePc,
        priceDz: parseFloat(vals.priceDz) || 0,
        active: p ? (vals.active ? 1 : 0) : 1,
        createdAt: p?.createdAt || nowISO(),
        updatedAt: nowISO(),
      };
      await idb.write(['products'], (tx) => tx.put('products', product));
      await Catalog.refreshProducts([product.id]);
      return product;
    },
  });
}

// ── Module ────────────────────────────────────────────────────────────────────
export default {
  async render(container, { params, setTitle }) {
    setTitle('Products');
    const $c = $(container);

    // If a product id is given, show detail/edit inline
    const editId = params?.[0];

    let catFilter = null;
    let searchQ = '';

    function filteredProducts() {
      return Catalog.searchProducts(searchQ, { limit: 200, categoryId: catFilter });
    }

    function renderList() {
      const products = filteredProducts();
      const cats = Catalog.allCategories();
      const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

      const catChips = `<span class="chip${!catFilter ? ' active' : ''}" data-cat="">All (${Catalog.allProducts().filter((p) => p.active).length})</span>` +
        cats.map((c) => {
          const cnt = Catalog.allProducts().filter((p) => p.categoryId === c.id && p.active).length;
          return `<span class="chip${catFilter === c.id ? ' active' : ''}" data-cat="${esc(c.id)}">${esc(c.name)} ${cnt ? `(${cnt})` : ''}</span>`;
        }).join('');

      $c.html(`
        <div class="page-header">
          <h1>Products</h1>
          <button class="btn btn-primary btn-add-prod"><i class="bi bi-plus-lg me-1"></i>Add</button>
        </div>
        <div class="chips mb-3 cat-chips">${catChips}</div>
        <div class="search-box mb-3">
          <i class="bi bi-search"></i>
          <input type="search" class="form-control prod-q" placeholder="Search products…" value="${esc(searchQ)}" autocomplete="off">
        </div>
        <div class="list-card prod-list">
          ${products.length ? products.map((p) => `
            <button class="list-row btn-edit-prod" data-id="${esc(p.id)}">
              <div class="avatar avatar-gold"><i class="bi bi-gem"></i></div>
              <div class="main">
                <div class="title">${esc(p.name)}</div>
                <div class="sub">${p.sku ? `#${esc(p.sku)} · ` : ''}${esc(catMap[p.categoryId] || '')}${!p.active ? ' · <em>Inactive</em>' : ''}</div>
              </div>
              <div class="end">
                <div class="fw-bold money small">${cur()} ${fmtNum(p.pricePc)}/pc</div>
                ${p.priceDz ? `<div class="small text-body-secondary money">${cur()} ${fmtNum(p.priceDz)}/dz</div>` : ''}
              </div>
            </button>`).join('') : `<div class="empty-state"><i class="bi bi-box-seam"></i><div class="empty-title">No products found</div><div class="empty-sub">Tap Add to create your first product</div></div>`}
        </div>`);

      $c.off('click', '.btn-add-prod').on('click', '.btn-add-prod', async () => {
        if (await productForm()) { await reRender(); UI.toast('Product added', 'success'); }
      });
      $c.off('click', '.btn-edit-prod').on('click', '.btn-edit-prod', async function () {
        const id = $(this).data('id');
        const prod = Catalog.product(id);
        if (!prod) return;
        if (await productForm(prod)) { await reRender(); UI.toast('Product saved', 'success'); }
      });
      $c.off('click', '.cat-chips .chip').on('click', '.cat-chips .chip', function () {
        catFilter = $(this).data('cat') || null;
        renderList();
      });
      $c.off('input', '.prod-q').on('input', '.prod-q', function () {
        searchQ = $(this).val();
        renderList();
      });
    }

    async function reRender() { await Catalog.refreshCategories(); renderList(); }
    renderList();
  },
};
