// Application bootstrap — Zewar POS (no cloud auth, offline-first).
import { CONFIG } from './config.js';
import { applyTheme, getSettings } from './core/settings.js';
import * as UI from './core/ui.js';
import { esc } from './core/utils.js';
import { openDB } from './db/idb.js';
import * as Catalog from './services/catalog.js';

const $ = window.jQuery;

// route → [loader, title, icon, menuSection]
const ROUTES = {
  dashboard: [() => import('./modules/dashboard.js'),  'Dashboard',    'house-fill',    'Main'],
  pos:       [() => import('./modules/pos.js'),         'New Bill',     'cart-plus-fill','Main'],
  sales:     [() => import('./modules/sales.js'),       'Bills',        'receipt',       'Main'],
  products:  [() => import('./modules/products.js'),    'Products',     'box-seam',      'Catalogue'],
  customers: [() => import('./modules/customers.js'),   'Customers',    'people-fill',   'Catalogue'],
  settings:  [() => import('./modules/settings.js'),    'Settings',     'gear-fill',     'App'],
};
const FOCUS_ROUTES = new Set(['pos']);

let currentModule = null;
let routeToken = 0;
let deferredInstall = null;

function showApp() {
  $('#splash, #pin-screen').addClass('d-none');
  $('#view-app').removeClass('d-none');
}
function fatal(msg) {
  $('#splash-error').text(msg);
  $('#splash .splash-spin').addClass('d-none');
}

function showPinScreen(onUnlock) {
  $('#splash').addClass('d-none');
  const $p = $('#pin-screen').removeClass('d-none');
  $('#pin-shop-name').text(getSettings().business.name || CONFIG.APP_NAME);
  let entered = '';
  const $dots = $p.find('.pin-dot');
  const updateDots = () => $dots.each(function (i) { $(this).toggleClass('filled', i < entered.length); });
  $p.off('click', '.pin-key').on('click', '.pin-key', function () {
    const k = $(this).data('k');
    if (k === 'back') { entered = entered.slice(0, -1); }
    else if (entered.length < 4) { entered += k; }
    updateDots();
    $p.find('#pin-error').addClass('d-none');
    if (entered.length === 4) {
      if (entered === getSettings().pin) { onUnlock(); }
      else {
        $p.find('#pin-error').removeClass('d-none');
        $dots.addClass('shake');
        setTimeout(() => { entered = ''; updateDots(); $dots.removeClass('shake'); }, 900);
      }
    }
  });
}

// ---------- PWA install ----------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredInstall = e; $('#install-btn').removeClass('d-none');
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null; $('#install-btn').addClass('d-none'); UI.toast('App installed');
});
export const canInstall = () => !!deferredInstall;
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt(); await deferredInstall.userChoice;
  deferredInstall = null; $('#install-btn').addClass('d-none');
  return true;
}

// ---------- Service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    const check = () => { if (!navigator.onLine) return; reg.update().catch(() => {}); };
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch((e) => console.warn('SW registration failed:', e));
  let controlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled && !reloading) { reloading = true; location.reload(); }
    controlled = true;
  });
}

// ---------- Navigation ----------
function buildMenu() {
  let html = ''; let section = '';
  for (const [name, [, title, icon, sec]] of Object.entries(ROUTES)) {
    if (!sec) continue;
    if (sec !== section) { section = sec; html += `<div class="nav-section">${esc(sec)}</div>`; }
    html += `<a class="nav-link" href="#/${name}" data-route="${name}"><i class="bi bi-${icon}"></i>${esc(title)}</a>`;
  }
  $('.nav-menu').html(html);
  $('#brand-name').text(getSettings().business.name || CONFIG.APP_NAME);
}

async function route() {
  const token = ++routeToken;
  const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/').map(decodeURIComponent);
  const name = ROUTES[parts[0]] ? parts[0] : 'dashboard';
  const [loader, title] = ROUTES[name];
  try { currentModule?.destroy?.(); } catch { /* ignore */ }
  currentModule = null;
  bootstrap.Offcanvas.getInstance('#menu-offcanvas')?.hide();
  $('.nav-menu .nav-link, #bottom-nav a').removeClass('active');
  $(`.nav-menu [data-route="${name}"], #bottom-nav [data-route="${name}"]`).addClass('active');
  $('body').toggleClass('focus-mode', FOCUS_ROUTES.has(name));
  $('#topbar-title').text(title);
  const $c = $('#content').off();
  $c.html(UI.spinner());
  try {
    const mod = (await loader()).default;
    if (token !== routeToken) return;
    currentModule = mod;
    window.scrollTo(0, 0);
    await mod.render($c[0], { route: name, params: parts.slice(1), setTitle: (t) => $('#topbar-title').text(t) });
  } catch (e) {
    console.error(e);
    if (token === routeToken) $c.html(UI.errorState(e));
  }
}

async function startApp() {
  await Catalog.load();
  buildMenu();
  const s = getSettings();
  if (s.business.name) {
    $('#splash-shop').text(s.business.name).closest('#splash-shop').removeClass('d-none');
    // brief pause so the shop name shows before transition
    await new Promise((r) => setTimeout(r, 480));
  }
  if (navigator.storage?.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
  if (s.pin) {
    showPinScreen(() => { showApp(); route(); });
  } else {
    showApp();
    route();
  }
}

$('#install-btn').on('click', promptInstall);
window.addEventListener('hashchange', route);
document.addEventListener('settings:changed', () => {
  applyTheme();
  $('#brand-name').text(getSettings().business.name || CONFIG.APP_NAME);
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- Boot ----------
(async function boot() {
  applyTheme();
  registerSW();
  if (!window.jQuery || !window.bootstrap) return fatal('Required libraries failed to load. Connect to the internet once so the app can be cached for offline use.');
  try { await openDB(); } catch (e) { return fatal('Could not open the local database: ' + (e.message || e)); }
  try { await startApp(); } catch (e) { fatal(e.message || String(e)); }
})();
