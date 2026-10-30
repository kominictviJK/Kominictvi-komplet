// Zákazníci – hledání podle čehokoli, filtry, seznam a strom okres → obec → ulice
import { all } from '../db.js';
import { listCustomers, matches, buildTree, displayName, TYPES } from '../customers.js';
import { customerDue, DUE_TAG, FUEL_LABEL } from '../lhuty.js';
import { html, icon, fmtPhone } from '../ui.js';

const state = { q: '', filter: 'vse', view: 'seznam' };

const FILTERS = [
  { id: 'vse', label: 'Všichni' },
  { id: 'oslovit', label: 'Lhůta do 3 měsíců', test: (c, d) => ['soon', 'contact'].includes(d.state) },
  { id: 'propadla', label: 'Propadlá lhůta', test: (c, d) => d.state === 'overdue' },
  { id: 'tuha', label: 'Tuhá paliva', test: (c) => hasFuel(c, 'tuha') },
  { id: 'plyn', label: 'Plyn', test: (c) => hasFuel(c, 'plyn') },
  { id: 'novy', label: 'Noví', test: (c) => c.isNew },
  { id: 'firmy', label: 'Firmy, obce, SVJ', test: (c) => c.type !== 'osoba' },
  { id: 'archiv', label: 'Archiv' },
];
const hasFuel = (c, f) => (c.objects || []).some((o) => o.chimneys.some((k) => k.fuel === f));

export async function render(el, { args }) {
  if (args[0] === 'strom') state.view = 'strom';
  const [active, archived, docs] = await Promise.all([listCustomers(), listCustomers({ archived: true }), all('documents')]);
  const docsBy = new Map();
  for (const d of docs) { if (!docsBy.has(d.customerId)) docsBy.set(d.customerId, []); docsBy.get(d.customerId).push(d); }

  el.innerHTML = String(html`
    <div class="page-head">
      <h1>Zákazníci</h1>
      <span class="sub">${active.length} aktivních${archived.length ? ` · ${archived.length} v archivu` : ''}</span>
      <span class="grow"></span>
      <div class="seg" role="tablist">
        <button class="${state.view === 'seznam' ? 'on' : ''}" data-view="seznam">Seznam</button>
        <button class="${state.view === 'strom' ? 'on' : ''}" data-view="strom">Okres → obec → ulice</button>
      </div>
      <a class="btn primary" href="#zakaznik-novy">${icon('plus')} Nový zákazník</a>
    </div>
    <label class="search" style="margin-bottom:12px">${icon('search')}
      <input id="q" type="search" value="${state.q}" placeholder="Jméno, obec, ulice, telefon, spotřebič, číslo zprávy…" autocomplete="off" aria-label="Hledat zákazníka">
    </label>
    <div class="chips" style="margin-bottom:14px">
      ${FILTERS.map((f) => html`<button class="chip ${state.filter === f.id ? 'on' : ''}" data-filter="${f.id}">${f.label}</button>`)}
    </div>
    <div id="results"></div>
  `);

  const results = el.querySelector('#results');
  const draw = () => {
    const today = new Date();
    const f = FILTERS.find((x) => x.id === state.filter);
    const base = state.filter === 'archiv' ? archived : active;
    const items = base
      .map((c) => ({ c, due: customerDue(c, today) }))
      .filter(({ c, due }) => (!f.test || f.test(c, due)) && matches(c, state.q, docsBy.get(c.id)));
    results.innerHTML = String(state.view === 'strom' ? tree(items) : list(items));
  };
  draw();

  el.querySelector('#q').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
  el.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    el.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    el.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
}

function list(items) {
  if (!items.length) return html`<div class="card empty">Nikdo neodpovídá hledání. Zkus jiné slovo nebo zruš filtr.</div>`;
  return html`<div class="list">${items.map(({ c, due }) => row(c, due))}</div>
    <p class="sub" style="text-align:center">${items.length} ${items.length === 1 ? 'zákazník' : items.length < 5 ? 'zákazníci' : 'zákazníků'}</p>`;
}

function row(c, due) {
  const objs = c.objects || [];
  const a = objs[0]?.address || {};
  const fuels = [...new Set(objs.flatMap((o) => o.chimneys.map((k) => FUEL_LABEL[k.fuel])))].join(', ');
  return html`
    <a class="row" href="#karta-${c.id}">
      <span class="main">
        <span class="title">${displayName(c)}
          ${c.type !== 'osoba' ? html` <span class="tag">${TYPES[c.type]}</span>` : ''}
          ${c.isNew ? html` <span class="tag new">NOVÝ</span>` : ''}
          ${(c.tags || []).map((t) => html` <span class="tag">${t}</span>`)}
        </span>
        <span class="meta">${a.street ? `${a.street}, ${a.city}` : 'bez adresy'}${objs.length > 1 ? ` + ${objs.length - 1} další objekt${objs.length > 2 ? 'y' : ''}` : ''} · ${fuels || 'bez komínu'}</span>
      </span>
      <span style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        <span class="tag ${DUE_TAG[due.state]}">${due.label}</span>
        <span class="sub" style="font-size:14px">${(c.phones || []).filter(Boolean).map(fmtPhone).join(' · ')}</span>
      </span>
      <span class="chev">›</span>
    </a>`;
}

function tree(items) {
  if (!items.length) return html`<div class="card empty">Nikdo neodpovídá hledání.</div>`;
  const dueOf = new Map(items.map((i) => [i.c.id, i.due]));
  const t = buildTree(items.map((i) => i.c));
  const count = (arr) => arr.length;
  return html`<div class="tree">${t.map((d) => html`
    <details open class="card tree-d">
      <summary><b>${d.name}</b> <span class="sub">${d.cities.length} ${d.cities.length === 1 ? 'obec' : d.cities.length < 5 ? 'obce' : 'obcí'}</span></summary>
      ${d.cities.map((city) => {
        const n = city.streets.reduce((s, x) => s + x.items.length, 0);
        const urgent = city.streets.flatMap((s) => s.items).filter((i) => ['overdue', 'soon', 'contact'].includes(dueOf.get(i.customer.id)?.state)).length;
        return html`
          <details class="tree-c">
            <summary><b>${city.name}</b> <span class="sub">${n} ${n === 1 ? 'objekt' : n < 5 ? 'objekty' : 'objektů'}</span>${urgent ? html` <span class="tag warn">${urgent} k oslovení</span>` : ''}</summary>
            ${city.streets.map((s) => html`
              <div class="tree-s">
                <span class="tree-sn">${s.name} <span class="sub">(${count(s.items)})</span></span>
                ${s.items.map(({ customer, object }) => {
                  const due = dueOf.get(customer.id);
                  return html`<a class="row" href="#karta-${customer.id}"><span class="main"><span class="title" style="font-size:16px">${displayName(customer)}</span><span class="meta">${object.address.street}</span></span><span class="tag ${DUE_TAG[due.state]}">${due.label}</span><span class="chev">›</span></a>`;
                })}
              </div>`)}
          </details>`;
      })}
    </details>`)}</div>`;
}
