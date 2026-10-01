// Customers — khata / ledger.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, uuid, lc, round2, num, nowISO, fmtDate, AppError } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import * as Catalog from '../services/catalog.js';

const $ = window.jQuery;
const cur = () => getSettings().currency;

async function customerForm(c = null) {
  return UI.formModal({
    title: c ? 'Edit Customer' : 'New Customer',
    body: `
      <div class="mb-3"><label class="form-label">Name / Shop *</label>
        <input name="name" class="form-control" required value="${esc(c?.name || '')}" placeholder="Ahmed Traders"></div>
      <div class="row g-2 mb-3">
        <div class="col-6"><label class="form-label">Phone</label>
          <input name="phone" class="form-control" type="tel" value="${esc(c?.phone || '')}" placeholder="0300-0000000"></div>
        <div class="col-6"><label class="form-label">City</label>
          <input name="city" class="form-control" value="${esc(c?.city || '')}" placeholder="Lahore"></div>
      </div>
      <div class="mb-2"><label class="form-label">Note</label>
        <input name="note" class="form-control" value="${esc(c?.note || '')}" placeholder="Optional note"></div>`,
    submitLabel: c ? 'Save Changes' : 'Add Customer',
    async onSubmit(vals) {
      const name = vals.name.trim();
      if (!name) throw new AppError('Name is required.');
      const cust = { id: c?.id || uuid(), name, nameLc: lc(name), phone: vals.phone.trim(), city: vals.city.trim(), note: vals.note.trim(), balance: c?.balance || 0, createdAt: c?.createdAt || nowISO(), updatedAt: nowISO() };
      await idb.write(['customers'], (tx) => tx.put('customers', cust));
      await Catalog.refreshCustomer(cust.id);
      return cust;
    },
  });
}

async function receivePaymentModal(cust) {
  return UI.formModal({
    title: `Receive Payment — ${cust.name}`,
    body: `
      <div class="mb-3 p-3 rounded" style="background:var(--zw-gold-soft)">
        <div class="small text-body-secondary">Outstanding Balance</div>
        <div class="fw-bold fs-4 money">${cur()} ${fmtNum(cust.balance)}</div>
      </div>
      <div class="mb-3"><label class="form-label">Amount Received (${cur()}) *</label>
        <input name="amount" type="number" class="form-control form-control-lg" min="0.01" step="1" required placeholder="0" value="${fmtNum(cust.balance)}"></div>
      <div class="mb-2"><label class="form-label">Note</label>
        <input name="note" class="form-control" placeholder="Cash / Bank / Transfer…" value="Cash"></div>`,
    submitLabel: 'Record Payment',
    async onSubmit(vals) {
      const amount = num(vals.amount);
      if (amount <= 0) throw new AppError('Amount must be greater than 0.');
      const newBal = round2(Math.max(0, cust.balance - amount));
      await idb.write(['customers'], (tx) => tx.put('customers', { ...cust, balance: newBal, updatedAt: nowISO() }));
      await Catalog.refreshCustomer(cust.id);
      return { amount, note: vals.note };
    },
  });
}

// ── Module ────────────────────────────────────────────────────────────────────
export default {
  async render(container, { params, setTitle }) {
    const $c = $(container);
    const customerId = params?.[0];

    if (customerId) {
      await renderDetail($c, customerId, setTitle);
    } else {
      renderList($c, setTitle);
    }
  },
};

function renderList($c, setTitle) {
  setTitle('Customers');
  let searchQ = '';

  function draw() {
    const list = Catalog.searchCustomers(searchQ, 200);
    const totalOutstanding = list.reduce((s, c) => s + (c.balance || 0), 0);
    $c.html(`
      <div class="page-header">
        <h1>Customers</h1>
        <button class="btn btn-primary btn-add-cust"><i class="bi bi-person-plus me-1"></i>Add</button>
      </div>
      ${totalOutstanding > 0.005 ? `<div class="alert alert-warning py-2 mb-3 d-flex align-items-center gap-2"><i class="bi bi-exclamation-circle"></i><span>Total outstanding: <strong>${cur()} ${fmtNum(totalOutstanding)}</strong></span></div>` : ''}
      <div class="search-box mb-3">
        <i class="bi bi-search"></i>
        <input type="search" class="form-control cust-q" placeholder="Search name or phone…" value="${esc(searchQ)}" autocomplete="off">
      </div>
      <div class="list-card">
        ${list.length ? list.map((c) => `
          <a href="#/customers/${encodeURIComponent(c.id)}" class="list-row">
            <div class="avatar avatar-gold">${esc(c.name.slice(0, 2).toUpperCase())}</div>
            <div class="main">
              <div class="title">${esc(c.name)}</div>
              <div class="sub">${[c.phone, c.city].filter(Boolean).join(' · ') || 'No contact info'}</div>
            </div>
            <div class="end">
              ${c.balance > 0.005
                ? `<span class="badge-balance">${cur()} ${fmtNum(c.balance)}</span>`
                : `<span class="badge-paid"><i class="bi bi-check-circle"></i> Clear</span>`}
            </div>
          </a>`).join('') : `<div class="empty-state"><i class="bi bi-people"></i><div class="empty-title">No customers yet</div><div class="empty-sub">Add your first customer</div></div>`}
      </div>`);

    $c.off('click', '.btn-add-cust').on('click', '.btn-add-cust', async () => {
      if (await customerForm()) { draw(); UI.toast('Customer added', 'success'); }
    });
    $c.off('input', '.cust-q').on('input', '.cust-q', function () { searchQ = $(this).val(); draw(); });
  }
  draw();
}

async function renderDetail($c, customerId, setTitle) {
  $c.html(`<div class="text-center py-5"><div class="spinner-border text-warning"></div></div>`);
  const cust = await idb.get('customers', customerId);
  if (!cust) { $c.html(`<div class="alert alert-danger">Customer not found.</div>`); return; }
  setTitle(cust.name);

  const allSales = await idb.getAllByIndex('sales', 'customerId', customerId);
  const sales = allSales.filter((s) => s.status !== 'void').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function draw() {
    const c = cust; // closed over — re-read from idb if needed
    $c.html(`
      <div class="page-header">
        <a href="#/customers" class="btn btn-light btn-sm"><i class="bi bi-arrow-left"></i></a>
        <h1>${esc(c.name)}</h1>
        <button class="btn btn-light btn-sm btn-edit-cust"><i class="bi bi-pencil"></i></button>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-6">
          <div class="stat-card card p-3 text-center">
            <div class="stat-label">Outstanding</div>
            <div class="stat-value money ${c.balance > 0.005 ? 'text-danger' : 'text-success'}">${cur()} ${fmtNum(c.balance)}</div>
          </div>
        </div>
        <div class="col-6">
          <div class="stat-card card p-3 text-center">
            <div class="stat-label">Total Bills</div>
            <div class="stat-value">${sales.length}</div>
          </div>
        </div>
      </div>
      ${c.balance > 0.005 ? `<button class="btn btn-primary w-100 mb-3 btn-recv-payment"><i class="bi bi-cash-coin me-2"></i>Receive Payment</button>` : ''}
      ${c.phone || c.city ? `<div class="list-card mb-3"><div class="list-row"><i class="bi bi-person-lines-fill me-2 text-warning"></i><div>${c.phone ? `<div>${esc(c.phone)}</div>` : ''}${c.city ? `<div class="small text-body-secondary">${esc(c.city)}</div>` : ''}</div></div></div>` : ''}
      <div class="section-heading">Bills</div>
      <div class="list-card">
        ${sales.length ? sales.map((s) => `
          <a href="#/sales/${encodeURIComponent(s.id)}" class="list-row">
            <div class="main">
              <div class="title">${esc(s.number)}</div>
              <div class="sub">${fmtDate(s.date)}</div>
            </div>
            <div class="end">
              <div class="fw-bold money">${cur()} ${fmtNum(s.total)}</div>
              ${s.balance > 0.005 ? `<div class="small text-danger">Due: ${fmtNum(s.balance)}</div>` : `<div class="small text-success">Paid</div>`}
            </div>
          </a>`).join('') : `<div class="empty-state"><i class="bi bi-receipt"></i><div class="empty-title">No bills yet</div></div>`}
      </div>`);

    $c.off('click', '.btn-edit-cust').on('click', '.btn-edit-cust', async () => {
      const fresh = await idb.get('customers', customerId);
      await customerForm(fresh);
      await renderDetail($c, customerId, setTitle);
      UI.toast('Customer saved', 'success');
    });
    $c.off('click', '.btn-recv-payment').on('click', '.btn-recv-payment', async () => {
      const fresh = await idb.get('customers', customerId);
      const result = await receivePaymentModal(fresh);
      if (result) {
        UI.toast(`Payment of ${cur()} ${fmtNum(result.amount)} recorded`, 'success');
        await renderDetail($c, customerId, setTitle);
      }
    });
  }
  draw();
}
