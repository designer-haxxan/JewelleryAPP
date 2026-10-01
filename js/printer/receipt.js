// Builds a printer-independent receipt model and renders to ESC/POS bytes or HTML.
import { getSettings } from '../core/settings.js';
import { fmtNum, fmtQty, fmtDate, esc } from '../core/utils.js';
import { EscPos, isPlain } from './escpos.js';
import * as Raster from './raster.js';

// Build the receipt model from a sale object (with embedded items[]).
export function buildSaleReceipt(sale) {
  const b = getSettings().business;
  const m = {
    header: [b.name, b.address, b.phone ? 'Tel: ' + b.phone : ''].filter(Boolean),
    title: sale.status === 'void' ? 'SALES RECEIPT (VOID)' : 'SALES RECEIPT',
    info: [['Bill #', sale.number], ['Date', fmtDate(sale.date)]],
    items: [],
    totals: [],
    footer: b.footer || '',
    void: sale.status === 'void',
    payment: sale.paymentNote || (sale.paid >= sale.total ? 'Cash' : 'Credit'),
    note: sale.note || '',
  };
  if (sale.customerName) m.info.push(['Customer', sale.customerName]);
  if (sale.customerPhone) m.info.push(['Phone', sale.customerPhone]);
  m.items = (sale.items || []).map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, rate: i.rate, amount: i.amount }));
  m.totals.push(['Subtotal', sale.subtotal]);
  if (sale.discount) m.totals.push(['Discount', -sale.discount]);
  m.totals.push(['TOTAL', sale.total, true]);
  m.totals.push(['Paid', sale.paid]);
  if (sale.balance > 0.005) m.totals.push(['Balance Due', sale.balance, true]);
  if (sale.balance < -0.005) m.totals.push(['Change', -sale.balance]);
  return m;
}

// ESC/POS bytes from a receipt model.
export async function toEscPos(m, width = 58) {
  await Raster.ensureFont();
  const p = new EscPos(width, Raster, { imageMode: getSettings().printer.imageMode });
  const cur = getSettings().currency;
  p.align('center');
  m.header.forEach((h, i) => {
    if (i === 0) p.bold(true).size(true).wrap(h, Math.floor(p.cols / 2)).size(false).bold(false);
    else p.wrap(h);
  });
  p.hr().bold(true).line(m.title).bold(false);
  if (m.void) p.bold(true).line('*** VOID ***').bold(false);
  p.align('left');
  m.info.forEach(([k, v]) => p.lr(k + ':', String(v ?? '')));
  if (m.items.length) {
    p.hr();
    m.items.forEach((i) => {
      p.wrap(i.name);
      p.lr(`  ${fmtQty(i.qty)} ${i.unit || ''} x ${fmtNum(i.rate)}`, fmtNum(i.amount));
    });
  }
  p.hr();
  m.totals.forEach(([k, v, strong]) => {
    if (strong) p.bold(true);
    p.lr(k, `${v < 0 ? '-' : ''}${cur} ${fmtNum(Math.abs(v))}`);
    if (strong) p.bold(false);
  });
  if (m.payment) p.lr('Payment', m.payment);
  if (m.note) { p.hr(); p.wrap('Note: ' + m.note); }
  p.hr().align('center');
  if (m.footer) p.wrap(m.footer);
  p.feed(3).cut();
  return p.bytes();
}

// HTML preview from a receipt model.
const t = (s) => (isPlain(s) ? esc(s) : `<span class="ur" dir="auto">${esc(s)}</span>`);
export function toHTML(m, width = 58) {
  const cur = esc(getSettings().currency);
  const row = (l, r, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="r">${r}</td></tr>`;
  return `<div class="receipt w${Number(width) === 80 ? 80 : 58}">
    ${m.header.map((h, i) => `<div class="c ${i === 0 ? 'b big' : ''}">${t(h)}</div>`).join('')}
    <hr><div class="c b">${esc(m.title)}</div>${m.void ? '<div class="c b">*** VOID ***</div>' : ''}
    <table>${m.info.map(([k, v]) => row(esc(k) + ':', t(v))).join('')}</table>
    ${m.items.length ? '<hr><table>' + m.items.map((i) =>
      `<tr><td colspan="2">${t(i.name)}</td></tr>
       ${row(`&nbsp;&nbsp;${fmtQty(i.qty)} ${esc(i.unit || '')} × ${cur} ${fmtNum(i.rate)}`, fmtNum(i.amount))}`
    ).join('') + '</table>' : ''}
    <hr><table>
    ${m.totals.map(([k, v, strong]) => row(esc(k), `${v < 0 ? '-' : ''}${cur} ${fmtNum(Math.abs(v))}`, strong ? 'b' : '')).join('')}
    ${m.payment ? row('Payment', t(m.payment)) : ''}
    </table>
    ${m.note ? `<hr><div>Note: ${t(m.note)}</div>` : ''}
    <hr>${m.footer ? `<div class="c">${t(m.footer)}</div>` : ''}</div>`;
}
