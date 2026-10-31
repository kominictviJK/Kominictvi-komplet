// Obrazovka Dnes – dnešní domluvení zákazníci, ranní přehled, připomínky a souhrn dne
import { byIndex, all, put, get } from '../db.js';
import { pending } from '../sync.js';
import { settings } from '../settings.js';
import { displayName } from '../customers.js';
import { FUEL_LABEL } from '../lhuty.js';
import { KIND_LABEL, backToInquiries, moveAppointment, reorder, tomorrow, addDays } from '../planning.js';
import { pickTermin } from '../termin.js';
import { smsQueue } from '../smsqueue.js';
import { fill, dayPhrase, blockPhrase } from '../texts.js';
import { paymentTotal } from '../payment.js';
import { hasKey, homePosition, currentPosition, route, dayRoute } from '../mapy.js';
import { forecast, warnings } from '../weather.js';
import { html, icon, isoDate, parseIso, fmtDayLong, fmtPhone, fmtMoney, toast, modal } from '../ui.js';

export async function load(date = new Date()) {
  const [items, customers] = await Promise.all([byIndex('appointments', 'date', typeof date === 'string' ? date : isoDate(date)), all('customers')]);
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
  return obj.chimneys.map((k) => [k.appliances[0]?.kind, FUEL_LABEL[k.fuel]].filter(Boolean).join(' · ')).join(' + ');
}

const plural = (n, a, b, c) => `${n} ${n === 1 ? a : n < 5 ? b : c}`;

export async function render(el, { go } = {}) {
  const today = new Date();
  const tIso = isoDate(today);
  const visits = await load(today);
  const active = visits.filter((v) => v.status !== 'missed');
  const s = settings();
  const planned = visits.filter((v) => v.status === 'planned');
  const done = visits.filter((v) => v.status === 'done');
  const notes = active.filter((v) => v.customer.note || v.note);
  const url = routeUrl(active.filter((v) => v.status === 'planned'), (await homePosition()) || s.lhuty.domovGps || { lat: 49.7306, lng: 17.2989 });
  const [tom, week] = await Promise.all([load(tomorrow(today)), load(addDays(tIso, 7))]);
  const queue = await pending();
  const queueMail = queue.filter((q) => q.type === 'mail').length, queueExp = queue.filter((q) => q.type === 'expense').length;
  const tomTodo = tom.filter((v) => v.status === 'planned' && !v.remindedEvening);
  const weekTodo = week.filter((v) => v.status === 'planned' && !v.remindedWeek);
  const docs = (await all('documents')).filter((d) => d.status === 'final' && d.date === tIso);
  const income = docs.filter((d) => d.payment.method !== 'faktura').reduce((sum, d) => sum + paymentTotal(d.payment.items), 0);
  const unsent = docs.filter((d) => !d.sent?.length).length;
  const dayOver = visits.length && !planned.length;

  const blocks = [];
  for (const v of visits) {
    let b = blocks.find((x) => x.name === (v.block || v.time));
    if (!b) blocks.push((b = { name: v.block || v.time || 'bez času', items: [] }));
    b.items.push(v);
  }

  el.innerHTML = String(html`
    <div class="page-head">
      <h1>Dnes</h1>
      <span class="sub">${fmtDayLong(today)}</span>
      <span class="grow"></span>
      ${url && planned.length ? html`<a class="btn primary" href="${url}" target="_blank" rel="noopener">${icon('route')} Trasa dne v Mapy.cz</a>` : ''}
    </div>

    <div class="today-banner">
      ${dayOver ? html`
        <div class="card dark">
          <span class="label">Souhrn dne</span>
          <span class="big">${plural(done.length, 'návštěva', 'návštěvy', 'návštěv')}</span>
          <span style="color:#D8CFC2;font-size:14px">${fmtMoney(income)} hotově a QR${unsent ? ` · ${plural(unsent, 'dokument čeká', 'dokumenty čekají', 'dokumentů čeká')} na odeslání` : ' · vše odesláno'}</span>
        </div>` : html`
        <div class="card dark">
          <span class="label">Ranní přehled</span>
          <span class="big">${active.length ? plural(active.length, 'zákazník', 'zákazníci', 'zákazníků') : 'Volno'}</span>
          <span style="color:#D8CFC2;font-size:14px">${active.length ? `první ${active[0].time ? `v ${active[0].time}` : active[0].block} · ${active[0].object?.address.city}` : 'Na dnešek nic domluveno.'}</span>
          <span style="color:#D8CFC2;font-size:14px" id="day-km"></span>
        </div>`}
      <div class="card weather" id="weather">
        <span class="label">${dayOver ? 'Zítra' : 'Počasí'}</span>
        <span class="sub">Načítám…</span>
      </div>
      <div class="card">
        <span class="label">Hotovo</span>
        <span class="big">${done.length} / ${active.length}</span>
        <span class="sub">${planned.length ? `zbývá ${planned.length}` : active.length ? 'vše hotovo' : ''}</span>
      </div>
      <div class="card">
        <span class="label">Pozor na</span>
        ${notes.length
          ? notes.slice(0, 2).map((v) => html`<span style="font-size:14px"><b>${v.customer.lastName || v.customer.name}:</b> ${v.customer.note || v.note}</span>`)
          : html`<span class="sub">Žádné zvláštní poznámky.</span>`}
      </div>
    </div>

    ${tomTodo.length || weekTodo.length ? html`
      <div class="card remind">
        <span>${icon('phone')}</span>
        <span class="grow">${tomTodo.length ? html`<b>Zítra ${plural(tomTodo.length, 'zákazník', 'zákazníci', 'zákazníků')}</b> – pošli večerní připomínky.` : ''} ${weekTodo.length ? html`<b>Za týden ${plural(weekTodo.length, 'zákazník', 'zákazníci', 'zákazníků')}</b> – připomínka týden předem.` : ''}</span>
        ${tomTodo.length ? html`<button class="btn small primary" data-remind="vecer">Zítřejší připomínky</button>` : ''}
        ${weekTodo.length ? html`<button class="btn small" data-remind="tyden">Za týden</button>` : ''}
      </div>` : ''}

    ${queueMail || queueExp ? html`
      <div class="card remind">
        <span>${icon('inbox')}</span>
        <span class="grow">${queueMail ? html`<b>${plural(queueMail, 'nová poptávka', 'nové poptávky', 'nových poptávek')}</b> z e-mailu. ` : ''}${queueExp ? html`<b>${plural(queueExp, 'nákup', 'nákupy', 'nákupů')}</b> ke kontrole v nákladech.` : ''}</span>
        ${queueMail ? html`<a class="btn small primary" href="#poptavky-poptavky">Poptávky</a>` : ''}
        ${queueExp ? html`<a class="btn small" href="#finance-naklady">Náklady</a>` : ''}
      </div>` : ''}

    ${visits.length ? '' : html`<div class="card empty">Dnes nemáš nic domluveného. Zákazníky na další dny najdeš v Poptávkách a Kalendáři.</div>`}

    ${blocks.map((b) => html`
      <div class="block-head">${b.name}</div>
      ${b.items.map((v) => visitRow(v, visits))}
    `)}

    ${planned.length ? html`<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn danger small" data-act="cancel-day">Zrušit dnešní den…</button></div>` : ''}
  `);

  const rerender = () => render(el, { go });
  fillExtras(el, { visits: active, dayOver, home: (await homePosition()) || s.lhuty.domovGps }).catch(() => {});
  el.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => go(`navsteva/zacit/${b.dataset.start}`)));
  el.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => go(`navsteva/${b.dataset.doc}`)));
  el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
    const [id, dir] = b.dataset.move.split('|');
    const ids = visits.map((v) => v.id);
    const i = ids.indexOf(id); const j = i + Number(dir);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorder(tIso, ids);
    rerender();
  }));
  el.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => moreActions(visits.find((v) => v.id === b.dataset.more), rerender)));
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => onTheWay(visits.find((v) => v.id === b.dataset.go))));
  el.querySelectorAll('[data-remind]').forEach((b) => b.addEventListener('click', async () => {
    const evening = b.dataset.remind === 'vecer';
    const list = evening ? tomTodo : weekTodo;
    await smsQueue({
      title: evening ? 'Večerní připomínky na zítřek' : 'Připomínky týden předem',
      items: list.map((v) => ({
        name: displayName(v.customer), phone: v.customer.phones?.[0],
        body: fill(evening ? 'vecer' : 'tyden', { den: dayPhrase(parseIso(v.date)), cas: blockPhrase(v.block, v.time) }, v.customer),
        onSent: async () => { const a = await get('appointments', v.id); await put('appointments', { ...a, [evening ? 'remindedEvening' : 'remindedWeek']: new Date().toISOString() }); },
      })),
    });
    rerender();
  }));
  el.querySelector('[data-act="cancel-day"]')?.addEventListener('click', async () => {
    const ok = await modal({ title: 'Zrušit dnešní den?', body: `<p>Všech ${planned.length} zbývajících zákazníků se vrátí do Poptávek a připraví se jim omluvná SMS.</p>`, actions: [{ label: 'Ne', value: false }, { label: 'Zrušit den', value: true, kind: 'danger' }] });
    if (!ok) return;
    for (const v of planned) await backToInquiries(await get('appointments', v.id), 'Zrušený den – domluvit nový termín');
    await smsQueue({ title: 'Omluvné SMS', items: planned.map((v) => ({ name: displayName(v.customer), phone: v.customer.phones?.[0], body: fill('zrusit', {}, v.customer) })) });
    rerender();
  });
}

function visitRow(v, visits) {
  const c = v.customer;
  const a = v.object?.address;
  const idx = visits.indexOf(v);
  return html`
    <div class="visit ${v.status === 'done' ? 'done' : v.status === 'missed' ? 'miss' : ''}">
      ${v.status === 'planned' ? html`<span class="reorder"><button data-move="${v.id}|-1" aria-label="Posunout výš" ${idx === 0 ? 'disabled' : ''}>▲</button><button data-move="${v.id}|1" aria-label="Posunout níž" ${idx === visits.length - 1 ? 'disabled' : ''}>▼</button></span>` : ''}
      <span class="time">${v.time || ''}</span>
      <div class="who">
        <b>${displayName(c)} ${c.isNew ? html`<span class="tag new">NOVÝ</span>` : html`<span class="tag">stálý</span>`}</b>
        <span class="meta">${a ? `${a.street}, ${a.zip} ${a.city}` : ''}</span>
        <span class="meta">${KIND_LABEL[v.kind] || ''} · ${chimneySummary(v.object)} ${v.prefer ? html`· <span class="tag">Hodí se: ${v.prefer}</span>` : ''}${v.remindedEvening ? html` <span class="tag ok">připomenuto</span>` : ''}</span>
        ${c.note ? html`<span class="note">${c.note}</span>` : ''}
        ${v.status === 'missed' ? html`<span class="note">${v.missedReason || 'nezastižen'} – vráceno do Poptávek</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        ${c.phones.map((p) => html`<a class="phone" href="tel:${p.replace(/\s/g, '')}">${fmtPhone(p)}</a>`)}
        <span style="display:flex;gap:6px">
          ${v.status === 'planned' ? html`<button class="btn small" data-go="${v.id}" title="SMS: jsem na cestě">Jedu k vám</button><button class="btn small" data-more="${v.id}" aria-label="Další možnosti">⋯</button><button class="btn primary small" data-start="${v.id}">Začít</button>`
            : v.documentId ? html`<button class="btn small soft" data-doc="${v.documentId}">✓ Hotovo · zpráva</button>` : v.status === 'done' ? html`<span class="tag ok">hotovo</span>` : ''}
        </span>
      </div>
    </div>`;
}

async function onTheWay(v) {
  // odhad z GPS a trasy Mapy.cz
  const to = v.object?.address;
  if (hasKey() && to?.lat) {
    toast('Počítám čas jízdy…');
    const here = await currentPosition();
    if (here) {
      try {
        const r = await route(here, { lat: to.lat, lng: to.lng });
        const minut = Math.max(5, Math.round(r.minutes / 5) * 5);
        await smsQueue({ title: 'Jedu k vám', note: `Podle Mapy.cz ${r.minutes} min (${String(r.km).replace('.', ',')} km). Čas v textu můžeš upravit.`, items: [{ name: displayName(v.customer), phone: v.customer.phones?.[0], body: fill('jedu', { minut }, v.customer) }] });
        return;
      } catch (e) { toast(e.message); }
    }
  }
  const min = await modal({
    title: `Jedu k vám – ${displayName(v.customer)}`,
    body: '<p class="sub" style="margin-top:0">Za kolik minut tam budeš?</p>',
    actions: [...[10, 15, 20, 30, 45].map((m) => ({ label: `${m} min`, value: m })), { label: 'Zrušit', value: null }],
  });
  if (!min) return;
  await smsQueue({ title: 'Jedu k vám', items: [{ name: displayName(v.customer), phone: v.customer.phones?.[0], body: fill('jedu', { minut: min }, v.customer) }] });
}

async function moreActions(v, rerender) {
  const act = await modal({
    title: displayName(v.customer),
    actions: [
      { label: 'Nezastižen', value: 'miss' },
      { label: 'Přesunout na jiný den', value: 'move' },
      { label: 'Karta zákazníka', value: 'card' },
      { label: 'Zavřít', value: null },
    ],
  });
  if (act === 'card') { location.hash = `#karta-${v.customer.id}`; return; }
  if (act === 'miss') {
    await backToInquiries(await get('appointments', v.id), 'Nezastižen – domluvit nový termín');
    await smsQueue({ title: 'Nezastižen', items: [{ name: displayName(v.customer), phone: v.customer.phones?.[0], body: fill('nezastizen', {}, v.customer) }] });
    toast('Vráceno do Poptávek');
    rerender();
  }
  if (act === 'move') {
    const t = await pickTermin({ title: `Přesunout – ${displayName(v.customer)}`, prefer: v.prefer, block: v.block });
    if (!t) return;
    const n = await moveAppointment(v.id, t);
    await smsQueue({ title: 'Přesun termínu', note: 'Pošli zákazníkovi nový termín, nebo zavři, pokud jste se už domluvili.', items: [{ name: displayName(v.customer), phone: v.customer.phones?.[0], body: fill('presun', { den: dayPhrase(parseIso(n.date)), cas: blockPhrase(n.block, n.time) }, v.customer) }] });
    toast('Termín přesunut');
    rerender();
  }
}

// Počasí (Open-Meteo) a délka trasy dne (Mapy.cz) – doplní se po vykreslení
async function fillExtras(el, { visits, dayOver, home }) {
  const pos = home || visits.find((v) => v.object?.address.lat)?.object.address;
  const box = el.querySelector('#weather');
  const days = await forecast(pos ? { lat: pos.lat, lng: pos.lng } : { lat: 49.7306, lng: 17.2989 });
  if (box && box.isConnected) {
    const d = days?.[dayOver ? 1 : 0];
    if (!d) box.querySelector('.sub').textContent = navigator.onLine ? 'Počasí se nepodařilo načíst.' : 'Bez internetu.';
    else {
      const w = warnings(d);
      box.innerHTML = String(html`<span class="label">${dayOver ? 'Zítra' : 'Počasí'}</span>
        <span class="big">${d.tmax}° <small style="font-size:16px;color:var(--muted)">/ ${d.tmin}°</small></span>
        <span style="font-size:14px">${d.text}${d.rainProb != null ? ` · srážky ${d.rainProb} %` : ''} · vítr ${d.wind} km/h</span>
        ${w.length ? html`<span class="tag warn" style="align-self:flex-start;white-space:normal">${w.join(' · ')}</span>` : ''}`);
    }
  }
  const kmEl = el.querySelector('#day-km');
  const pts = visits.filter((v) => v.status !== 'missed' && v.object?.address.lat).map((v) => ({ lat: v.object.address.lat, lng: v.object.address.lng }));
  if (kmEl && home && pts.length && hasKey()) {
    const key = `route:${isoDate()}:${pts.map((p) => p.lat.toFixed(4)).join(',')}`;
    let r = (await get('settings', key))?.value;
    if (!r) { r = await dayRoute([home, ...pts, home]); if (r) await put('settings', { key, value: r }); }
    if (r && kmEl.isConnected) kmEl.textContent = `trasa dne cca ${r.km} km · ${Math.floor(r.minutes / 60) ? `${Math.floor(r.minutes / 60)} h ` : ''}${r.minutes % 60} min za volantem`;
  }
}
