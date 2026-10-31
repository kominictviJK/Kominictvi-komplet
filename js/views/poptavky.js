// Poptávky – trychtýř: ① Oslovit → ② Čeká na odpověď → ③ Poptávky a výjezdy
import { all, get, put, del } from '../db.js';
import { displayName, matches, listCustomers, saveCustomer, emptyCustomer, norm } from '../customers.js';
import { hasAi, readInquiry } from '../ai.js';
import { pending } from '../sync.js';
import { photoData } from './finance.js';
import { DUE_TAG } from '../lhuty.js';
import {
  contactCandidates, groupByCity, createInquiry, listInquiries, updateInquiry, scheduleAppointment, createTrip, upcomingTrips,
  KIND_LABEL, PREFS, TRIP_TYPES, appointmentsBetween, addDays,
} from '../planning.js';
import { pickTermin } from '../termin.js';
import { smsQueue } from '../smsqueue.js';
import { fill, dayPhrase, blockPhrase } from '../texts.js';
import { html, icon, toast, modal, isoDate, parseIso, fmtDayLong, fmtDateShort, fmtPhone, monthName, monthShort } from '../ui.js';

const state = { tab: 'poptavky', kind: 'vse', selected: new Set() };

export async function render(el, { args, go }) {
  if (args[0]) state.tab = args[0];
  const [cands, waiting, open] = await Promise.all([contactCandidates(), listInquiries(['waiting']), listInquiries(['open'])]);
  const customers = new Map((await all('customers')).map((c) => [c.id, c]));
  const tabs = [['oslovit', '① Oslovit', cands.length], ['ceka', '② Čeká na odpověď', waiting.length], ['poptavky', '③ Poptávky a výjezdy', open.length]];
  el.innerHTML = String(html`
    <div class="page-head">
      <h1>Poptávky</h1>
      <div class="seg">${tabs.map(([k, l, n]) => html`<button class="${state.tab === k ? 'on' : ''}" data-tab="${k}">${l} <span class="count">${n}</span></button>`)}</div>
      <span class="grow"></span>
      ${hasAi() ? html`<button class="btn soft" data-act="ai">Ze zprávy</button>` : ''}
      <button class="btn primary" data-act="new">${icon('plus')} Nová poptávka</button>
    </div>
    <div id="tab"></div>`);
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(el, { args: [], go }); }));
  el.querySelector('[data-act="new"]').addEventListener('click', () => newInquiry(() => render(el, { args: [], go }), go));
  el.querySelector('[data-act="ai"]')?.addEventListener('click', () => fromMessage(() => render(el, { args: [], go }), go));
  const box = el.querySelector('#tab');
  const rerender = () => render(el, { args: [], go });
  if (state.tab === 'oslovit') tabContact(box, cands, rerender);
  else if (state.tab === 'ceka') tabWaiting(box, waiting, customers, rerender);
  else await tabOpen(box, open, customers, rerender);
}

// ---------- ① Oslovit ----------
function tabContact(box, cands, rerender) {
  if (!cands.length) { box.innerHTML = String(html`<div class="card empty">Nikomu teď nekončí lhůta v příštích 3 měsících. 👍</div>`); return; }
  const groups = groupByCity(cands);
  box.innerHTML = String(html`
    <p class="sub" style="margin-top:0">Zákazníci, kterým lhůta končí do 3 měsíců (nebo už propadla) a ještě nemají domluveno. Vyber obec nebo lidi, zvol den výjezdu a aplikace připraví pozvánky.</p>
    ${groups.map(([city, items]) => html`
      <div class="card" style="margin-top:10px">
        <div class="card-title">
          <span><h3 style="display:inline">${city}</h3> <span class="sub">${items.length} ${items.length === 1 ? 'zákazník' : items.length < 5 ? 'zákazníci' : 'zákazníků'}</span></span>
          <span style="display:flex;gap:8px"><button class="btn small" data-selall="${city}">Vybrat všechny</button><button class="btn small primary" data-invite="${city}">Pozvat vybrané</button></span>
        </div>
        ${items.map(({ customer, object, due }) => {
          const key = `${customer.id}|${object.id}`;
          return html`<label class="row selrow">
            <input type="checkbox" data-sel="${key}" ${state.selected.has(key) ? 'checked' : ''}>
            <span class="main"><span class="title">${displayName(customer)}</span><span class="meta">${object.address.street} · ${(customer.phones || [])[0] ? fmtPhone(customer.phones[0]) : 'bez telefonu'}</span></span>
            <span class="tag ${DUE_TAG[due.state]}">${due.label}</span>
          </label>`;
        })}
      </div>`)}`);
  box.querySelectorAll('[data-sel]').forEach((c) => c.addEventListener('change', () => { if (c.checked) state.selected.add(c.dataset.sel); else state.selected.delete(c.dataset.sel); }));
  box.querySelectorAll('[data-selall]').forEach((b) => b.addEventListener('click', () => {
    const items = groups.find(([c]) => c === b.dataset.selall)[1];
    items.forEach(({ customer, object }) => state.selected.add(`${customer.id}|${object.id}`));
    box.querySelectorAll('[data-sel]').forEach((c) => { c.checked = state.selected.has(c.dataset.sel); });
  }));
  box.querySelectorAll('[data-invite]').forEach((b) => b.addEventListener('click', async () => {
    const items = groups.find(([c]) => c === b.dataset.invite)[1].filter(({ customer, object }) => state.selected.has(`${customer.id}|${object.id}`));
    if (!items.length) { toast('Nejdřív zaškrtni, koho pozvat'); return; }
    const t = await pickTermin({ title: `Pozvánka – ${b.dataset.invite}`, withTrips: true });
    if (!t) return;
    const d = parseIso(t.date);
    const queue = items.map(({ customer, object, due }) => ({
      name: displayName(customer), phone: customer.phones?.[0],
      body: fill('pozvanka', { obec: object.address.city, den: dayPhrase(d), posledni: lastText(object) }, customer),
      onSent: async () => {
        await createInquiry({ customerId: customer.id, objectId: object.id, stage: 'waiting', desiredDate: t.date, tripId: t.tripId, invitedAt: new Date().toISOString(), note: `Pozvánka na ${dayPhrase(d)} (lhůta ${due.label})` });
        state.selected.delete(`${customer.id}|${object.id}`);
      },
    }));
    await smsQueue({ title: `Pozvánky – ${b.dataset.invite}`, items: queue, note: 'Každá SMS se otevře ve Zprávách, stačí ťuknout na Odeslat. Odeslaní se přesunou do „Čeká na odpověď“.' });
    rerender();
  }));
}

function lastText(object) {
  const last = object.chimneys.map((k) => k.lastCheck).filter(Boolean).sort().pop();
  if (!last) return 'neznámo';
  const d = parseIso(last);
  return `${monthName(d.getMonth())} ${d.getFullYear()}`;
}

// ---------- ② Čeká na odpověď ----------
function tabWaiting(box, waiting, customers, rerender) {
  if (!waiting.length) { box.innerHTML = String(html`<div class="card empty">Nikdo nečeká na odpověď. Pozvánky pošleš v záložce ① Oslovit.</div>`); return; }
  box.innerHTML = String(html`<div class="list">${waiting.map((q) => {
    const c = customers.get(q.customerId); if (!c) return '';
    const o = c.objects.find((x) => x.id === q.objectId) || c.objects[0];
    return html`<div class="row">
      <span class="main"><span class="title">${displayName(c)}</span><span class="meta">${o.address.street}, ${o.address.city} · ${(c.phones || [])[0] ? fmtPhone(c.phones[0]) : ''}</span><span class="meta">${q.note}${q.invitedAt ? ` · pozváno ${fmtDateShort(new Date(q.invitedAt))}` : ''}</span></span>
      <span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn small primary" data-confirm="${q.id}">Potvrdil</button>
        <button class="btn small" data-reschedule="${q.id}">Jiný termín</button>
        <button class="btn small danger" data-lost="${q.id}">Nemá zájem</button>
      </span></div>`;
  })}</div>`);
  const handle = async (id, ask) => {
    const q = await get('inquiries', id); const c = customers.get(q.customerId);
    const t = await pickTermin({ title: `Termín – ${displayName(c)}`, date: ask ? '' : q.desiredDate, prefer: q.prefer });
    if (!t) return;
    const a = await scheduleAppointment({ customerId: q.customerId, objectId: q.objectId, date: t.date, block: t.block, time: t.time, kind: q.kind, prefer: q.prefer, tripId: t.tripId || q.tripId, inquiryId: q.id });
    await offerConfirmation(a, c);
    rerender();
  };
  box.querySelectorAll('[data-confirm]').forEach((b) => b.addEventListener('click', () => handle(b.dataset.confirm, false)));
  box.querySelectorAll('[data-reschedule]').forEach((b) => b.addEventListener('click', () => handle(b.dataset.reschedule, true)));
  box.querySelectorAll('[data-lost]').forEach((b) => b.addEventListener('click', async () => { await updateInquiry(b.dataset.lost, { stage: 'lost' }); toast('Odebráno'); rerender(); }));
}

export async function offerConfirmation(a, c) {
  const o = c.objects.find((x) => x.id === a.objectId) || c.objects[0];
  await smsQueue({
    title: 'Potvrzení termínu', note: 'Pošli zákazníkovi potvrzení, nebo zavři, pokud jste se domluvili jinak.',
    items: [{ name: displayName(c), phone: c.phones?.[0], body: fill('potvrzeni', { den: dayPhrase(parseIso(a.date)), cas: blockPhrase(a.block, a.time), adresa: `${o.address.street}, ${o.address.city}` }, c), onSent: () => put('appointments', { ...a, confirmedAt: new Date().toISOString() }) }],
  });
}

// ---------- ③ Poptávky a výjezdy ----------
async function tabOpen(box, open, customers, rerender) {
  const today = isoDate(new Date());
  const [trips, appts] = await Promise.all([upcomingTrips(), appointmentsBetween(today, addDays(today, 45))]);
  const items = open.filter((q) => state.kind === 'vse' || (state.kind === 'kontrola' ? q.kind === 'kontrola' : q.kind !== 'kontrola'));
  // dny s domluvenými návštěvami a výjezdy
  const days = new Map();
  for (const t of trips) days.set(t.date, { date: t.date, trip: t, appts: [] });
  for (const a of appts.filter((x) => x.status === 'planned')) { if (!days.has(a.date)) days.set(a.date, { date: a.date, trip: null, appts: [] }); days.get(a.date).appts.push(a); }
  const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const mails = await pending('mail');

  box.innerHTML = String(html`
    ${mails.length ? html`<div class="card" style="border-left:4px solid var(--gold);margin-bottom:12px">
      <div class="card-title"><h3>Z e-mailu (${mails.length})</h3><span class="sub">zprávy z KominictviJK@gmail.com, které vypadají jako poptávka</span></div>
      ${mails.slice(0, 8).map((m) => html`<div class="kv"><span>${fmtDateShort(parseIso(m.date))}</span><span style="flex-grow:1"><b>${m.parsed?.isMayorConfirmation ? 'Potvrzení termínu od obce' : m.title || '(bez předmětu)'}</b><br><small class="sub">${(m.from || '').replace(/<.*>/, '').trim()}${m.parsed?.note ? ` · ${m.parsed.note}` : ''}</small></span><button class="btn small primary" data-mail="${m.id}">Zpracovat</button><button class="btn small" data-mailno="${m.id}">Není poptávka</button></div>`)}
    </div>` : ''}
    <div class="grid c2" style="align-items:start;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)">
      <div>
        <div class="chips" style="margin-bottom:10px">${[['vse', 'Vše'], ['kontrola', 'Kontrola a čištění'], ['ostatni', 'Ostatní práce']].map(([k, l]) => html`<button class="chip ${state.kind === k ? 'on' : ''}" data-kind="${k}">${l}</button>`)}</div>
        ${items.length ? html`<div class="list">${items.map((q) => {
          const c = customers.get(q.customerId); if (!c) return '';
          const o = c.objects.find((x) => x.id === q.objectId) || c.objects[0];
          return html`<div class="row" style="align-items:flex-start">
            <span class="main">
              <span class="title">${displayName(c)} ${c.isNew ? html`<span class="tag new">NOVÝ</span>` : html`<span class="tag">stálý</span>`}</span>
              <span class="meta">${o.address.street}, ${o.address.city} · ${KIND_LABEL[q.kind] || q.kind}</span>
              <span class="meta">${q.prefer ? html`<span class="tag">Hodí se: ${q.prefer}</span>` : ''}${q.desiredDate ? html`<span class="tag">chce ${fmtDateShort(parseIso(q.desiredDate))}</span>` : ''}${q.note ? ` ${q.note}` : ''}</span>
            </span>
            <span style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
              <button class="btn small primary" data-plan="${q.id}">Naplánovat</button>
              <button class="btn small" data-drop="${q.id}">Smazat</button>
            </span></div>`;
        })}</div>` : html`<div class="card empty">Žádné otevřené poptávky. Novou přidáš tlačítkem nahoře.</div>`}
      </div>
      <div>
        <div class="card-title" style="margin:4px 2px 10px"><h3>Výjezdy a domluvené dny</h3><button class="btn small soft" data-act="trip">+ Nový výjezd</button></div>
        ${dayList.length ? dayList.map((d) => {
          const cities = [...new Set([...(d.trip?.villages || []), ...d.appts.map((a) => customers.get(a.customerId)?.objects.find((o) => o.id === a.objectId)?.address.city).filter(Boolean)])];
          return html`<a class="card daycard" href="#kalendar-${d.date}">
            <span class="dc-date"><b>${parseIso(d.date).getDate()}.</b><span>${monthShort(parseIso(d.date).getMonth())}</span></span>
            <span class="main"><b>${fmtDayLong(parseIso(d.date))}</b><span class="sub">${cities.join(', ') || 'bez obcí'}</span></span>
            <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">${d.trip ? html`<span class="tag new">${TRIP_TYPES[d.trip.type]}</span>` : ''}<span class="tag">${d.appts.length} ${d.appts.length === 1 ? 'zákazník' : d.appts.length < 5 ? 'zákazníci' : 'zákazníků'}</span></span>
          </a>`;
        }) : html`<div class="card empty">Zatím žádné výjezdy.</div>`}
      </div>
    </div>`);
  box.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { state.kind = b.dataset.kind; rerender(); }));
  box.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', async () => {
    const q = await get('inquiries', b.dataset.plan); const c = customers.get(q.customerId);
    const t = await pickTermin({ title: `Naplánovat – ${displayName(c)}`, date: q.desiredDate, prefer: q.prefer });
    if (!t) return;
    const a = await scheduleAppointment({ customerId: q.customerId, objectId: q.objectId, date: t.date, block: t.block, time: t.time, kind: q.kind, prefer: q.prefer, note: q.note, tripId: t.tripId, inquiryId: q.id });
    await offerConfirmation(a, c);
    rerender();
  }));
  box.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await modal({ title: 'Smazat poptávku?', actions: [{ label: 'Zrušit', value: false }, { label: 'Smazat', value: true, kind: 'danger' }] });
    if (ok) { await updateInquiry(b.dataset.drop, { stage: 'lost' }); rerender(); }
  }));
  box.querySelector('[data-act="trip"]').addEventListener('click', () => newTrip(rerender));
  box.querySelectorAll('[data-mail]').forEach((b) => b.addEventListener('click', async () => {
    const m = mails.find((x) => x.id === b.dataset.mail);
    let parsed = m.parsed;
    if (!parsed && hasAi()) { b.textContent = 'Čtu…'; try { parsed = await readInquiry({ text: `${m.title}\n${m.from}\n${m.text}` }); } catch (e) { toast(e.message); } }
    const done = await applyParsed(parsed || { note: m.title }, rerender, m.text);
    if (done) { await del('queue', m.id); rerender(); }
  }));
  box.querySelectorAll('[data-mailno]').forEach((b) => b.addEventListener('click', async () => { await del('queue', b.dataset.mailno); toast('Vyřazeno'); rerender(); }));
}

// Poptávka ze zprávy: vložený text nebo screenshot (SMS, WhatsApp, Messenger…) → AI vyplní
async function fromMessage(done, go) {
  const r = await modal({
    title: 'Poptávka ze zprávy',
    body: String(html`<p class="sub" style="margin-top:0">Vlož text zprávy, nebo přidej screenshot. Aplikace najde jméno, adresu, telefon a co zákazník chce. Potvrzení termínu od obce rovnou založí výjezd.</p>
      <label class="field"><span>Text zprávy</span><textarea id="fm-t" rows="5" placeholder="Dobrý den, potřeboval bych vyčistit komín…"></textarea></label>
      <label class="btn soft" style="margin-top:10px">Přidat screenshot<input type="file" accept="image/*" id="fm-i" hidden></label> <span class="sub" id="fm-n"></span>`),
    actions: [{ label: 'Zrušit', value: null }, { label: 'Přečíst', kind: 'primary', value: async (root) => ({ text: root.querySelector('#fm-t').value.trim(), file: root.querySelector('#fm-i').files?.[0] || null }) }],
    onOpen: (root) => root.querySelector('#fm-i').addEventListener('change', (e) => { root.querySelector('#fm-n').textContent = e.target.files?.[0] ? '✓ screenshot přidán' : ''; }),
  });
  if (!r || (!r.text && !r.file)) return;
  toast('Čtu zprávu…');
  try {
    const parsed = await readInquiry({ text: r.text, image: r.file ? await photoData(r.file) : null });
    await applyParsed(parsed, done, r.text);
  } catch (e) { toast(e.message); }
}

// Výsledek AI → výjezd (potvrzení obce) nebo předvyplněná poptávka
async function applyParsed(p, done, original = '') {
  if (p.isMayorConfirmation && p.villageDate) {
    const ok = await modal({ title: 'Potvrzení termínu od obce', body: String(html`<p>Založit <b>den v obci ${p.village || ''}</b> na <b>${fmtDayLong(parseIso(p.villageDate))}</b>?</p>`), actions: [{ label: 'Zrušit', value: false }, { label: 'Založit výjezd', value: true, kind: 'primary' }] });
    if (!ok) return false;
    await createTrip({ date: p.villageDate, type: 'obec', villages: p.village ? [p.village] : [], note: 'Potvrzeno obcí' });
    toast('Výjezd založen'); done(); return true;
  }
  const customers = await listCustomers();
  const digits = (x) => String(x || '').replace(/\D/g, '').slice(-9);
  const ph = digits(p.phone);
  let customer = (ph && customers.find((c) => (c.phones || []).some((x) => digits(x) === ph)))
    || (p.lastName && customers.find((c) => norm(c.lastName) === norm(p.lastName) && (!p.city || c.objects.some((o) => norm(o.address.city) === norm(p.city))))) || null;
  const preset = { kind: ['kontrola', 'revize', 'frezovani'].includes(p.kind) ? p.kind : 'ostatni', prefer: PREFS.includes(p.prefer) ? p.prefer : '', note: [p.prefer && !PREFS.includes(p.prefer) ? `hodí se ${p.prefer}` : '', p.note].filter(Boolean).join(' · '), desiredDate: /^\d{4}-\d{2}-\d{2}$/.test(p.desiredDate || '') ? p.desiredDate : '' };
  if (!customer && (p.lastName || p.phone)) preset.newCustomer = p;
  return newInquiry(done, null, { ...preset, customer, original });
}

async function newTrip(done) {
  const r = await modal({
    title: 'Nový výjezd',
    body: String(html`
      <label class="field"><span>Datum</span><input class="input" type="date" id="tr-date" value="${isoDate(new Date())}"></label>
      <div class="field" style="margin-top:10px"><span>Typ</span><div class="chips"><label class="chip"><input type="radio" name="tr-type" value="obec" checked> Den v obci</label><label class="chip"><input type="radio" name="tr-type" value="okruzni"> Okružní výjezd</label></div></div>
      <label class="field" style="margin-top:10px"><span>Obce (oddělit čárkou)</span><input class="input" id="tr-v" placeholder="např. Hnojice, Šternberk"></label>
      <p class="sub">Den v obci = obec vyhlásí termín. Okružní = víc obcí za sebou (časy jízdy doplní Mapy.cz v etapě 5).</p>`),
    actions: [{ label: 'Zrušit', value: null }, { label: 'Vytvořit výjezd', kind: 'primary', value: (root) => ({ date: root.querySelector('#tr-date').value, type: root.querySelector('input[name="tr-type"]:checked').value, villages: root.querySelector('#tr-v').value.split(',').map((x) => x.trim()).filter(Boolean) }) }],
  });
  if (!r?.date) return;
  await createTrip(r);
  toast('Výjezd vytvořen');
  done();
}

// Nová poptávka: existující zákazník (hledání) nebo nový
async function newInquiry(done, go, preset = {}) {
  const customers = await listCustomers();
  const st = { q: '', customer: null, objectId: null, kind: 'kontrola', prefer: '', note: '', desiredDate: '', newCustomer: null, ...preset };
  if (st.customer) st.objectId = st.customer.objects.find((o) => !preset.newCustomer?.city || norm(o.address.city) === norm(preset.newCustomer.city))?.id || st.customer.objects[0]?.id;
  if (!KIND_LABEL[st.kind]) st.kind = Object.keys(KIND_LABEL).includes('ostatni') ? 'ostatni' : 'kontrola';
  let resolveDone;
  const finished = new Promise((r) => { resolveDone = r; });
  const root = document.getElementById('modal-root');
  const nc = st.newCustomer;
  const draw = () => {
    const found = st.q.length >= 2 ? customers.filter((c) => matches(c, st.q)).slice(0, 6) : [];
    root.innerHTML = String(html`<div class="modal-back"><div class="modal wide" role="dialog" aria-modal="true" aria-label="Nová poptávka">
      <h2>Nová poptávka</h2>
      ${st.customer ? html`<div class="card" style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center"><b>${displayName(st.customer)}</b><button class="btn small" data-clear>Změnit</button></div>
        ${st.customer.objects.length > 1 ? html`<div class="chips">${st.customer.objects.map((o) => html`<button class="chip ${st.objectId === o.id ? 'on' : ''}" data-obj="${o.id}">${o.address.street}</button>`)}</div>` : ''}`
      : html`<label class="search">${icon('search')}<input id="nq-q" value="${st.q}" placeholder="Hledej zákazníka – jméno, obec, telefon…" autocomplete="off"></label>
        ${found.map((c) => html`<button class="row pick" data-pick="${c.id}"><span class="main"><span class="title">${displayName(c)}</span><span class="meta">${c.objects[0]?.address.street}, ${c.objects[0]?.address.city}</span></span></button>`)}
        ${nc ? html`<button class="btn primary" data-create>+ Založit zákazníka: ${[nc.firstName, nc.lastName].filter(Boolean).join(' ')}${nc.street || nc.city ? `, ${[nc.street, nc.city].filter(Boolean).join(', ')}` : ''}${nc.phone ? `, ${fmtPhone(nc.phone)}` : ''}</button>` : ''}
        <a class="btn soft" href="#zakaznik-novy" data-newc>+ Nový zákazník (formulář)</a>`}
      ${st.original ? html`<details class="sub"><summary>Původní zpráva</summary><p style="white-space:pre-wrap">${st.original.slice(0, 1500)}</p></details>` : ''}
      <div class="field"><span>Co chce</span><div class="chips">${Object.entries(KIND_LABEL).map(([k, l]) => html`<button class="chip ${st.kind === k ? 'on' : ''}" data-k="${k}">${l}</button>`)}</div></div>
      <div class="field"><span>Kdy se mu hodí</span><div class="chips">${PREFS.map((p) => html`<button class="chip ${st.prefer === p ? 'on' : ''}" data-p="${p}">${p}</button>`)}</div></div>
      <div class="grid c2"><label class="field"><span>Chce termín (nepovinné)</span><input class="input" type="date" id="nq-date" value="${st.desiredDate}"></label>
      <label class="field"><span>Poznámka</span><input class="input" id="nq-note" value="${st.note}" placeholder="např. jen po 16:00, volat manželce"></label></div>
      <div class="actions"><button class="btn" data-cancel>Zrušit</button><button class="btn primary" data-save ${st.customer ? '' : 'disabled'}>Uložit poptávku</button></div>
    </div></div>`);
    const q = root.querySelector('#nq-q');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); q.addEventListener('input', () => { st.q = q.value; draw(); }); }
    root.querySelector('#nq-date').addEventListener('change', (e) => { st.desiredDate = e.target.value; });
    root.querySelector('#nq-note').addEventListener('input', (e) => { st.note = e.target.value; });
    root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { st.customer = customers.find((c) => c.id === b.dataset.pick); st.objectId = st.customer.objects[0]?.id; draw(); }));
    root.querySelector('[data-clear]')?.addEventListener('click', () => { st.customer = null; draw(); });
    root.querySelectorAll('[data-obj]').forEach((b) => b.addEventListener('click', () => { st.objectId = b.dataset.obj; draw(); }));
    root.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { st.kind = b.dataset.k; draw(); }));
    root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { st.prefer = st.prefer === b.dataset.p ? '' : b.dataset.p; draw(); }));
    root.querySelector('[data-newc]')?.addEventListener('click', () => { root.innerHTML = ''; resolveDone(false); });
    root.querySelector('[data-create]')?.addEventListener('click', async () => {
      const c = emptyCustomer();
      Object.assign(c, { firstName: nc.firstName || '', lastName: nc.lastName || '', phones: [nc.phone || ''], email: nc.email || '', source: 'zpráva', delivery: nc.email && !nc.phone ? 'email' : 'whatsapp' });
      Object.assign(c.objects[0].address, { street: nc.street || '', city: nc.city || '' });
      if (nc.fuel === 'plyn') c.objects[0].chimneys[0].fuel = 'plyn';
      try { const { completeAddress } = await import('../mapy.js'); await completeAddress(c.objects[0]); } catch { /* doplní se později */ }
      st.customer = await saveCustomer(c); st.objectId = c.objects[0].id; customers.push(st.customer);
      toast('Zákazník založen – detaily doplníš v kartě'); draw();
    });
    root.querySelector('[data-cancel]').addEventListener('click', () => { root.innerHTML = ''; resolveDone(false); });
    root.querySelector('[data-save]').addEventListener('click', async () => {
      await createInquiry({ customerId: st.customer.id, objectId: st.objectId, kind: st.kind, prefer: st.prefer, note: st.note, desiredDate: st.desiredDate, stage: 'open' });
      root.innerHTML = '';
      toast('Poptávka uložena');
      state.tab = 'poptavky';
      done();
      resolveDone(true);
    });
  };
  draw();
  return finished;
}
