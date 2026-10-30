// Výběr termínu: datum, časový blok nebo přesný čas, případně výjezd
import { html, isoDate, fmtDayLong, parseIso } from './ui.js';
import { BLOCKS, upcomingTrips, TRIP_TYPES } from './planning.js';

export async function pickTermin({ title = 'Termín návštěvy', date = '', block = '', time = '', prefer = '', withTrips = true } = {}) {
  const trips = withTrips ? await upcomingTrips() : [];
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const st = { date: date || isoDate(new Date()), block, time, tripId: null };
    const draw = () => {
      root.innerHTML = String(html`
        <div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
          <h2>${title}</h2>
          ${prefer ? html`<div class="note-box">Zákazníkovi se hodí: <b>${prefer}</b></div>` : ''}
          ${trips.length ? html`<div class="field"><span>Naplánované výjezdy</span><div class="chips">${trips.slice(0, 8).map((t) => html`<button type="button" class="chip ${st.tripId === t.id ? 'on' : ''}" data-trip="${t.id}" data-date="${t.date}">${fmtDayLong(parseIso(t.date))} · ${t.villages.join(', ') || TRIP_TYPES[t.type]}</button>`)}</div></div>` : ''}
          <label class="field"><span>Datum</span><input class="input" type="date" id="t-date" value="${st.date}"></label>
          <div class="field"><span>Časový blok</span><div class="chips">${BLOCKS.map((b) => html`<button type="button" class="chip ${st.block === b ? 'on' : ''}" data-block="${b}">${b}</button>`)}</div></div>
          <label class="field"><span>Přesný čas (nepovinné)</span><input class="input" type="time" id="t-time" value="${st.time}"></label>
          <div class="actions"><button class="btn" data-cancel>Zrušit</button><button class="btn primary" data-ok>Uložit termín</button></div>
        </div></div>`);
      root.querySelector('#t-date').addEventListener('change', (e) => { st.date = e.target.value; st.tripId = null; });
      root.querySelector('#t-time').addEventListener('change', (e) => { st.time = e.target.value; });
      root.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', () => { st.block = st.block === b.dataset.block ? '' : b.dataset.block; draw(); }));
      root.querySelectorAll('[data-trip]').forEach((b) => b.addEventListener('click', () => { st.tripId = b.dataset.trip; st.date = b.dataset.date; draw(); }));
      root.querySelector('[data-cancel]').addEventListener('click', () => { root.innerHTML = ''; resolve(null); });
      root.querySelector('[data-ok]').addEventListener('click', () => { if (!st.date) return; root.innerHTML = ''; resolve({ ...st }); });
    };
    draw();
  });
}
