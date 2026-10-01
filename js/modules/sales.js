// Sales — bills history and bill detail with receipt preview + print.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtDate, fmtDateTime, round2, num, nowISO, today, monthStart } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import * as Printer from '../printer/printer.js';
import { buildSaleReceipt, toHTML } from '../printer/receipt.js';
import * as Catalog from '../services/catalog.js';

const $ = window.jQuery;
const cur = () => getSettings().currency;

function statusBadge(s) {
  if (s.status === 'void') return '<span class="badge bg-secondary">Void</span>';
  if (!s.balance || s.balance < 0.005) return '<span class="badge bill-status-paid bg-success-subtle text-success">Paid</span>';
  if (s.paid > 0.005) return '<span class="badge" style="background:rgba(197,124,0,.12);color:#a06300">Partial</span>';
  return '<span class="badge bg-danger-subtle text-danger">Unpaid</span>';
}

async function loadSales(from, to) {
  const all = await idb.getAll('sales');
  return all.filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Bill detail ───────────────────────────────────────────────────────────────
async function renderDetail($c, saleId, setTitle) {
  $c.html(`<div class="text-center py-5"><div class="spinner-border text-warning"></div></div>`);
  const sale = await idb.get('sales', saleId);
  if (!sale) { $c.html(`<div class="alert alert-danger m-2">Bill not found.</div>`); return; }
  setTitle(sale.number);

  const model = buildSaleReceipt(sale);
  const previewHTML = toHTML(model, getSettings().printer.width);

  $c.html(`
    <div class="page-header">
      <a href="#/sales" class="btn btn-light btn-sm"><i class="bi bi-arrow-left"></i></a>
      <h1>${esc(sale.number)}</h1>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary btn-sm btn-print-bill"><i class="bi bi-printer me-1"></i>Print</button>
        ${sale.status !== 'void' ? `<button class="btn btn-outline-danger btn-sm btn-void-bill"><i class="bi bi-x-circle me-1"></i>Void</button>` : ''}
      </div>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-4"><div class="stat-card card p-2 text-center"><div class="stat-label">Total</div><div class="fw-bold money">${cur()} ${fmtNum(sale.total)}</div></div></div>
      <div class="col-4"><div class="stat-card card p-2 text-center"><div class="stat-label">Paid</div><div class="fw-bold money text-success">${cur()} ${fmtNum(sale.paid)}</div></div></div>
      <div class="col-4"><div class="stat-card card p-2 text-center"><div class="stat-label">${sale.balance > 0.005 ? 'Due' : 'Status'}</div><div class="fw-bold">${sale.balance > 0.005 ? `<span class="text-danger money">${cur()} ${fmtNum(sale.balance)}</span>` : statusBadge(sale)}</div></div></div>
    </div>
    ${sale.status === 'void' ? '<div class="alert alert-secondary py-2 mb-3"><i class="bi bi-x-circle me-2"></i>This bill has been voided.</div>' : ''}
    ${sale.balance > 0.005 && sale.status !== 'void' ? `<button class="btn btn-primary w-100 mb-3 btn-recv-part"><i class="bi bi-cash-coin me-2"></i>Record Payment</button>` : ''}
    <div class="section-heading mb-2">Receipt Preview</div>
    <div class="receipt-preview">${previewHTML}</div>
    <div class="small text-body-secondary text-center mt-2">${fmtDateTime(sale.createdAt)}</div>
  `);

  $c.on('click', '.btn-print-bill', () => Printer.printSale(sale, { silentFail: false }));

  $c.on('click', '.btn-void-bill', async () => {
    if (!await UI.confirmDialog(`Void bill ${sale.number}? This cannot be undone.`, { okLabel: 'Void Bill', okClass: 'btn-danger' })) return;
    await idb.write(['sales', 'customers'], async (tx) => {
      await tx.put('sales', { ...sale, status: 'void', updatedAt: nowISO() });
      // Restore customer balance
      if (sale.customerId && sale.balance > 0) {
        const cust = await tx.get('customers', sale.customerId);
        if (cust) await tx.put('customers', { ...cust, balance: round2(Math.max(0, (cust.balance || 0) - sale.balance)), updatedAt: nowISO() });
      }
    });
    if (sale.customerId) await Catalog.refreshCustomer(sale.customerId);
    UI.toast('Bill voided', 'warning');
    await renderDetail($c, saleId, setTitle);
  });

  $c.on('click', '.btn-recv-part', async () => {
    const fresh = await idb.get('sales', saleId);
    const result = await UI.formModal({
      title: 'Record Payment',
      body: `
        <div class="mb-3 p-3 rounded" style="background:var(--zw-gold-soft)">
          <div class="small text-body-secondary">Balance Due</div>
          <div class="fw-bold fs-5 money">${cur()} ${fmtNum(fresh.balance)}</div>
        </div>
        <div class="mb-3"><label class="form-label">Amount (${cur()}) *</label>
          <input name="amount" type="number" class="form-control" min="0.01" step="1" required value="${fmtNum(fresh.balance)}"></div>`,
      submitLabel: 'Record Payment',
      async onSubmit(vals) {
        const amount = num(vals.amount);
        if (amount <= 0) throw new Error('Amount must be > 0');
        const newPaid    = round2(fresh.paid + amount);
        const newBalance = round2(Math.max(0, fresh.total - newPaid));
        await idb.write(['sales', 'customers'], async (tx) => {
          await tx.put('sales', { ...fresh, paid: newPaid, balance: newBalance, updatedAt: nowISO() });
          if (fresh.customerId) {
            const cust = await tx.get('customers', fresh.customerId);
            if (cust) {
              const reduction = Math.min(amount, cust.balance || 0);
              await tx.put('customers', { ...cust, balance: round2((cust.balance || 0) - reduction), updatedAt: nowISO() });
            }
          }
        });
        if (fresh.customerId) await Catalog.refreshCustomer(fresh.customerId);
        return true;
      },
    });
    if (result) {
      UI.toast('Payment recorded', 'success');
      await renderDetail($c, saleId, setTitle);
    }
  });
}

// ── Sales list ────────────────────────────────────────────────────────────────
export default {
  async render(container, { params, setTitle }) {
    const $c = $(container);
    const saleId = params?.[0];
    if (saleId) { await renderDetail($c, saleId, setTitle); return; }

    setTitle('Bills');
    let from = monthStart(), to = today();

    async function draw() {
      const sales = await loadSales(from, to);
      const totSales = sales.filter((s) => s.status !== 'void').reduce((s, x) => s + x.total, 0);
      const totOutstanding = sales.filter((s) => s.status !== 'void').reduce((s, x) => s + (x.balance || 0), 0);

      $c.html(`
        <div class="page-header">
          <h1>Bills</h1>
          <a href="#/pos" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>New</a>
        </div>
        <form class="filters date-filter mb-3">
          <div><label class="form-label small mb-0">From</label><input type="date" name="from" class="form-control form-control-sm" value="${esc(from)}"></div>
          <div><label class="form-label small mb-0">To</label><input type="date" name="to" class="form-control form-control-sm" value="${esc(to)}"></div>
          <div class="d-flex align-items-end gap-1" style="flex:0 0 auto">
            <div class="btn-group btn-group-sm">
              <button type="button" class="btn btn-outline-secondary" data-range="today">Today</button>
              <button type="button" class="btn btn-outline-secondary" data-range="month">Month</button>
              <button type="button" class="btn btn-outline-secondary" data-range="all">All</button>
            </div>
            <button class="btn btn-primary btn-sm">Go</button>
          </div>
        </form>
        <div class="row g-2 mb-3">
          <div class="col-6">
            <div class="stat-card card p-2 text-center">
              <div class="stat-label">Sales (${sales.filter((s)=>s.status!=='void').length} bills)</div>
              <div class="fw-bold money">${cur()} ${fmtNum(totSales)}</div>
            </div>
          </div>
          <div class="col-6">
            <div class="stat-card card p-2 text-center">
              <div class="stat-label">Outstanding</div>
              <div class="fw-bold money ${totOutstanding > 0.005 ? 'text-danger' : 'text-success'}">${cur()} ${fmtNum(totOutstanding)}</div>
            </div>
          </div>
        </div>
        <div class="list-card">
          ${sales.length ? sales.map((s) => `
            <a href="#/sales/${encodeURIComponent(s.id)}" class="list-row ${s.status === 'void' ? 'bill-void' : ''}">
              <div class="avatar avatar-gold"><i class="bi bi-receipt"></i></div>
              <div class="main">
                <div class="title">${esc(s.number)}${s.customerName ? ` — ${esc(s.customerName)}` : ''}</div>
                <div class="sub">${fmtDate(s.date)} &nbsp;·&nbsp; ${s.items?.length || 0} item${(s.items?.length || 0) !== 1 ? 's' : ''}</div>
              </div>
              <div class="end">
                <div class="fw-bold money">${cur()} ${fmtNum(s.total)}</div>
                <div class="mt-1">${statusBadge(s)}</div>
              </div>
            </a>`).join('') : `<div class="empty-state"><i class="bi bi-receipt"></i><div class="empty-title">No bills in this period</div></div>`}
        </div>`);

      $c.off('submit', '.date-filter').on('submit', '.date-filter', (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        from = fd.from || '2000-01-01'; to = fd.to || today(); draw();
      });
      $c.off('click', '[data-range]').on('click', '[data-range]', function () {
        const r = $(this).data('range');
        if (r === 'today')  { from = to = today(); }
        else if (r === 'month') { from = monthStart(); to = today(); }
        else { from = '2000-01-01'; to = today(); }
        $c.find('[name=from]').val(from); $c.find('[name=to]').val(to); draw();
      });
    }

    await draw();
  },
};
