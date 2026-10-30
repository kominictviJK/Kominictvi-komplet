// Obrazovka Dnes – dnešní domluvení zákazníci v časových blocích
import { byIndex, all } from '../db.js';
import { settings } from '../settings.js';
import { html, icon, isoDate, fmtDayLong, fmtPhone, toast } from '../ui.js';

const FUEL = { tuha: 'tuhá paliva', plyn: 'plyn', kapalna: 'kapalná paliva' };
const KIND = { kontrola: 'Kontrola a čištění', revize: 'Revize', frezovani: 'Frézování', ostatni: 'Ostatní práce' };

export async function load(date = new Date()) {
  const [items, customers] = await Promise.all([byIndex('appointments', 'date', isoDate(date)), all('customers')]);
  const byId = new Map(customers.map((c) => [c.id, c]));
  return items
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((a) => {
      const c = byId.get(a.customerId);
      const obj = c?.objects.find((o) => o.id === a.objectId) || c?.objects[0];
      return { ...a, customer: c, object: obj };
    })
    .filter((v) => v.customer);
}

// Trasa dne do Mapy.cz: z domova přes zákazníky zpět domů
export function routeUrl(visits, home) {
  const pts = visits.map((v) => v.object?.address).filter((a) => a?.lat && a?.lng).map((a) => `${a.lng},${a.lat}`);
  if (!pts.length || !home?.lat) return null;
  const h = `${home.lng},${home.lat}`;
  const q = new URLSearchParams({ mapset: 'basic', routeType: 'car_fast', start: h, end: h, waypoints: pts.join(';') });
  return `https://mapy.com/fnc/v1/route?${q.toString().replace(/%2C/g, ',').replace(/%3B/g, ';')}`;
}

function chimneySummary(obj) {
  if (!obj) return '';
  return obj.chimneys.map((k) => {
    const a = k.appliances[0];
    return [a?.kind, FUEL[k.fuel]].filter(Boolean).join(' · ');
  }).join(' + ');
}

export async function render(el) {
  const today = new Date();
  const visits = await load(today);
  const s = settings();
  const planned = visits.filter((v) => v.status === 'planned');
  const done = visits.filter((v) => v.status === 'done');
  const notes = visits.filter((v) => v.customer.note || v.note);
  const url = routeUrl(visits.filter((v) => v.status !== 'missed'), s.lhuty.domovGps || { lat: 49.7306, lng: 17.2989 });

  // seskupení podle časových bloků
  const blocks = [];
  for (const v of visits) {
    let b = blocks.find((x) => x.name === v.block);
    if (!b) blocks.push((b = { name: v.block, items: [] }));
    b.items.push(v);
  }

  el.innerHTML = String(html`
    <div class="page-head">
      <h1>Dnes</h1>
      <span class="sub">${fmtDayLong(today)}</span>
      <span class="grow"></span>
      ${url ? html`<a class="btn primary" href="${url}" target="_blank" rel="noopener">${icon('route')} Trasa dne v Mapy.cz</a>` : ''}
    </div>

    <div class="today-banner">
      <div class="card dark">
        <span class="label">Ranní přehled</span>
        <span class="big">${visits.length ? `${visits.length} ${visits.length === 1 ? 'zákazník' : visits.length < 5 ? 'zákazníci' : 'zákazníků'}` : 'Volno'}</span>
        <span style="color:#D8CFC2;font-size:14px">${visits.length ? `první v ${visits[0].time} · ${visits[0].object?.address.city}` : 'Na dnešek nic domluveno.'}</span>
      </div>
      <div class="card">
        <span class="label">Hotovo</span>
        <span class="big">${done.length} / ${visits.length}</span>
        <span class="sub">${planned.length ? `zbývá ${planned.length}` : visits.length ? 'vše hotovo' : ''}</span>
      </div>
      <div class="card">
        <span class="label">Pozor na</span>
        ${notes.length
          ? notes.slice(0, 2).map((v) => html`<span style="font-size:14px"><b>${v.customer.lastName || v.customer.name}:</b> ${v.customer.note || v.note}</span>`)
          : html`<span class="sub">Žádné zvláštní poznámky.</span>`}
      </div>
    </div>

    ${visits.length ? '' : html`<div class="card empty">Dnes nemáš nic domluveného. Zákazníky na další dny najdeš v Poptávkách a Kalendáři.</div>`}

    ${blocks.map((b) => html`
      <div class="block-head">${b.name}</div>
      ${b.items.map((v) => visitRow(v))}
    `)}
  `);

  el.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => toast('Formulář zprávy přijde v etapě 3.')));
}

function visitRow(v) {
  const c = v.customer;
  const a = v.object?.address;
  return html`
    <div class="visit ${v.status === 'done' ? 'done' : v.status === 'missed' ? 'miss' : ''}">
      <span class="time">${v.time}</span>
      <div class="who">
        <b>${c.name} ${c.isNew ? html`<span class="tag new">NOVÝ</span>` : html`<span class="tag">stálý</span>`}</b>
        <span class="meta">${a ? `${a.street}, ${a.zip} ${a.city}` : ''}</span>
        <span class="meta">${KIND[v.kind]} · ${chimneySummary(v.object)} ${v.prefer ? html`· <span class="tag">Hodí se: ${v.prefer}</span>` : ''}</span>
        ${c.note ? html`<span class="note">${c.note}</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        ${c.phones.map((p) => html`<a class="phone" href="tel:${p.replace(/\s/g, '')}">${fmtPhone(p)}</a>`)}
        ${v.status === 'planned' ? html`<button class="btn primary small" data-start="${v.id}">Začít</button>` : html`<span class="tag ok">hotovo</span>`}
      </div>
    </div>`;
}
