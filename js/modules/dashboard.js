// Dashboard — today's stats + quick actions + recent bills.
import * as idb from '../db/idb.js';
import { esc, fmtNum, today, monthStart } from '../core/utils.js';
import { getSettings } from '../core/settings.js';

const $ = window.jQuery;
const cur = () => getSettings().currency;

async function loadStats() {
  const todayStr = today();
  const monthStr = monthStart();

  const sales = await idb.getAll('sales');
  const active = sales.filter((s) => s.status !== 'void');

  let todaySales = 0, todayCount = 0;
  let monthSales = 0, outstanding = 0;

  for (const s of active) {
    if (s.date === todayStr) { todaySales += s.total; todayCount++; }
    if (s.date >= monthStr) monthSales += s.total;
    outstanding += s.balance || 0;
  }

  const recentSales = [...active]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  const customerCount = (await idb.getAll('customers')).length;
  const productCount = (await idb.getAllByIndex('products', 'active', 1)).length;

  return { todaySales, todayCount, monthSales, outstanding, recentSales, customerCount, productCount };
}

function statCard(icon, iconClass, label, value, sub = '') {
  return `<div class="stat-card card p-3 d-flex flex-row align-items-center gap-3">
    <div class="stat-icon ${iconClass}"><i class="bi bi-${icon}"></i></div>
    <div class="flex-grow-1 min-w-0">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value money">${esc(value)}</div>
      ${sub ? `<div class="stat-label mt-0">${esc(sub)}</div>` : ''}
    </div></div>`;
}

function billStatusHtml(s) {
  if (!s.balance || s.balance < 0.005) return '<span class="badge bill-status-paid bg-success-subtle text-success">Paid</span>';
  if (s.paid > 0.005) return `<span class="badge bill-status-partial" style="background:rgba(197,124,0,.12);color:#a06300">Partial</span>`;
  return '<span class="badge bill-status-unpaid bg-danger-subtle text-danger">Unpaid</span>';
}

export default {
  async render(container) {
    const s = getSettings();
    container.innerHTML = `
      <div class="d-flex align-items-center gap-2 mb-3">
        <i class="bi bi-gem" style="color:var(--zw-gold);font-size:1.3rem"></i>
        <h1 class="h5 mb-0 fw-bold">${esc(s.business.name || 'Zewar POS')}</h1>
      </div>
      <div id="dash-stats" class="row g-2 mb-3"></div>
      <div class="section-heading mt-3">Quick Actions</div>
      <div class="quick-grid mb-4" id="quick-actions"></div>
      <div class="section-heading">Recent Bills</div>
      <div class="list-card" id="recent-bills"><div class="text-center py-4 text-body-secondary"><div class="spinner-border spinner-border-sm"></div></div></div>`;

    const $root = $(container);

    // Quick actions
    $root.find('#quick-actions').html(`
      <a href="#/pos"       class="quick-action"><i class="bi bi-cart-plus-fill"></i>New Bill</a>
      <a href="#/customers" class="quick-action"><i class="bi bi-people-fill"></i>Customers</a>
      <a href="#/products"  class="quick-action"><i class="bi bi-box-seam"></i>Products</a>
      <a href="#/sales"     class="quick-action"><i class="bi bi-receipt"></i>Bills</a>
    `);

    // Stats
    const st = await loadStats();
    $root.find('#dash-stats').html(`
      <div class="col-6 col-md-3">${statCard('cash-coin',       'stat-icon-gold',  'Today Sales',   `${cur()} ${fmtNum(st.todaySales)}`, `${st.todayCount} bill${st.todayCount !== 1 ? 's' : ''}`)}</div>
      <div class="col-6 col-md-3">${statCard('calendar3',       'stat-icon-blue',  'This Month',    `${cur()} ${fmtNum(st.monthSales)}`)}</div>
      <div class="col-6 col-md-3">${statCard('exclamation-circle-fill','stat-icon-red', 'Outstanding',`${cur()} ${fmtNum(st.outstanding)}`)}</div>
      <div class="col-6 col-md-3">${statCard('people-fill',     'stat-icon-green', 'Customers',     `${st.customerCount}`, `${st.productCount} products`)}</div>
    `);

    // Recent bills
    const $rb = $root.find('#recent-bills');
    if (!st.recentSales.length) {
      $rb.html(`<div class="empty-state"><i class="bi bi-receipt"></i><div class="empty-title">No bills yet</div><div class="empty-sub">Tap New Bill to get started</div></div>`);
    } else {
      $rb.html(st.recentSales.map((s) => `
        <a href="#/sales/${encodeURIComponent(s.id)}" class="list-row">
          <div class="avatar avatar-gold"><i class="bi bi-receipt"></i></div>
          <div class="main">
            <div class="title">${esc(s.number)} ${s.customerName ? `— ${esc(s.customerName)}` : ''}</div>
            <div class="sub">${esc(s.date)} &nbsp;·&nbsp; ${st.recentSales.indexOf(s) === 0 ? 'Latest' : ''}</div>
          </div>
          <div class="end">
            <div class="fw-bold money">${cur()} ${fmtNum(s.total)}</div>
            <div class="mt-1">${billStatusHtml(s)}</div>
          </div>
        </a>`).join(''));
    }
  },
};
