// Kalendář – diář: návštěvy, výjezdy, osobní události, úkoly a vytížení roku
import { all, put, del, uid } from '../db.js';
import { settings } from '../settings.js';
import { displayName } from '../customers.js';
import { nextCheck } from '../lhuty.js';
import { TRIP_TYPES, KIND_LABEL } from '../planning.js';
import { html, icon, toast, modal, isoDate, parseIso, fmtDayLong, monthName } from '../ui.js';

const state = { month: null, day: null, view: 'mesic' };
const DOW = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

export async function render(el, { args }) {
  const a = args.join('-');
  if (a === 'rok') state.view = 'rok';
  else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) { state.view = 'mesic'; state.day = a; state.month = a.slice(0, 7); }
  if (!state.day) state.day = isoDate(new Date());
  if (!state.month) state.month = state.day.slice(0, 7);
  const [appts, events, customers] = await Promise.all([all('appointments'), all('events'), all('customers')]);
  const cust = new Map(customers.map((c) => [c.id, c]));

  el.innerHTML = String(html`
    <div class="page-head">
      <h1>Kalendář</h1>
      <div class="seg"><button class="${state.view === 'mesic' ? 'on' : ''}" data-view="mesic">Měsíc</button><button class="${state.view === 'rok' ? 'on' : ''}" data-view="rok">Vytížení roku</button></div>
      <span class="grow"></span>
      ${state.view === 'mesic' ? html`<button class="btn" data-m="-1" aria-label="Předchozí měsíc">‹</button><b class="month-title">${monthName(Number(state.month.slice(5)) - 1)} ${state.month.slice(0, 4)}</b><button class="btn" data-m="1" aria-label="Další měsíc">›</button><button class="btn soft" data-today>Dnes</button>` : ''}
    </div>
    <div id="cal"></div>`);
  el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; render(el, { args: [] }); }));
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    const d = parseIso(`${state.month}-01`); d.setMonth(d.getMonth() + Number(b.dataset.m)); state.month = isoDate(d).slice(0, 7); render(el, { args: [] });
  }));
  el.querySelector('[data-today]')?.addEventListener('click', () => { state.day = isoDate(new Date()); state.month = state.day.slice(0, 7); render(el, { args: [] }); });
  const box = el.querySelector('#cal');
  if (state.view === 'rok') yearView(box, customers, appts);
  else monthView(box, appts, events, cust, () => render(el, { args: [] }));
}

function monthView(box, appts, events, cust, rerender) {
  const first = parseIso(`${state.month}-01`);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const today = isoDate(new Date());
  const cells = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
  const byDay = (list, iso) => list.filter((x) => x.date === iso);
  const dayAppts = byDay(appts, state.day).filter((a) => a.status !== 'missed').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const dayEvents = byDay(events, state.day);

  box.innerHTML = String(html`
    <div class="cal-wrap">
      <div class="card cal">
        <div class="cal-grid">${DOW.map((d) => html`<span class="cal-dow">${d}</span>`)}
          ${cells.map((d) => {
            const iso = isoDate(d);
            const ap = byDay(appts, iso).filter((a) => a.status !== 'missed');
            const ev = byDay(events, iso);
            const trip = ev.find((e) => e.kind === 'vyjezd');
            const tasks = ev.filter((e) => e.kind === 'task' && !e.done).length;
            const other = ev.filter((e) => e.kind === 'event').length;
            return html`<button class="cal-day ${iso.slice(0, 7) !== state.month ? 'out' : ''} ${iso === today ? 'today' : ''} ${iso === state.day ? 'sel' : ''}" data-day="${iso}">
              <span class="cal-n">${d.getDate()}</span>
              ${trip ? html`<span class="cal-trip">${trip.villages[0] || TRIP_TYPES[trip.type]}</span>` : ''}
              ${ap.length ? html`<span class="cal-ap">${ap.length} ${ap.length === 1 ? 'návštěva' : ap.length < 5 ? 'návštěvy' : 'návštěv'}</span>` : ''}
              <span class="cal-dots">${other ? html`<i class="dot-ev"></i>` : ''}${tasks ? html`<i class="dot-task"></i>` : ''}</span>
            </button>`;
          })}
        </div>
      </div>
      <div class="card cal-side">
        <div class="card-title"><h3>${fmtDayLong(parseIso(state.day))}</h3><a class="btn small" href="#dnes" ${state.day === today ? '' : 'hidden'}>Plán dne</a></div>
        ${dayEvents.filter((e) => e.kind === 'vyjezd').map((t) => html`<div class="ev trip"><b>${TRIP_TYPES[t.type]}</b><span>${t.villages.join(', ')}</span><button class="btn small" data-del="${t.id}" aria-label="Smazat výjezd">✕</button></div>`)}
        ${dayAppts.map((a) => {
          const c = cust.get(a.customerId); if (!c) return '';
          const o = c.objects.find((x) => x.id === a.objectId) || c.objects[0];
          return html`<a class="ev appt ${a.status}" href="#karta-${c.id}"><b>${a.time || a.block || ''}</b><span>${displayName(c)} · ${o.address.city}<br><small>${KIND_LABEL[a.kind] || ''}${a.status === 'done' ? ' · hotovo' : ''}</small></span></a>`;
        })}
        ${dayEvents.filter((e) => e.kind === 'event').sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((e) => html`<div class="ev own"><b>${e.time || 'celý den'}</b><span>${e.title}${e.note ? html`<br><small>${e.note}</small>` : ''}</span><button class="btn small" data-del="${e.id}" aria-label="Smazat událost">✕</button></div>`)}
        ${dayEvents.filter((e) => e.kind === 'task').map((e) => html`<label class="ev task ${e.done ? 'done' : ''}"><input type="checkbox" data-task="${e.id}" ${e.done ? 'checked' : ''}><span>${e.title}</span><button class="btn small" data-del="${e.id}" aria-label="Smazat úkol">✕</button></label>`)}
        ${!dayAppts.length && !dayEvents.length ? html`<p class="sub">Volný den.</p>` : ''}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn small soft" data-add="event">${icon('plus')} Událost</button>
          <button class="btn small soft task-btn" data-add="task">${icon('check')} Úkol</button>
        </div>
        <p class="sub" style="font-size:12px;margin-bottom:0">Propojení s Google kalendářem přijde v etapě 7.</p>
      </div>
    </div>`);
  box.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { state.day = b.dataset.day; if (state.day.slice(0, 7) !== state.month) state.month = state.day.slice(0, 7); rerender(); }));
  box.querySelectorAll('[data-task]').forEach((c) => c.addEventListener('change', async () => {
    const e = events.find((x) => x.id === c.dataset.task); await put('events', { ...e, done: c.checked }); rerender();
  }));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const ok = await modal({ title: 'Smazat?', actions: [{ label: 'Zrušit', value: false }, { label: 'Smazat', value: true, kind: 'danger' }] });
    if (ok) { await del('events', b.dataset.del); rerender(); }
  }));
  box.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => {
    const isTask = b.dataset.add === 'task';
    const r = await modal({
      title: isTask ? 'Nový úkol' : 'Nová událost',
      body: String(html`<label class="field"><span>${isTask ? 'Co udělat' : 'Název'}</span><input class="input" id="ev-t" placeholder="${isTask ? 'např. zavolat na obec Hnojice' : 'např. doktor, jednání, volno'}"></label>
        ${isTask ? '' : html`<div class="grid c2" style="margin-top:10px"><label class="field"><span>Čas (nepovinné)</span><input class="input" type="time" id="ev-time"></label><label class="field"><span>Poznámka</span><input class="input" id="ev-n"></label></div>`}
        <label class="field" style="margin-top:10px"><span>Datum</span><input class="input" type="date" id="ev-d" value="${state.day}"></label>`),
      actions: [{ label: 'Zrušit', value: null }, { label: 'Uložit', kind: 'primary', value: (root) => ({ title: root.querySelector('#ev-t').value.trim(), time: root.querySelector('#ev-time')?.value || '', note: root.querySelector('#ev-n')?.value || '', date: root.querySelector('#ev-d').value }) }],
    });
    if (!r?.title) return;
    await put('events', { id: uid('e_'), kind: isTask ? 'task' : 'event', done: false, trial: !!settings().rezim.zkusebni, createdAt: new Date().toISOString(), ...r });
    toast(isTask ? 'Úkol přidán' : 'Událost přidána');
    rerender();
  }));
}

// Vytížení roku: kolik kontrol vychází v jednotlivých měsících (podle lhůt) a kolik je domluveno
function yearView(box, customers, appts) {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); months.push({ key: isoDate(d).slice(0, 7), d, due: 0, planned: 0, overdue: 0 }); }
  for (const c of customers) if (!c.archived) for (const o of c.objects || []) for (const k of o.chimneys || []) {
    const n = nextCheck(k); if (!n) continue;
    if (n < new Date(now.getFullYear(), now.getMonth(), 1)) { months[0].overdue++; continue; }
    const m = months.find((x) => x.key === isoDate(n).slice(0, 7)); if (m) m.due++;
  }
  for (const a of appts) if (a.status !== 'missed') { const m = months.find((x) => x.key === a.date.slice(0, 7)); if (m) m.planned++; }
  const max = Math.max(1, ...months.map((m) => m.due + (m === months[0] ? m.overdue : 0)), ...months.map((m) => m.planned));
  box.innerHTML = String(html`
    <div class="card">
      <p class="sub" style="margin-top:0">Kolik komínů vychází na kontrolu v jednotlivých měsících (podle lhůt v kartách) a kolik návštěv už je domluveno. Kde se termíny hromadí, oslov lidi dřív v klidnějším měsíci.</p>
      <div class="year">${months.map((m, i) => {
        const due = m.due + (i === 0 ? m.overdue : 0);
        return html`<div class="ym">
          <span class="ym-l">${monthName(m.d.getMonth()).slice(0, 3)}<small>${m.d.getFullYear() !== now.getFullYear() ? ` ${m.d.getFullYear()}` : ''}</small></span>
          <span class="ym-bars"><span class="bar due" style="width:${Math.round(due / max * 100)}%"></span><span class="bar planned" style="width:${Math.round(m.planned / max * 100)}%"></span></span>
          <span class="ym-n"><b>${due}</b> k vyřízení${i === 0 && m.overdue ? html` <span class="tag bad">${m.overdue} propadlých</span>` : ''} · ${m.planned} domluveno</span>
        </div>`;
      })}</div>
      <div class="legend"><span><i class="bar due"></i> vychází podle lhůty</span><span><i class="bar planned"></i> domluvené návštěvy</span></div>
    </div>`);
}
