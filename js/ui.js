// Pomocné funkce pro vykreslování
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Šablona: html`<b>${jmeno}</b>` – hodnoty se automaticky ošetří; raw() pro hotové HTML
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return new Raw(out);
}
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

// Ikony (jednoduché čárové SVG)
const ICONS = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  today: '<path d="M4 6h16v14H4z"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M8 14h3v3H8z"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  calendar: '<path d="M4 6h16v14H4z"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
  map: '<path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13M15 6.5v13"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  finance: '<path d="M3 20h18"/><path d="M6 16v-5M11 16V7M16 16v-8M20 16V5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2.5-5 .3 1.6 1 2.6 2 3 0-3 0-5.5.5-8z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
};
export function icon(name) {
  return raw(`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

// Datum a čas česky
const DAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const MONTHS_NOM = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtDate = (d) => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
export const fmtDateShort = (d) => `${d.getDate()}. ${d.getMonth() + 1}.`;
export const fmtDayLong = (d) => `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
export const monthName = (m) => MONTHS_NOM[m];
const MONTHS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
export const monthShort = (m) => MONTHS_SHORT[m];
export const fmtMoney = (n) => `${Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ')} Kč`;
export const fmtPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^(?:420)?(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3') || p;

// Krátké oznámení dole
let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Jednoduché dialogové okno; vrací Promise s hodnotou tlačítka
export function modal({ title, body = '', actions = [{ label: 'Zavřít', value: null }], onOpen = null }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = String(html`
      <div class="modal-back">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
          <h2>${title}</h2>
          <div>${raw(String(body))}</div>
          <div class="actions">
            ${actions.map((a, i) => html`<button type="button" class="btn ${a.kind || ''}" data-i="${i}">${a.label}</button>`)}
          </div>
        </div>
      </div>`);
    root.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const a = actions[Number(b.dataset.i)];
      const value = typeof a.value === 'function' ? a.value(root) : a.value;
      root.innerHTML = '';
      resolve(value);
    }));
    if (onOpen) onOpen(root);
  });
}
