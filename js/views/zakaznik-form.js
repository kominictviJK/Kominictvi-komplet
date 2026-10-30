// Nový zákazník / úprava zákazníka
import { all } from '../db.js';
import { getCustomer, saveCustomer, emptyCustomer, emptyObject, emptyChimney, findDuplicates, displayName, TYPES, DELIVERY, APPLIANCES } from '../customers.js';
import { html, toast, modal } from '../ui.js';
import { hasKey, completeAddress } from '../mapy.js';

let draft = null;

export async function render(el, { args, go }) {
  const editId = args[0] === 'upravit' ? args[1] : null;
  if (!draft || draft.__for !== (editId || 'new')) {
    const base = editId ? await getCustomer(editId) : emptyCustomer();
    if (!base) { el.innerHTML = String(html`<div class="card empty">Zákazník nenalezen.</div>`); return; }
    draft = structuredClone(base);
    draft.__for = editId || 'new';
    draft.__orig = Object.fromEntries((base.objects || []).map((o) => [o.id, [o.address.street, o.address.city].join('|')]));
    if (!draft.phones?.length) draft.phones = [''];
  }
  draw(el, editId, go);
}

const setPath = (obj, path, value) => {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { o = o[k]; });
  o[keys.at(-1)] = value;
};

function draw(el, editId, go) {
  const d = draft;
  const isPerson = d.type === 'osoba';
  el.innerHTML = String(html`
    <div class="page-head">
      <a class="btn small" href="${editId ? `#karta-${editId}` : '#zakaznici'}" data-act="cancel">‹ Zpět</a>
      <h1>${editId ? `Upravit: ${displayName(d)}` : 'Nový zákazník'}</h1>
      <span class="grow"></span>
      <button class="btn primary" data-act="save">Uložit</button>
    </div>

    <div class="card form-card">
      <div class="seg" style="margin-bottom:14px">${Object.entries(TYPES).map(([k, v]) => html`<button type="button" class="${d.type === k ? 'on' : ''}" data-type="${k}">${v}</button>`)}</div>
      <div class="grid c2">
        ${isPerson ? html`
          <label class="field"><span>Jméno</span><input id="f-first" data-bind="firstName" value="${d.firstName}" autocomplete="off"></label>
          <label class="field"><span>Příjmení *</span><input id="f-last" data-bind="lastName" value="${d.lastName}" autocomplete="off"></label>
        ` : html`
          <label class="field"><span>Název *</span><input id="f-name" data-bind="name" value="${d.name}" autocomplete="off"></label>
          <label class="field"><span>IČO</span><input id="f-ico" data-bind="ico" value="${d.ico}" inputmode="numeric" placeholder="doplnění z ARES přijde v etapě 7"></label>
        `}
        ${d.phones.map((p, i) => html`
          <label class="field"><span>Telefon ${d.phones.length > 1 ? i + 1 : ''}</span>
            <span style="display:flex;gap:8px"><input id="f-phone-${i}" data-bind="phones.${i}" value="${p}" inputmode="tel" style="flex-grow:1">
            ${d.phones.length > 1 ? html`<button type="button" class="btn small" data-del-phone="${i}" aria-label="Odebrat telefon">✕</button>` : ''}</span>
          </label>`)}
        <label class="field"><span>E-mail</span><input id="f-email" data-bind="email" value="${d.email}" inputmode="email" autocomplete="off"></label>
      </div>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        <button type="button" class="btn small soft" data-act="add-phone">+ další telefon</button>
      </div>
      <div class="grid c2" style="margin-top:14px">
        <div class="field"><span>Zprávy posílat</span><div class="chips">${Object.entries(DELIVERY).map(([k, v]) => html`<button type="button" class="chip ${d.delivery === k ? 'on' : ''}" data-delivery="${k}">${v}</button>`)}</div></div>
        <div class="field"><span>Zákazník</span><div class="chips"><button type="button" class="chip ${d.isNew ? 'on' : ''}" data-new="1">NOVÝ</button><button type="button" class="chip ${!d.isNew ? 'on' : ''}" data-new="0">stálý</button></div></div>
        <label class="field"><span>Štítky (oddělit čárkou)</span><input id="f-tags" data-bind="tags" data-list="1" value="${(d.tags || []).join(', ')}" placeholder="např. VIP, platí fakturou"></label>
        <label class="field"><span>Odkud zákazník je</span><input id="f-source" data-bind="source" value="${d.source}" placeholder="doporučení, obec, web…"></label>
      </div>
      <label class="field" style="margin-top:12px"><span>Poznámka (jen pro tebe)</span><textarea id="f-note" data-bind="note">${d.note}</textarea></label>
    </div>

    ${d.objects.map((o, oi) => html`
      <div class="card form-card">
        <div class="card-title"><h3>Objekt ${d.objects.length > 1 ? oi + 1 : ''}${o.address.lat ? html` <span class="tag ok">na mapě</span>` : ''}</h3><span style="display:flex;gap:8px">${hasKey() ? html`<button type="button" class="btn small soft" data-geo="${oi}">Doplnit PSČ a polohu</button>` : ''}${d.objects.length > 1 ? html`<button type="button" class="btn small danger" data-del-obj="${oi}">Odebrat objekt</button>` : ''}</span></div>
        <div class="grid c4">
          <label class="field" style="grid-column:span 2"><span>Ulice a číslo</span><input id="f-o${oi}-street" data-bind="objects.${oi}.address.street" value="${o.address.street}"></label>
          <label class="field"><span>Obec</span><input id="f-o${oi}-city" data-bind="objects.${oi}.address.city" value="${o.address.city}"></label>
          <label class="field"><span>PSČ</span><input id="f-o${oi}-zip" data-bind="objects.${oi}.address.zip" value="${o.address.zip}" inputmode="numeric" placeholder="doplní se samo"></label>
          <label class="field" style="grid-column:span 2"><span>Okres</span><input id="f-o${oi}-district" data-bind="objects.${oi}.address.district" value="${o.address.district}" placeholder="např. Olomouc"></label>
        </div>
        ${o.chimneys.map((k, ki) => html`
          <div class="chimney-box">
            <div class="card-title"><b>${k.label}</b>${o.chimneys.length > 1 ? html`<button type="button" class="btn small" data-del-ch="${oi}.${ki}">Odebrat komín</button>` : ''}</div>
            <div class="grid c2">
              <div class="field"><span>Palivo</span><div class="chips">
                ${[['tuha', 'Tuhá'], ['plyn', 'Plyn'], ['kapalna', 'Kapalná']].map(([v, l]) => html`<button type="button" class="chip ${k.fuel === v ? 'on' : ''}" data-fuel="${oi}.${ki}.${v}">${l}</button>`)}
                ${k.fuel === 'plyn' ? html`<button type="button" class="chip ${k.condensing ? 'on' : ''}" data-cond="${oi}.${ki}">kondenzační (24 měs.)</button>` : ''}
              </div></div>
              <label class="field"><span>Poslední kontrola</span><input id="f-o${oi}-k${ki}-last" type="date" data-bind="objects.${oi}.chimneys.${ki}.lastCheck" value="${k.lastCheck || ''}"></label>
            </div>
            ${k.appliances.map((ap, ai) => html`
              <div class="grid c4" style="margin-top:10px">
                <label class="field"><span>Spotřebič ${k.appliances.length > 1 ? ai + 1 : ''}</span>
                  <select id="f-o${oi}-k${ki}-a${ai}-kind" data-bind="objects.${oi}.chimneys.${ki}.appliances.${ai}.kind">${APPLIANCES.map((x) => html`<option ${ap.kind === x ? 'selected' : ''}>${x}</option>`)}</select></label>
                <label class="field"><span>Značka / typ</span><input id="f-o${oi}-k${ki}-a${ai}-brand" data-bind="objects.${oi}.chimneys.${ki}.appliances.${ai}.brand" value="${ap.brand}"></label>
                <label class="field"><span>Výkon kW</span><input id="f-o${oi}-k${ki}-a${ai}-kw" data-bind="objects.${oi}.chimneys.${ki}.appliances.${ai}.kw" value="${ap.kw}" inputmode="decimal"></label>
                <label class="field"><span>Podlaží</span><input id="f-o${oi}-k${ki}-a${ai}-floor" data-bind="objects.${oi}.chimneys.${ki}.appliances.${ai}.floor" value="${ap.floor}" placeholder="1. NP, PP…"></label>
              </div>`)}
            ${k.appliances.length < 2 ? html`<button type="button" class="btn small soft" style="margin-top:10px" data-add-ap="${oi}.${ki}">+ druhý spotřebič na tento komín</button>` : ''}
          </div>`)}
        <button type="button" class="btn small soft" style="margin-top:12px" data-add-ch="${oi}">+ další komín</button>
      </div>`)}
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:12px">
      <button type="button" class="btn soft" data-act="add-obj">+ další objekt (jiná adresa)</button>
      <button class="btn primary" data-act="save">Uložit zákazníka</button>
    </div>
  `);

  const redraw = () => { const y = el.scrollTop; draw(el, editId, go); el.scrollTop = y; };
  el.querySelectorAll('[data-bind]').forEach((inp) => inp.addEventListener('input', () => {
    const v = inp.dataset.list ? inp.value.split(',').map((x) => x.trim()).filter(Boolean) : inp.value;
    setPath(d, inp.dataset.bind, v);
  }));
  const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => { fn(b); redraw(); }));
  on('[data-type]', (b) => { d.type = b.dataset.type; });
  on('[data-delivery]', (b) => { d.delivery = b.dataset.delivery; });
  on('[data-new]', (b) => { d.isNew = b.dataset.new === '1'; });
  on('[data-act="add-phone"]', () => d.phones.push(''));
  on('[data-del-phone]', (b) => d.phones.splice(Number(b.dataset.delPhone), 1));
  on('[data-act="add-obj"]', () => d.objects.push(emptyObject()));
  on('[data-del-obj]', (b) => d.objects.splice(Number(b.dataset.delObj), 1));
  on('[data-add-ch]', (b) => { const o = d.objects[Number(b.dataset.addCh)]; o.chimneys.push(emptyChimney(o.chimneys.length + 1)); });
  on('[data-del-ch]', (b) => { const [oi, ki] = b.dataset.delCh.split('.').map(Number); d.objects[oi].chimneys.splice(ki, 1); });
  on('[data-add-ap]', (b) => { const [oi, ki] = b.dataset.addAp.split('.').map(Number); d.objects[oi].chimneys[ki].appliances.push({ kind: 'kotel', brand: '', kw: '', floor: '' }); });
  on('[data-fuel]', (b) => { const [oi, ki, v] = b.dataset.fuel.split('.'); const k = d.objects[oi].chimneys[ki]; k.fuel = v; if (v !== 'plyn') k.condensing = false; });
  on('[data-cond]', (b) => { const [oi, ki] = b.dataset.cond.split('.').map(Number); const k = d.objects[oi].chimneys[ki]; k.condensing = !k.condensing; });
  el.querySelectorAll('[data-geo]').forEach((b) => b.addEventListener('click', async () => {
    const o = d.objects[Number(b.dataset.geo)];
    o.address.lat = null;
    try { toast((await completeAddress(o)) ? 'Doplněno z Mapy.cz' : 'Adresu se nepodařilo najít'); } catch (e) { toast(e.message); }
    redraw();
  }));
  el.querySelector('[data-act="cancel"]').addEventListener('click', () => { draft = null; });
  el.querySelectorAll('[data-act="save"]').forEach((b) => b.addEventListener('click', () => save(go)));
}

async function save(go) {
  const d = draft;
  if (d.type === 'osoba' ? !d.lastName.trim() : !d.name.trim()) { toast(d.type === 'osoba' ? 'Doplň příjmení' : 'Doplň název'); return; }
  const c = structuredClone(d);
  delete c.__for;
  c.phones = c.phones.map((p) => p.trim()).filter(Boolean);
  for (const o of c.objects) for (const k of o.chimneys) for (const ap of k.appliances) ap.kw = ap.kw === '' ? '' : Number(String(ap.kw).replace(',', '.')) || '';
  const dups = findDuplicates(c, (await all('customers')).filter((x) => !x.archived));
  if (dups.length) {
    const choice = await modal({
      title: 'Možná duplicita',
      body: String(html`<p>Podobný zákazník už existuje:</p>${dups.map((x) => html`<p><b>${displayName(x)}</b> · ${x.objects?.[0]?.address?.street || ''} ${x.objects?.[0]?.address?.city || ''} · ${(x.phones || []).join(', ')}</p>`)}`),
      actions: [{ label: 'Otevřít existujícího', value: 'open' }, { label: 'Přesto uložit', value: 'save', kind: 'primary' }],
    });
    if (choice === 'open') { draft = null; go(`karta/${dups[0].id}`); return; }
    if (choice !== 'save') return;
  }
  // poloha, PSČ a okres z Mapy.cz (pokud chybí nebo se změnila adresa)
  if (hasKey() && navigator.onLine) {
    const orig = d.__orig || {};
    for (const o of c.objects) {
      const before = orig[o.id];
      const changed = !before || before !== [o.address.street, o.address.city].join('|');
      if (!o.address.lat || changed) { try { await completeAddress(o); } catch { /* bez polohy, doplní se později */ } }
    }
  }
  delete c.__orig;
  const saved = await saveCustomer(c);
  draft = null;
  toast('Zákazník uložen');
  go(`karta/${saved.id}`);
}
