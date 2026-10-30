// Kominictví Klimesch – hlavní soubor aplikace (menu, přepínání obrazovek, start)
import { openDb, requestPersistence, purgeTrash } from './db.js';
import { loadSettings, settings } from './settings.js';
import { seedIfEmpty } from './seed.js';
import { html, icon, toast } from './ui.js';
import * as dnes from './views/dnes.js';
import * as nastaveni from './views/nastaveni.js';
import * as soon from './views/soon.js';
import * as zakaznici from './views/zakaznici.js';
import * as karta from './views/karta.js';
import * as zakaznikForm from './views/zakaznik-form.js';
import * as navsteva from './views/navsteva.js';
import * as poptavky from './views/poptavky.js';
import * as kalendar from './views/kalendar.js';
import * as mapa from './views/mapa.js';

import { APP_VERSION } from './version.js';
export { APP_VERSION };

const MENU = [
  { id: 'dnes', label: 'Dnes', icon: 'today', view: dnes },
  { id: 'poptavky', label: 'Poptávky', icon: 'inbox', view: poptavky },
  { id: 'kalendar', label: 'Kalendář', icon: 'calendar', view: kalendar },
  { id: 'zakaznici', label: 'Zákazníci', icon: 'users', view: zakaznici },
  { id: 'mapa', label: 'Mapa', icon: 'map', view: mapa },
  { id: 'historie', label: 'Historie', icon: 'history', view: soon, stage: 6 },
  { id: 'finance', label: 'Finance', icon: 'finance', view: soon, stage: 6 },
];
const SETTINGS_ITEM = { id: 'nastaveni', label: 'Nastavení', icon: 'settings', view: nastaveni };
// Podstránky bez vlastní položky v menu (zvýrazní se jejich rodič)
const SUBPAGES = [
  { id: 'karta', parent: 'zakaznici', view: karta },
  { id: 'zakaznik', parent: 'zakaznici', view: zakaznikForm },
  { id: 'navsteva', parent: 'dnes', view: navsteva },
];
const ALL = [...MENU, SETTINGS_ITEM, ...SUBPAGES];

// Adresa obrazovky: #dnes, #nastaveni-firma, #karta-<id> …
function parseRoute() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'dnes').split(/[-/]/);
  return { id: parts[0], args: parts.slice(1) };
}

export function go(path) { location.hash = '#' + path.replace(/\//g, '-'); }

function renderNav(activeId) {
  const s = settings();
  const item = (m) => html`<a href="#${m.id}" class="${m.id === activeId ? 'on' : ''}" aria-current="${m.id === activeId ? 'page' : 'false'}">${icon(m.icon)}<span>${m.label}</span></a>`;
  document.getElementById('nav').innerHTML = String(html`
    <div class="logo"><img src="icons/logo.png" alt="Kominictví Klimesch"></div>
    ${MENU.map(item)}
    <div class="spacer"></div>
    ${s.rezim.zkusebni ? html`<div class="trial">ZKUŠEBNÍ<br>REŽIM</div>` : ''}
    ${item(SETTINGS_ITEM)}
  `);
}

async function renderView() {
  const { id, args } = parseRoute();
  const entry = ALL.find((m) => m.id === id) || MENU[0];
  renderNav(entry.parent || entry.id);
  const el = document.getElementById('view');
  try {
    await entry.view.render(el, { args, entry, go });
  } catch (err) {
    console.error(err);
    el.innerHTML = String(html`<div class="soon"><h2>Něco se pokazilo</h2><p>${err.message}</p></div>`);
  }
  el.scrollTop = 0;
}

async function start() {
  if (!('indexedDB' in window)) {
    document.getElementById('view').textContent = 'Tento prohlížeč neumí ukládat data. Otevři aplikaci v Safari.';
    return;
  }
  await openDb();
  await loadSettings();
  const seeded = await seedIfEmpty();
  purgeTrash().catch(() => {});
  requestPersistence().catch(() => {});
  window.addEventListener('hashchange', renderView);
  await renderView();
  if (seeded) toast('Vítej! Aplikace běží ve zkušebním režimu s ukázkovými zákazníky.');

  // Offline režim: service worker (jen na vlastní adrese aplikace, ne v náhledu)
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claude.ai') && !location.hostname.endsWith('claudeusercontent.com')) {
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
    // nová verze aplikace → jednou obnovit obrazovku
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
}

start();
