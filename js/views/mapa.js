// Mapa – zákazníci podle lhůty a paliva, oblasti, výběr prstem, posuvník měsíců
import * as L from '../../vendor/leaflet.mjs';
import { all, put } from '../db.js';
import { settings, saveSettings } from '../settings.js';
import { displayName } from '../customers.js';
import { dueState, nextCheck, FUEL_LABEL } from '../lhuty.js';
import { createInquiry } from '../planning.js';
import { pickTermin } from '../termin.js';
import { smsQueue } from '../smsqueue.js';
import { fill, dayPhrase } from '../texts.js';
import { hasKey, tileUrl, completeAddress, mapsRouteLink } from '../mapy.js';
import { html, toast, modal, parseIso, fmtPhone, monthShort } from '../ui.js';

const state = { fuel: 'vse', month: null, area: null };
const COLORS = { overdue: '#C0392B', soon: '#E08A1E', contact: '#E0A82E', ok: '#2E8B57', none: '#8E8478', planned: '#2F6FC0' };
const STATE_LABEL = { overdue: 'propadlá', soon: 'do 30 dní', contact: 'do 3 měsíců', ok: 'platná', none: 'neznámá', planned: 'domluveno' };

function ensureCss() {
  if (document.getElementById('leaflet-css')) return;
  const l = document.createElement('link');
  l.id = 'leaflet-css'; l.rel = 'stylesheet'; l.href = 'vendor/leaflet.css';
  document.head.appendChild(l);
}

const ICON = {
  tuha: '<path d="M12 5c.8 2.8 4 4.4 4 8a4 4 0 0 1-8 0c0-2 1.2-3 2-4 .2 1.3.8 2.1 1.6 2.4 0-2.4 0-4.4.4-6.4z" fill="#fff"/>',
  plyn: '<path d="M12 5s4.5 5 4.5 8.5a4.5 4.5 0 0 1-9 0C7.5 10 12 5 12 5z" fill="#fff"/>',
  obe: '<rect x="8" y="8" width="8" height="8" rx="1.5" fill="#fff"/>',
};
function pin(color, fuel) {
  return L.divIcon({
    className: 'pin',
    html: `<svg width="34" height="44" viewBox="0 0 24 31"><path d="M12 30s10-10.2 10-18A10 10 0 0 0 2 12c0 7.8 10 18 10 18z" fill="${color}" stroke="#fff" stroke-width="1.5"/>${ICON[fuel] || ''}</svg>`,
    iconSize: [34, 44], iconAnchor: [17, 43], popupAnchor: [0, -38],
  });
}

function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export async function render(el) {
  ensureCss();
  const [customers, appts] = await Promise.all([all('customers'), all('appointments')]);
  const today = new Date();
  const plannedKeys = new Set(appts.filter((a) => a.status === 'planned').map((a) => `${a.customerId}|${a.objectId}`));
  const points = [];
  let missing = 0;
  for (const c of customers) if (!c.archived) for (const o of c.objects || []) {
    if (!o.address?.lat) { missing++; continue; }
    const states = o.chimneys.map((k) => dueState(k, today));
    const order = ['overdue', 'soon', 'contact', 'none', 'ok'];
    let st = states.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state))[0]?.state || 'none';
    if (plannedKeys.has(`${c.id}|${o.id}`)) st = 'planned';
    const fuels = new Set(o.chimneys.map((k) => k.fuel));
    const fuel = fuels.has('tuha') && fuels.has('plyn') ? 'obe' : fuels.has('plyn') ? 'plyn' : 'tuha';
    const next = o.chimneys.map((k) => nextCheck(k)).filter(Boolean).sort((a, b) => a - b)[0];
    const monthOffset = next ? (next.getFullYear() - today.getFullYear()) * 12 + next.getMonth() - today.getMonth() : null;
    points.push({ c, o, st, fuel, fuels, next, monthOffset, ll: [o.address.lat, o.address.lng] });
  }
  const s = settings();
  const areas = s.oblasti || [];
  const cities = [...points.reduce((m, p) => m.set(p.o.address.city, (m.get(p.o.address.city) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const hist = Array.from({ length: 13 }, (_, i) => points.filter((p) => (i === 0 ? p.monthOffset !== null && p.monthOffset <= 0 : p.monthOffset === i)).length);
  const hmax = Math.max(1, ...hist);

  el.innerHTML = String(html`
    <div class="map-page">
      <div class="map-top">
        <h1>Mapa</h1>
        <div class="seg">${[['vse', 'Vše'], ['tuha', 'Tuhá'], ['plyn', 'Plyn']].map(([k, l]) => html`<button class="${state.fuel === k ? 'on' : ''}" data-fuel="${k}">${l}</button>`)}</div>
        <div class="chips">
          ${cities.map(([n, cnt]) => html`<button class="chip small-chip" data-city="${n}">${n} <small>${cnt}</small></button>`)}
          ${areas.map((a, i) => html`<button class="chip small-chip area-chip ${state.area === i ? 'on' : ''}" data-area="${i}">${a.name}</button>`)}
        </div>
        <span class="grow"></span>
        <button class="btn soft" data-act="draw">Vybrat oblast prstem</button>
      </div>
      ${!hasKey() ? html`<div class="note-box" style="margin-bottom:8px">Mapa zatím běží na podkladu OpenStreetMap. Po zadání API klíče Mapy.cz (Nastavení → Propojení) se přepne na Mapy.cz a doplní se polohy zákazníků.</div>` : ''}
      ${missing ? html`<div class="note-box" style="margin-bottom:8px;justify-content:space-between"><span>${missing} ${missing === 1 ? 'adresa nemá' : 'adres nemá'} polohu na mapě.</span>${hasKey() ? html`<button class="btn small primary" data-act="geo">Doplnit z Mapy.cz</button>` : ''}</div>` : ''}
      <div class="map-wrap">
        <div id="map"></div>
        <div class="legend-box">${Object.entries(STATE_LABEL).map(([k, l]) => html`<span><i style="background:${COLORS[k]}"></i>${l}</span>`)}</div>
        <div id="draw-layer" hidden></div>
        <div id="sel-panel" class="sel-panel" hidden></div>
      </div>
      <div class="month-slider">
        <div class="hist">${hist.map((n, i) => html`<button class="hb ${state.month === i ? 'on' : ''}" data-month="${i}" title="${n}"><span style="height:${Math.round(n / hmax * 100)}%"></span><small>${i === 0 ? 'teď' : monthShort((today.getMonth() + i) % 12)}</small></button>`)}</div>
        <button class="chip ${state.month === null ? 'on' : ''}" data-month="all">Všechny lhůty</button>
      </div>
    </div>`);

  const map = L.map(el.querySelector('#map'), { zoomControl: false, attributionControl: true });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  if (hasKey()) {
    L.tileLayer(tileUrl('basic'), { maxZoom: 19, attribution: '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener">&copy; Seznam.cz a.s. a další</a>' }).addTo(map);
    const Logo = L.Control.extend({ options: { position: 'bottomleft' }, onAdd() { const d = L.DomUtil.create('div'); d.innerHTML = '<a href="https://mapy.com/" target="_blank" rel="noopener"><img src="https://api.mapy.com/img/api/logo.svg" alt="Mapy.com" style="height:22px"></a>'; return d; } });
    new Logo().addTo(map);
  } else {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; přispěvatelé <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
  }
  const layer = L.layerGroup().addTo(map);
  let areaLayer = null;

  const visible = () => points.filter((p) => (state.fuel === 'vse' || p.fuels.has(state.fuel))
    && (state.month === null || (state.month === 0 ? p.monthOffset !== null && p.monthOffset <= 0 : p.monthOffset === state.month))
    && (state.area === null || pointInPoly([p.ll[1], p.ll[0]], areas[state.area].polygon)));

  const drawPins = (fit = false) => {
    layer.clearLayers();
    const vis = visible();
    for (const p of vis) {
      const m = L.marker(p.ll, { icon: pin(COLORS[p.st], p.fuel) }).addTo(layer);
      const a = p.o.address;
      m.bindPopup(String(html`<div class="pop"><b>${displayName(p.c)}</b><br>${a.street}, ${a.city}<br><span class="tag" style="background:${COLORS[p.st]};color:#fff">${STATE_LABEL[p.st]}${p.next ? ` · ${p.next.getMonth() + 1}/${p.next.getFullYear()}` : ''}</span> ${[...p.fuels].map((f) => FUEL_LABEL[f]).join(', ')}
        <div class="pop-actions"><a class="btn small" href="#karta-${p.c.id}">Karta</a><a class="btn small" href="${mapsRouteLink({ lat: a.lat, lng: a.lng })}" target="_blank" rel="noopener">Navigovat</a>${p.c.phones?.[0] ? html`<a class="btn small" href="tel:${p.c.phones[0].replace(/\s/g, '')}">${fmtPhone(p.c.phones[0])}</a>` : ''}</div></div>`));
    }
    if (fit) {
      if (vis.length) map.fitBounds(L.latLngBounds(vis.map((p) => p.ll)).pad(0.15), { maxZoom: 14 });
      else map.setView([49.73, 17.3], 10);
    }
  };
  drawPins(true);
  setTimeout(() => map.invalidateSize(), 100);

  const rerender = () => render(el);
  el.querySelectorAll('[data-fuel]').forEach((b) => b.addEventListener('click', () => { state.fuel = b.dataset.fuel; el.querySelectorAll('[data-fuel]').forEach((x) => x.classList.toggle('on', x === b)); drawPins(); }));
  el.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => {
    state.month = b.dataset.month === 'all' ? null : Number(b.dataset.month);
    el.querySelectorAll('[data-month]').forEach((x) => x.classList.toggle('on', x.dataset.month === String(state.month ?? 'all')));
    drawPins();
  }));
  el.querySelectorAll('[data-city]').forEach((b) => b.addEventListener('click', () => {
    const ps = points.filter((p) => p.o.address.city === b.dataset.city);
    if (ps.length) map.fitBounds(L.latLngBounds(ps.map((p) => p.ll)).pad(0.3), { maxZoom: 15 });
  }));
  el.querySelectorAll('[data-area]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.area);
    state.area = state.area === i ? null : i;
    if (areaLayer) { map.removeLayer(areaLayer); areaLayer = null; }
    if (state.area !== null) {
      areaLayer = L.polygon(areas[i].polygon.map(([x, y]) => [y, x]), { color: '#8A5F17', weight: 2, fillOpacity: 0.08 }).addTo(map);
      map.fitBounds(areaLayer.getBounds().pad(0.1));
    }
    el.querySelectorAll('[data-area]').forEach((x) => x.classList.toggle('on', Number(x.dataset.area) === state.area));
    drawPins();
  }));
  el.querySelector('[data-act="geo"]')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Doplňuji…';
    let ok = 0, fail = 0;
    for (const c of customers) {
      let changed = false;
      for (const o of c.objects || []) if (!o.address?.lat) { try { if (await completeAddress(o)) { changed = true; ok++; } else fail++; } catch (err) { fail++; toast(err.message); break; } }
      if (changed) await put('customers', c);
    }
    toast(`Doplněno ${ok}${fail ? `, nenalezeno ${fail}` : ''}`);
    rerender();
  });

  // výběr oblasti prstem / Pencilem
  el.querySelector('[data-act="draw"]').addEventListener('click', () => {
    const lay = el.querySelector('#draw-layer');
    lay.hidden = false;
    lay.innerHTML = '<svg width="100%" height="100%"><polyline id="draw-line" fill="rgba(138,95,23,0.12)" stroke="#8A5F17" stroke-width="3" points=""/></svg><div class="draw-hint">Obtáhni prstem oblast na mapě</div>';
    const line = lay.querySelector('#draw-line');
    const pts = [];
    const rect = () => lay.getBoundingClientRect();
    const onDown = (e) => { e.preventDefault(); lay.setPointerCapture(e.pointerId); pts.length = 0; add(e); };
    const add = (e) => { const r = rect(); pts.push([e.clientX - r.left, e.clientY - r.top]); line.setAttribute('points', pts.map((p) => p.join(',')).join(' ')); };
    const onMove = (e) => { if (pts.length) add(e); };
    const onUp = () => {
      lay.hidden = true; lay.innerHTML = '';
      if (pts.length < 5) return;
      const poly = pts.map(([x, y]) => { const ll = map.containerPointToLatLng([x, y]); return [ll.lng, ll.lat]; });
      const inside = points.filter((p) => pointInPoly([p.ll[1], p.ll[0]], poly));
      showSelection(el, inside, poly, rerender);
    };
    lay.addEventListener('pointerdown', onDown);
    lay.addEventListener('pointermove', onMove);
    lay.addEventListener('pointerup', onUp, { once: true });
  });
}

function lastMonth(o) {
  const last = o.chimneys.map((k) => k.lastCheck).filter(Boolean).sort().pop();
  if (!last) return 'neznámo';
  const d = parseIso(last);
  return `${['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'][d.getMonth()]} ${d.getFullYear()}`;
}

function showSelection(el, inside, poly, rerender) {
  const panel = el.querySelector('#sel-panel');
  panel.hidden = false;
  panel.innerHTML = String(html`
    <div class="card-title"><h3>Vybráno ${inside.length}</h3><button class="btn small" data-x aria-label="Zavřít">✕</button></div>
    <div class="sel-list">${inside.map((p) => html`<a class="row" href="#karta-${p.c.id}"><span class="main"><span class="title" style="font-size:15px">${displayName(p.c)}</span><span class="meta">${p.o.address.street}, ${p.o.address.city}</span></span><span class="tag" style="background:${COLORS[p.st]};color:#fff">${STATE_LABEL[p.st]}</span></a>`)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn small primary" data-invite ${inside.length ? '' : 'disabled'}>Pozvat na výjezd</button>
      <button class="btn small soft" data-save>Uložit oblast</button>
    </div>`);
  panel.querySelector('[data-x]').addEventListener('click', () => { panel.hidden = true; });
  panel.querySelector('[data-save]').addEventListener('click', async () => {
    const name = await modal({ title: 'Název oblasti', body: '<input class="input" id="area-name" placeholder="např. Uničovsko – sever">', actions: [{ label: 'Zrušit', value: null }, { label: 'Uložit', kind: 'primary', value: (r) => r.querySelector('#area-name').value.trim() }] });
    if (!name) return;
    await saveSettings({ oblasti: [...(settings().oblasti || []), { name, polygon: poly }] });
    toast('Oblast uložena');
    rerender();
  });
  panel.querySelector('[data-invite]').addEventListener('click', async () => {
    const candidates = inside.filter((p) => ['overdue', 'soon', 'contact', 'none'].includes(p.st));
    const list = candidates.length ? candidates : inside.filter((p) => p.st !== 'planned');
    if (!list.length) { toast('Všichni vybraní už mají domluveno'); return; }
    const t = await pickTermin({ title: 'Pozvánka na výjezd' });
    if (!t) return;
    const d = parseIso(t.date);
    await smsQueue({
      title: 'Pozvánky z oblasti', note: `${list.length} zákazníků (přednostně ti, komu končí lhůta).`,
      items: list.map((p) => ({
        name: displayName(p.c), phone: p.c.phones?.[0],
        body: fill('pozvanka', { obec: p.o.address.city, den: dayPhrase(d), posledni: lastMonth(p.o) }, p.c),
        onSent: () => createInquiry({ customerId: p.c.id, objectId: p.o.id, stage: 'waiting', desiredDate: t.date, tripId: t.tripId, invitedAt: new Date().toISOString(), note: `Pozvánka na ${dayPhrase(d)}` }),
      })),
    });
    rerender();
  });
}
