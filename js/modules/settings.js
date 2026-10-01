// Settings — shop info, receipt, Bluetooth printer, PIN, theme.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc } from '../core/utils.js';
import { getSettings, saveSettings } from '../core/settings.js';
import * as Printer from '../printer/printer.js';

const $ = window.jQuery;

function renderPrinterStatus() {
  const connected = Printer.isConnected();
  const name = Printer.connectedName() || getSettings().printer.deviceName || 'No printer connected';
  return `<div class="printer-status">
    <div class="printer-dot ${connected ? 'connected' : ''}"></div>
    <span class="small ${connected ? 'text-success' : 'text-body-secondary'}">${esc(connected ? name + ' — Connected' : name)}</span>
  </div>`;
}

function chk(val) { return val ? 'checked' : ''; }

export default {
  async render(container, { setTitle }) {
    setTitle('Settings');
    const $c = $(container);

    function draw() {
      const s = getSettings();
      const cap = Printer.capabilities();

      $c.html(`
        <!-- ── Business Info ── -->
        <div class="settings-section">
          <div class="settings-head"><i class="bi bi-shop me-2"></i>Business Info</div>
          <div class="settings-body">
            <form id="biz-form">
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Shop Name <span class="text-danger">*</span></div><div class="sr-desc">Appears on every receipt</div></div>
                <input name="name" class="form-control form-control-sm w-auto" style="max-width:210px" value="${esc(s.business.name)}" required placeholder="My Jewellery Shop">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Owner / Contact</div></div>
                <input name="owner" class="form-control form-control-sm w-auto" style="max-width:210px" value="${esc(s.business.owner)}" placeholder="Muhammad Ali">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Address</div></div>
                <input name="address" class="form-control form-control-sm w-auto" style="max-width:220px" value="${esc(s.business.address)}" placeholder="Shop #12, Anarkali Bazar">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">City</div></div>
                <input name="city" class="form-control form-control-sm w-auto" style="max-width:160px" value="${esc(s.business.city)}" placeholder="Lahore">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Phone</div></div>
                <input name="phone" class="form-control form-control-sm w-auto" style="max-width:200px" value="${esc(s.business.phone)}" placeholder="0300-0000000">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Email</div><div class="sr-desc">Optional, for receipt</div></div>
                <input name="email" type="email" class="form-control form-control-sm w-auto" style="max-width:210px" value="${esc(s.business.email)}" placeholder="shop@example.com">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">NTN / STRN</div><div class="sr-desc">Pakistan tax number</div></div>
                <input name="ntn" class="form-control form-control-sm w-auto" style="max-width:180px" value="${esc(s.business.ntn)}" placeholder="1234567-8">
              </div>
              <div class="settings-row justify-content-end">
                <button type="submit" class="btn btn-primary btn-sm px-4">Save Info</button>
              </div>
            </form>
          </div>
        </div>

        <!-- ── Receipt Options ── -->
        <div class="settings-section">
          <div class="settings-head"><i class="bi bi-receipt me-2"></i>Receipt &amp; Billing</div>
          <div class="settings-body">
            <form id="receipt-form">
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Bill Prefix</div><div class="sr-desc">e.g. BILL → BILL-0001</div></div>
                <input name="billPrefix" class="form-control form-control-sm w-auto" style="max-width:100px" value="${esc(s.billPrefix || 'BILL')}">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Receipt Footer</div><div class="sr-desc">Printed at bottom</div></div>
                <input name="footer" class="form-control form-control-sm w-auto" style="max-width:240px" value="${esc(s.business.footer)}">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Custom Header Message</div><div class="sr-desc">Printed above item list</div></div>
                <input name="headerMsg" class="form-control form-control-sm w-auto" style="max-width:240px" value="${esc(s.receipt.headerMsg)}" placeholder="Optional">
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Show Owner Name</div><div class="sr-desc">Print on receipt</div></div>
                <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" name="showOwner" ${chk(s.receipt.showOwner)}></div>
              </div>
              <div class="settings-row">
                <div class="flex-grow-1"><div class="sr-label">Show NTN / STRN</div><div class="sr-desc">Print on receipt</div></div>
                <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" name="showNtn" ${chk(s.receipt.showNtn)}></div>
              </div>
              <div class="settings-row justify-content-end">
                <button type="submit" class="btn btn-primary btn-sm px-4">Save Receipt</button>
              </div>
            </form>

            <!-- Bill counter -->
            <div class="settings-row" id="bill-counter-row">
              <div class="flex-grow-1"><div class="sr-label">Bill Counter</div><div class="sr-desc text-body-secondary small" id="bill-no-hint">Loading…</div></div>
              <button class="btn btn-outline-danger btn-sm btn-reset-counter">Reset Counter</button>
            </div>
          </div>
        </div>

        <!-- ── Bluetooth Printer ── -->
        <div class="settings-section">
          <div class="settings-head"><i class="bi bi-printer me-2"></i>Bluetooth Printer</div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="flex-grow-1"><div class="sr-label">Printer</div><div id="printer-status">${renderPrinterStatus()}</div></div>
              <button class="btn btn-outline-primary btn-sm btn-connect-bt">${Printer.isConnected() ? 'Change' : 'Connect'}</button>
            </div>
            ${!cap.webBluetooth ? `<div class="settings-row"><div class="small text-warning"><i class="bi bi-exclamation-triangle me-1"></i>${esc(cap.note)}</div></div>` : ''}
            <div class="settings-row">
              <div class="sr-label">Paper Width</div>
              <select class="form-select form-select-sm w-auto" id="paper-width">
                <option value="58" ${s.printer.width == 58 ? 'selected' : ''}>58mm (narrow)</option>
                <option value="80" ${s.printer.width == 80 ? 'selected' : ''}>80mm (wide)</option>
              </select>
            </div>
            <div class="settings-row">
              <div class="flex-grow-1"><div class="sr-label">Chunk Size</div><div class="sr-desc">Bytes per write — 20 is safest</div></div>
              <select class="form-select form-select-sm w-auto" id="chunk-size">
                <option value="20"  ${s.printer.chunkSize == 20  ? 'selected' : ''}>20 (safe)</option>
                <option value="100" ${s.printer.chunkSize == 100 ? 'selected' : ''}>100 (fast)</option>
                <option value="180" ${s.printer.chunkSize == 180 ? 'selected' : ''}>180 (very fast)</option>
              </select>
            </div>
            <div class="settings-row justify-content-end gap-2">
              ${Printer.isConnected() ? `<button class="btn btn-sm btn-outline-secondary btn-disconnect">Disconnect</button>` : ''}
              <button class="btn btn-sm btn-outline-primary btn-test-print">Test Print</button>
            </div>
          </div>
        </div>

        <!-- ── Print Method ── -->
        <div class="settings-section">
          <div class="settings-head"><i class="bi bi-gear me-2"></i>Print Method</div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="sr-label">Method</div>
              <select class="form-select form-select-sm w-auto" id="print-method">
                <option value="bluetooth" ${s.printer.method === 'bluetooth' ? 'selected' : ''}>Bluetooth (BLE)</option>
                <option value="rawbt"     ${s.printer.method === 'rawbt'     ? 'selected' : ''}>RawBT (Android app)</option>
                <option value="browser"   ${s.printer.method === 'browser'   ? 'selected' : ''}>Browser Print Dialog</option>
              </select>
            </div>
          </div>
        </div>

        <!-- ── Security ── -->
        <div class="settings-section">
          <div class="settings-head"><i class="bi bi-shield-lock me-2"></i>Security</div>
          <div class="settings-body">
            <form id="pin-form">
              <div class="settings-row">
                <div class="flex-grow-1">
                  <div class="sr-label">App PIN</div>
                  <div class="sr-desc">${s.pin ? '4-digit PIN is set. Enter new PIN to change, or leave blank to remove.' : 'Set a 4-digit PIN to lock the app on startup.'}</div>
                </div>
                <div class="d-flex gap-2 align-items-center">
                  <input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}"
                    class="form-control form-control-sm" style="width:100px;letter-spacing:.2em"
                    placeholder="${s.pin ? '••••' : '0000'}" autocomplete="new-password">
                  <button type="submit" class="btn btn-outline-primary btn-sm">${s.pin ? 'Change' : 'Set PIN'}</button>
                </div>
              </div>
              ${s.pin ? `<div class="settings-row justify-content-end"><button type="button" class="btn btn-outline-danger btn-sm btn-remove-pin">Remove PIN</button></div>` : ''}
            </form>
          </div>
        </div>

        <!-- ── Appearance ── -->
        <div class="settings-section">
          <div class="settings-head"><i class="bi bi-palette me-2"></i>Appearance</div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="sr-label">Theme</div>
              <div class="btn-group btn-group-sm">
                <button class="btn ${s.theme === 'light' ? 'btn-primary' : 'btn-outline-secondary'} theme-btn" data-t="light"><i class="bi bi-sun me-1"></i>Light</button>
                <button class="btn ${s.theme === 'auto'  ? 'btn-primary' : 'btn-outline-secondary'} theme-btn" data-t="auto"><i class="bi bi-circle-half me-1"></i>Auto</button>
                <button class="btn ${s.theme === 'dark'  ? 'btn-primary' : 'btn-outline-secondary'} theme-btn" data-t="dark"><i class="bi bi-moon me-1"></i>Dark</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── About ── -->
        <div class="settings-section">
          <div class="settings-head"><i class="bi bi-info-circle me-2"></i>About</div>
          <div class="settings-body">
            <div class="settings-row"><div class="sr-label">App</div><span class="text-body-secondary small">Zewar POS v1.0.0 — Offline / Local only</span></div>
            <div class="settings-row"><div class="sr-label">Business Type</div><span class="text-body-secondary small">Imitation Jewellery Wholesale</span></div>
          </div>
        </div>
      `);

      // --- Load current bill no ---
      idb.get('meta', 'nextBillNo').then((m) => {
        const n = m?.value || 1;
        const prefix = getSettings().billPrefix || 'BILL';
        $('#bill-no-hint').text(`Next bill: ${prefix}-${String(n).padStart(4, '0')}`);
      });

      // --- Business info ---
      $c.off('submit', '#biz-form').on('submit', '#biz-form', (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        saveSettings({ business: { name: fd.name, owner: fd.owner, address: fd.address, city: fd.city, phone: fd.phone, email: fd.email, ntn: fd.ntn } });
        UI.toast('Business info saved', 'success');
      });

      // --- Receipt form ---
      $c.off('submit', '#receipt-form').on('submit', '#receipt-form', (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        saveSettings({
          billPrefix: (fd.billPrefix || 'BILL').trim().toUpperCase(),
          business: { footer: fd.footer },
          receipt: { headerMsg: fd.headerMsg, showOwner: !!fd.showOwner, showNtn: !!fd.showNtn },
        });
        UI.toast('Receipt settings saved', 'success');
        idb.get('meta', 'nextBillNo').then((m) => {
          const prefix = (fd.billPrefix || 'BILL').trim().toUpperCase();
          $('#bill-no-hint').text(`Next bill: ${prefix}-${String(m?.value || 1).padStart(4, '0')}`);
        });
      });

      // --- Reset bill counter ---
      $c.off('click', '.btn-reset-counter').on('click', '.btn-reset-counter', async () => {
        if (!await UI.confirmDialog('Reset bill counter to 1? This only affects the number — old bills are not deleted.', { okLabel: 'Reset', okClass: 'btn-danger' })) return;
        await idb.write(['meta'], (tx) => tx.put('meta', { key: 'nextBillNo', value: 1 }));
        const prefix = getSettings().billPrefix || 'BILL';
        $('#bill-no-hint').text(`Next bill: ${prefix}-0001`);
        UI.toast('Bill counter reset to 1', 'info');
      });

      // --- Bluetooth ---
      $c.off('click', '.btn-connect-bt').on('click', '.btn-connect-bt', async () => {
        try {
          const name = await Printer.connectBluetooth();
          UI.toast(`Connected: ${name}`, 'success');
          $c.find('#printer-status').html(renderPrinterStatus());
          draw();
        } catch (e) { UI.toastError(e); }
      });
      $c.off('click', '.btn-disconnect').on('click', '.btn-disconnect', () => {
        Printer.disconnect(); draw(); UI.toast('Printer disconnected', 'info');
      });
      $c.off('click', '.btn-test-print').on('click', '.btn-test-print', async () => {
        try { await Printer.testPrint(); } catch (e) { UI.toastError(e); }
      });
      $c.off('change', '#paper-width').on('change', '#paper-width', function () {
        saveSettings({ printer: { width: +$(this).val() } });
      });
      $c.off('change', '#chunk-size').on('change', '#chunk-size', function () {
        saveSettings({ printer: { chunkSize: +$(this).val() } });
      });
      $c.off('change', '#print-method').on('change', '#print-method', function () {
        saveSettings({ printer: { method: $(this).val() } });
      });

      // --- PIN ---
      $c.off('submit', '#pin-form').on('submit', '#pin-form', (e) => {
        e.preventDefault();
        const pin = $c.find('[name=pin]').val().trim();
        if (pin && !/^\d{4}$/.test(pin)) { UI.toast('PIN must be exactly 4 digits', 'warning'); return; }
        saveSettings({ pin });
        UI.toast(pin ? 'PIN set' : 'PIN removed', 'success');
        draw();
      });
      $c.off('click', '.btn-remove-pin').on('click', '.btn-remove-pin', async () => {
        if (!await UI.confirmDialog('Remove the PIN lock? Anyone with the device can open the app.', { okLabel: 'Remove PIN', okClass: 'btn-danger' })) return;
        saveSettings({ pin: '' });
        UI.toast('PIN removed', 'info');
        draw();
      });

      // --- Theme ---
      $c.off('click', '.theme-btn').on('click', '.theme-btn', function () {
        saveSettings({ theme: $(this).data('t') });
        draw();
      });
    }

    draw();
    document.addEventListener('printer:changed', draw);
    this._cleanup = () => document.removeEventListener('printer:changed', draw);
  },

  destroy() { this._cleanup?.(); },
};
