// Návštěva: šablona → formulář zprávy → platba → podpis → hotovo (odeslání)
import { get } from '../db.js';
import { settings } from '../settings.js';
import { displayName } from '../customers.js';
import { FUEL_LABEL } from '../lhuty.js';
import {
  FUELS, APPLIANCE_KINDS, PLACEMENTS, FLOORS, BODY_TYPES, LINERS, FLUES, DEFECTS, RECOMMENDATIONS, CONCLUSIONS, elbowsText, label,
} from '../catalog.js';
import {
  KINDS, createDraft, saveDraft, openDraftForAppointment, lastFinalDocument, chimneyFrom, suggestConclusion, missing, finalize, reserveNumber,
} from '../visit.js';
import { buildVisitPdf } from '../pdf.js';
import { spdString, qrSvg, paymentTotal, METHODS } from '../payment.js';
import { signaturePad } from '../signature.js';
import { shareDocument } from '../share.js';
import { html, raw, icon, toast, modal, fmtMoney, fmtDate, parseIso } from '../ui.js';
import { uid } from '../db.js';
import { PURPOSES, P_FLUES, P_LINERS, CLEANING, ROOFS, CONTRACTORS } from '../protocol.js';

const STEPS = [['formular', 'Zpráva'], ['platba', 'Platba'], ['podpis', 'Podpis'], ['hotovo', 'Odeslání']];

export async function render(el, { args, go }) {
  // #navsteva-zacit-<appointmentId> | #navsteva-zakaznik-<customerId>[-<objectId>] | #navsteva-<draftId>
  if (args[0] === 'zacit' || args[0] === 'zakaznik') return chooseTemplate(el, args, go);
  const d = await get('documents', args[0]);
  if (!d) { el.innerHTML = String(html`<div class="card empty">Návštěva nenalezena. <a href="#dnes">Zpět na Dnes</a></div>`); return; }
  const customer = await get('customers', d.customerId);
  if (d.status === 'final') d.step = 'hotovo';
  if (!d.step) d.step = d.kind === 'doklad' ? 'platba' : 'formular';
  const ctx = { el, d, customer, go };
  draw(ctx);
}

// ---------- Výběr šablony ----------
async function chooseTemplate(el, args, go) {
  let appointment = null, customerId, objectId;
  if (args[0] === 'zacit') {
    appointment = await get('appointments', args[1]);
    if (!appointment) { el.innerHTML = String(html`<div class="card empty">Návštěva nenalezena.</div>`); return; }
    const existing = await openDraftForAppointment(appointment.id);
    if (existing) { go(`navsteva/${existing.id}`); return; }
    customerId = appointment.customerId; objectId = appointment.objectId;
  } else { customerId = args[1]; objectId = args[2]; }
  const c = await get('customers', customerId);
  const obj = c.objects.find((o) => o.id === objectId) || c.objects[0];
  const last = await lastFinalDocument(c.id, obj.id);
  const tile = (kind, title, sub, extra = '') => html`
    <button class="template ${extra}" data-kind="${kind}">
      <b>${title}</b><span>${sub}</span>
    </button>`;
  el.innerHTML = String(html`
    <div class="page-head">
      <a class="btn small" href="${appointment ? '#dnes' : `#karta-${c.id}`}">‹ Zpět</a>
      <h1>${displayName(c)}</h1>
      <span class="sub">${obj.address.street}, ${obj.address.city}</span>
    </div>
    <h2 style="margin-bottom:12px">Co budeš vyplňovat?</h2>
    <div class="grid c3">
      ${last ? tile('same', 'Beze změn jako loni', `Převezme celou zprávu ${last.no}. Zkontroluješ jen závěr a cenu.`, 'accent') : ''}
      ${tile('zprava', 'Zpráva o kontrole a čištění', last ? 'Předvyplní se technický popis z minulé zprávy' : `${obj.chimneys.length} ${obj.chimneys.length === 1 ? 'komín' : 'komíny'} z karty zákazníka`)}
      ${tile('doklad', 'Jen doklad', 'Frézování, prohlídka kamerou, ostatní práce – doklad s podpisem')}
      ${tile('protokol', 'Protokol k revizi', 'Podklad pro revizní techničku – údaje se uloží do karty')}
    </div>
  `);
  el.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.kind;
    const d = await createDraft({ customerId: c.id, objectId: obj.id, appointmentId: appointment?.id, kind: k === 'same' ? 'zprava' : k, sameAsLast: k === 'same' });
    if (k === 'same') d.step = 'platba';
    await saveDraft(d);
    go(`navsteva/${d.id}`);
  }));
}

// ---------- Společné ----------
function draw(ctx) {
  const { el, d, customer } = ctx;
  const obj = customer.objects.find((o) => o.id === d.objectId) || customer.objects[0];
  const steps = d.kind === 'doklad' ? STEPS.slice(1) : STEPS;
  const idx = steps.findIndex(([k]) => k === d.step);
  el.innerHTML = String(html`
    <div class="page-head" style="margin-bottom:10px">
      <a class="btn small" href="#dnes">‹ Dnes</a>
      <h1>${displayName(customer)}</h1>
      <span class="sub">${obj.address.street}, ${obj.address.city} · ${KINDS[d.kind]}${d.no ? ` · č. ${d.no}` : ''}</span>
      ${d.trial ? html`<span class="tag warn">zkušební</span>` : ''}
    </div>
    <div class="stepper">${steps.map(([k, l], i) => html`<span class="${i < idx ? 'done' : i === idx ? 'on' : ''}">${i < idx ? '✓ ' : `${i + 1} `}${l}</span>`)}</div>
    <div id="step"></div>
  `);
  const box = el.querySelector('#step');
  ({ formular: d.kind === 'protokol' ? stepProtocol : stepForm, platba: stepPayment, podpis: stepSign, hotovo: stepDone })[d.step](box, ctx);
}

async function goStep(ctx, step) {
  ctx.d.step = step;
  await saveDraft(ctx.d);
  draw(ctx);
  ctx.el.scrollTop = 0;
}

const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };

// chip (jedna volba / více voleb)
const chipOne = (path, value, text, cur) => html`<button type="button" class="chip ${cur === value ? 'on' : ''}" data-set="${path}" data-v="${JSON.stringify(value)}">${text}</button>`;
const chipBool = (path, cur, text) => html`<button type="button" class="chip ${cur ? 'on' : ''}" data-set="${path}" data-v="${JSON.stringify(!cur)}">${text}</button>`;
const chipMany = (path, value, text, arr) => html`<button type="button" class="chip ${(arr || []).includes(value) ? 'on' : ''}" data-toggle="${path}" data-v="${JSON.stringify(value)}">${text}</button>`;
const inp = (path, value, { ph = '', type = 'text', mode = 'text', w = '' } = {}) => html`<input id="i-${path.replace(/\./g, '-')}" class="input" data-bind="${path}" value="${value ?? ''}" placeholder="${ph}" type="${type}" inputmode="${mode}" style="${w ? `width:${w}` : ''}">`;

// vazby kliknutí pro aktuální krok; po změně překreslí krok a zachová posun
function wire(box, ctx, redraw) {
  const { d } = ctx;
  const save = () => saveDraft(d);
  const keep = () => { const y = ctx.el.scrollTop; redraw(); ctx.el.scrollTop = y; };

  box.querySelectorAll('[data-bind]').forEach((i) => i.addEventListener('input', () => { setPath(d, i.dataset.bind, i.value); save(); }));
  box.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
    const v = JSON.parse(b.dataset.v);
    setPath(d, b.dataset.set, getPath(d, b.dataset.set) === v && typeof v !== 'boolean' ? '' : v);
    afterChange(d, b.dataset.set); save(); keep();
  }));
  box.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const v = JSON.parse(b.dataset.v);
    const arr = getPath(d, b.dataset.toggle) || [];
    setPath(d, b.dataset.toggle, arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    afterChange(d, b.dataset.toggle); save(); keep();
  }));
  box.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => {
    const [p, delta] = b.dataset.inc.split('|');
    const v = Math.max(0, (Number(getPath(d, p)) || 0) + Number(delta));
    setPath(d, p, v);
    const e = getPath(d, p.split('.').slice(0, -1).join('.'));
    if (v > 0 && e) e.none = false;
    save(); keep();
  }));
  return { save, keep };
}

// automatický návrh závěru, dokud ho uživatel sám nezmění
function afterChange(d, path) {
  const m = path.match(/^chimneys\.(\d+)\.(\w+)/);
  if (!m) return;
  const k = d.chimneys[Number(m[1])];
  if (m[2] === 'conclusion') { k.conclusionManual = true; return; }
  if (['defects', 'defectOther'].includes(m[2]) && !k.conclusionManual) k.conclusion = suggestConclusion(k);
  if (m[2] === 'defects' && k.defects.length) k.fixed.noDefects = k.fixed.noDefects && false;
}

// ---------- 1) Formulář zprávy ----------
function stepForm(box, ctx) {
  const { d } = ctx;
  box.innerHTML = String(html`
    ${d.sameAsLast ? html`<div class="note-box" style="margin-bottom:12px">Převzato z minulé zprávy beze změn. Projdi hlavně nedostatky a závěr.</div>` : ''}
    ${d.chimneys.map((k, i) => chimneyForm(k, i, d.chimneys.length))}
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px;flex-wrap:wrap">
      <button class="btn soft" data-act="add-ch">+ další komín</button>
      <button class="btn primary" data-act="next">Pokračovat na platbu ›</button>
    </div>
    <div class="card" style="margin-top:12px">
      <label class="field"><span>Interní poznámka (netiskne se)</span><textarea id="i-note" data-bind="note" placeholder="Jen pro tebe, např. co nabídnout příště">${d.note}</textarea></label>
    </div>
  `);
  const redraw = () => stepForm(box, ctx);
  wire(box, ctx, redraw);
  box.querySelector('[data-act="add-ch"]').addEventListener('click', async () => {
    const n = d.chimneys.length + 1;
    d.chimneys.push(chimneyFrom({ id: uid('k_'), label: `Komín ${n}`, fuel: 'tuha', appliances: [{}] }));
    const item = d.payment.items.find((x) => /kontrola a čištění/i.test(x.label));
    if (item) item.qty = d.chimneys.length;
    await saveDraft(d); redraw();
  });
  box.querySelectorAll('[data-del-ch]').forEach((b) => b.addEventListener('click', async () => {
    d.chimneys.splice(Number(b.dataset.delCh), 1);
    const item = d.payment.items.find((x) => /kontrola a čištění/i.test(x.label));
    if (item) item.qty = Math.max(1, d.chimneys.length);
    await saveDraft(d); redraw();
  }));
  box.querySelectorAll('[data-add-ap]').forEach((b) => b.addEventListener('click', async () => {
    d.chimneys[Number(b.dataset.addAp)].appliances.push(chimneyFrom({ appliances: [{}] }).appliances[0]);
    await saveDraft(d); redraw();
  }));
  box.querySelectorAll('[data-del-ap]').forEach((b) => b.addEventListener('click', async () => {
    const [ki, ai] = b.dataset.delAp.split('.').map(Number);
    d.chimneys[ki].appliances.splice(ai, 1);
    await saveDraft(d); redraw();
  }));
  box.querySelector('[data-act="next"]').addEventListener('click', () => goStep(ctx, 'platba'));
}

function chimneyForm(k, i, total) {
  const p = `chimneys.${i}`;
  const row = (title, content) => html`<div class="frow"><span class="flabel">${title}</span><div class="fval">${content}</div></div>`;
  return html`
    <div class="card fcard">
      <div class="card-title"><h2>${total > 1 ? `${i + 1}) ` : ''}${k.label}</h2>${total > 1 ? html`<button class="btn small danger" data-del-ch="${i}">Odebrat komín</button>` : ''}</div>
      ${row('Palivo', html`<div class="chips">${FUELS.map(([v, l]) => chipOne(`${p}.fuel`, v, l, k.fuel))}
        ${k.fuel === 'plyn' ? chipBool(`${p}.condensing`, k.condensing, 'kondenzační kotel') : ''}</div>`)}
      ${row('Ústřední topení', html`<div class="chips">${chipOne(`${p}.ut`, true, 'Ano', k.ut)}${chipOne(`${p}.ut`, false, 'Ne', k.ut)}</div>`)}

      ${k.appliances.map((a, ai) => {
        const ap = `${p}.appliances.${ai}`;
        const n = k.appliances.length > 1 ? ` ${ai + 1}` : '';
        const e = a.flue.elbows;
        return html`
          <div class="subcard">
            <div class="card-title"><h3>Spotřebič${n}</h3>${k.appliances.length > 1 ? html`<button class="btn small" data-del-ap="${i}.${ai}">Odebrat</button>` : ''}</div>
            ${row('Druh', html`<div class="chips">${APPLIANCE_KINDS.map((x) => chipOne(`${ap}.kind`, x, x, a.kind))}</div>
              ${a.kind === 'jiný' ? html`<div style="margin-top:8px">${inp(`${ap}.kindOther`, a.kindOther, { ph: 'jaký spotřebič' })}</div>` : ''}`)}
            ${row('Značka a výkon', html`<div class="inline">${inp(`${ap}.brand`, a.brand, { ph: 'značka / typ', w: '260px' })}${inp(`${ap}.kw`, a.kw, { ph: 'kW', mode: 'decimal', w: '90px' })}
              <span class="chips">${FLOORS.map((x) => chipOne(`${ap}.floor`, x, x, a.floor))}</span></div>`)}
            ${row('Umístění', html`<div class="chips">${PLACEMENTS.map((x) => chipMany(`${ap}.placement`, x, x, a.placement))}</div>
              ${a.placement.includes('jiné') ? html`<div style="margin-top:8px">${inp(`${ap}.placementOther`, a.placementOther, { ph: 'kde' })}</div>` : ''}`)}
            ${row('Kouřovod', html`<div class="chips">${FLUES.map((x) => chipOne(`${ap}.flue.material`, x, x, a.flue.material))}</div>
              ${a.flue.material === 'jiný' ? html`<div style="margin-top:8px">${inp(`${ap}.flue.materialOther`, a.flue.materialOther, { ph: 'jaký kouřovod' })}</div>` : ''}
              <div class="inline" style="margin-top:8px">${inp(`${ap}.flue.diameter`, a.flue.diameter, { ph: 'Ø mm', mode: 'numeric', w: '100px' })}${inp(`${ap}.flue.length`, a.flue.length, { ph: 'délka m', mode: 'decimal', w: '110px' })}</div>`)}
            ${row('Kolena', html`<div class="inline">
              ${[['e90', '90°'], ['e45', '45°'], ['flex', 'flexi']].map(([key, l]) => html`<span class="counter"><button type="button" data-inc="${ap}.flue.elbows.${key}|-1" aria-label="ubrat">−</button><b>${e[key] || 0}× ${l}</b><button type="button" data-inc="${ap}.flue.elbows.${key}|1" aria-label="přidat">+</button></span>`)}
              ${chipBool(`${ap}.flue.elbows.none`, e.none, 'bez kolen')}
              <span class="sub">${elbowsText(e)}</span></div>`)}
          </div>`;
      })}
      ${k.appliances.length < 2 ? html`<button class="btn small soft" data-add-ap="${i}" style="margin:6px 0 4px">+ druhý spotřebič na tento komín</button>` : ''}

      ${row('Komínové těleso', html`<div class="chips">${BODY_TYPES.map((x) => chipMany(`${p}.body`, x, x, k.body))}</div>`)}
      ${row('Vložka', html`<div class="chips">${LINERS.map((x) => chipOne(`${p}.liner.material`, x, x, k.liner.material))}</div>
        <div class="inline" style="margin-top:8px">${k.liner.material === 'jiná' ? inp(`${p}.liner.materialOther`, k.liner.materialOther, { ph: 'jaká vložka', w: '220px' }) : ''}${inp(`${p}.liner.diameter`, k.liner.diameter, { ph: 'světlost Ø mm', mode: 'numeric', w: '150px' })}</div>`)}
      ${row('Revizní zpráva', html`<div class="inline">${inp(`${p}.revisionNo`, k.revisionNo, { ph: 'číslo revizní zprávy', w: '220px' })}${chipBool(`${p}.revisionMissing`, k.revisionMissing, 'nedoloženo')}</div>`)}
      ${row('Účinná výška', html`<div class="inline">${inp(`${p}.height`, k.height, { ph: 'm', mode: 'decimal', w: '110px' })}<span class="sub">metrů</span></div>`)}

      <h3 class="fsec">Zjištěné nedostatky</h3>
      ${row('Odstraněné na místě', html`<div class="chips">${chipBool(`${p}.fixed.noDefects`, k.fixed.noDefects, 'bez viditelných závad')}${chipBool(`${p}.fixed.camera`, k.fixed.camera, 'prohlídka inspekční kamerou')}</div>
        <div style="margin-top:8px">${inp(`${p}.fixed.text`, k.fixed.text, { ph: 'co jsi odstranil na místě (nepovinné)' })}</div>`)}
      ${row('Neodstraněné', html`<div class="chips">${DEFECTS.map(([v, l]) => chipMany(`${p}.defects`, v, l, k.defects))}</div>
        <div style="margin-top:8px">${inp(`${p}.defectOther`, k.defectOther, { ph: 'jiná závada – dopiš' })}</div>`)}
      ${k.defects.length || k.defectOther.trim() ? row('Termín odstranění', html`<div class="inline">
        ${chipOne(`${p}.deadline.mode`, 'neprodlene', 'neprodleně', k.deadline.mode)}${chipOne(`${p}.deadline.mode`, 'nestanoven', 'nebyl stanoven', k.deadline.mode)}${chipOne(`${p}.deadline.mode`, 'datum', 'do data', k.deadline.mode)}
        ${k.deadline.mode === 'datum' ? inp(`${p}.deadline.date`, k.deadline.date, { type: 'date', w: '180px' }) : ''}</div>`) : ''}

      <h3 class="fsec">Doporučení</h3>
      ${row('', html`<div class="chips">${RECOMMENDATIONS.map(([v, l]) => chipMany(`${p}.recs`, v, l, k.recs))}</div>
        <div style="margin-top:8px">${inp(`${p}.recOther`, k.recOther, { ph: 'jiné doporučení – dopiš' })}</div>`)}

      <h3 class="fsec">Závěr</h3>
      <div class="chips conclusion">${CONCLUSIONS.map(([v, l]) => chipOne(`${p}.conclusion`, v, l, k.conclusion))}</div>
      ${!k.conclusionManual && k.conclusion ? html`<p class="sub" style="margin:6px 0 0">Navrženo podle nedostatků – můžeš změnit.</p>` : ''}
    </div>`;
}

// ---------- 1b) Protokol k revizi ----------
function stepProtocol(box, ctx) {
  const { d, customer } = ctx;
  const p = d.protocol;
  const q = 'protocol';
  const obj = customer.objects.find((o) => o.id === d.objectId) || customer.objects[0];
  const row = (title, content) => html`<div class="frow"><span class="flabel">${title}</span><div class="fval">${content}</div></div>`;
  const e = p.flue.elbows;
  box.innerHTML = String(html`
    <div class="card fcard">
      <div class="card-title"><h2>Protokol – revize spalinové cesty</h2><span class="sub">podklad pro revizní techničku</span></div>
      ${obj.chimneys.length > 1 ? row('Komín', html`<div class="chips">${obj.chimneys.map((k) => chipOne('protocolChimneyId', k.id, k.label, d.protocolChimneyId))}</div>`) : ''}
      ${row('Určení revize', html`<div class="chips">${PURPOSES.map(([v, l]) => chipOne(`${q}.purpose`, v, l, p.purpose))}</div>`)}
      ${row('Číslo kontrolní zprávy', inp(`${q}.checkReportNo`, p.checkReportNo, { ph: 'např. 5/10/2026', w: '200px' }))}
      ${row('Spotřebič', html`<div class="inline">${inp(`${q}.brand`, p.brand, { ph: 'značka / typ', w: '280px' })}${inp(`${q}.kw`, p.kw, { ph: 'kW', mode: 'decimal', w: '90px' })}</div>`)}
      ${row('Druh paliva', inp(`${q}.fuelText`, p.fuelText, { ph: 'dřevo, uhlí, zemní plyn…', w: '280px' }))}
      ${row('Umístění / patro', inp(`${q}.placementText`, p.placementText, { ph: '1. NP, obývací pokoj' }))}
      ${row('Kouřovod', html`<div class="chips">${P_FLUES.map((x) => chipOne(`${q}.flue.material`, x, x, p.flue.material))}</div>
        <div class="inline" style="margin-top:8px">${inp(`${q}.flue.diameterCm`, p.flue.diameterCm, { ph: 'průměr cm', mode: 'decimal', w: '120px' })}${inp(`${q}.flue.length`, p.flue.length, { ph: 'délka m', mode: 'decimal', w: '110px' })}</div>
        <div class="inline" style="margin-top:8px">${[['e90', '90°'], ['e45', '45°'], ['flex', 'flexi']].map(([key, l]) => html`<span class="counter"><button type="button" data-inc="${q}.flue.elbows.${key}|-1" aria-label="ubrat">−</button><b>${e[key] || 0}× ${l}</b><button type="button" data-inc="${q}.flue.elbows.${key}|1" aria-label="přidat">+</button></span>`)}
        ${chipBool(`${q}.flue.elbows.none`, e.none, 'bez kolen')}<span class="sub">${elbowsText(e)}</span></div>`)}
      ${row('Výšky a vložka', html`<div class="inline">${inp(`${q}.buildHeight`, p.buildHeight, { ph: 'stavební výška m', mode: 'decimal', w: '160px' })}${inp(`${q}.effHeight`, p.effHeight, { ph: 'účinná výška m', mode: 'decimal', w: '150px' })}${inp(`${q}.linerDiameterCm`, p.linerDiameterCm, { ph: 'průměr vložky cm', mode: 'decimal', w: '160px' })}</div>`)}
      ${row('Vložka', html`<div class="chips">${P_LINERS.map((x) => chipOne(`${q}.liner`, x, x, p.liner))}</div>`)}
      ${row('Čištění se provádí', html`<div class="chips">${CLEANING.map((x) => chipMany(`${q}.cleaning`, x, x, p.cleaning))}</div>`)}
      ${row('Vybírací otvor', inp(`${q}.openingPlace`, p.openingPlace, { ph: 'kde je umístěn, např. 1. NP', w: '280px' }))}
      ${row('Omítnutý po celé délce', html`<div class="inline">${chipOne(`${q}.plastered`, true, 'ano', p.plastered)}${chipOne(`${q}.plastered`, false, 'ne', p.plastered)}${!p.plastered ? inp(`${q}.plasteredWhere`, p.plasteredWhere, { ph: 'kde není', w: '240px' }) : ''}</div>`)}
      ${row('Výrobce komína / vložek', inp(`${q}.manufacturer`, p.manufacturer, { ph: 'např. Schiedel' }))}
      ${row('Zhotovitel', html`<div class="inline">${CONTRACTORS.map((x) => chipOne(`${q}.contractor`, x, x, p.contractor))}${p.contractor === 'odborná firma' ? inp(`${q}.contractorName`, p.contractorName, { ph: 'název firmy / nezjištěn', w: '260px' }) : ''}</div>`)}
      ${row('Popis stavby', inp(`${q}.building`, p.building, { ph: 'rodinný dům', w: '280px' }))}
      ${row('Typ střechy', html`<div class="inline">${ROOFS.map((x) => chipOne(`${q}.roof`, x, x, p.roof))}${p.roof === 'jiná' ? inp(`${q}.roofOther`, p.roofOther, { ph: 'jaká', w: '200px' }) : ''}</div>`)}
      ${row('Vzdálenost 5 cm od hořlavých', html`<div class="inline">${chipOne(`${q}.safeDistance`, true, 'ano', p.safeDistance)}${chipOne(`${q}.safeDistance`, false, 'není', p.safeDistance)}${!p.safeDistance ? inp(`${q}.safeDistanceWhere`, p.safeDistanceWhere, { ph: 'kde', w: '240px' }) : ''}</div>`)}
      ${row('Přívod vzduchu', inp(`${q}.airSupply`, p.airSupply, { ph: 'z místnosti, externí přívod…' }))}
      ${row('Další ventilátor', html`<div class="inline">${chipOne(`${q}.fan`, true, 'ano', p.fan)}${chipOne(`${q}.fan`, false, 'ne', p.fan)}${p.fan ? inp(`${q}.fanWhat`, p.fanWhat, { ph: 'jaký / kde, např. digestoř', w: '260px' }) : ''}</div>`)}
      <h3 class="fsec">Zjištěné nedostatky</h3>
      ${row('Odstraněné na místě', inp(`${q}.fixedText`, p.fixedText, { ph: 'žádné' }))}
      ${row('Neodstraněné', html`<div class="chips">${DEFECTS.map(([v, l]) => chipMany(`${q}.defects`, v, l, p.defects))}</div><div style="margin-top:8px">${inp(`${q}.defectOther`, p.defectOther, { ph: 'jiná závada – dopiš' })}</div>`)}
      ${p.defects.length || p.defectOther.trim() ? row('Termín odstranění', html`<div class="inline">${chipOne(`${q}.deadline.mode`, 'neprodlene', 'neprodleně', p.deadline.mode)}${chipOne(`${q}.deadline.mode`, 'nestanoven', 'nebyl stanoven', p.deadline.mode)}${chipOne(`${q}.deadline.mode`, 'datum', 'do data', p.deadline.mode)}${p.deadline.mode === 'datum' ? inp(`${q}.deadline.date`, p.deadline.date, { type: 'date', w: '180px' }) : ''}</div>`) : ''}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="next">Pokračovat na platbu ›</button></div>
  `);
  wire(box, ctx, () => stepProtocol(box, ctx));
  box.querySelector('[data-act="next"]').addEventListener('click', () => goStep(ctx, 'platba'));
}

// ---------- 2) Platba ----------
function stepPayment(box, ctx) {
  const { d } = ctx;
  const s = settings();
  const total = paymentTotal(d.payment.items);
  const qrText = d.payment.method === 'qr' && d.vs ? spdString({ account: s.firma.ucet, amount: total, vs: d.vs, message: `Kominictvi ${d.no}` }) : null;
  box.innerHTML = String(html`
    <div class="grid c2" style="align-items:start">
      <div class="card">
        <div class="card-title"><h2>Položky</h2><span class="big-total">${fmtMoney(total)}</span></div>
        ${d.kind === 'doklad' ? html`<label class="field" style="margin-bottom:10px"><span>Účel platby</span>${inp('purpose', d.purpose, { ph: 'např. frézování komínového průduchu' })}</label>` : ''}
        ${d.payment.items.map((it, i) => html`
          <div class="pitem">
            <div class="inline">${inp(`payment.items.${i}.label`, it.label, { w: '100%' })}<button class="btn small" data-del-item="${i}" aria-label="Odebrat položku">✕</button></div>
            <div class="inline" style="margin-top:6px">
              ${inp(`payment.items.${i}.qty`, it.qty, { mode: 'decimal', w: '80px' })}<span class="sub">${it.unit} ×</span>${inp(`payment.items.${i}.price`, it.price, { mode: 'numeric', w: '110px' })}<span class="sub">Kč</span>
              ${/kontrola a čištění/i.test(it.label) ? html`<span class="chips">${s.cenik.kontrola.map((c) => html`<button type="button" class="chip ${Number(it.price) === c ? 'on' : ''}" data-price="${i}|${c}">${c}</button>`)}</span>` : ''}
            </div>
          </div>`)}
        <div class="chips" style="margin-top:10px">
          <button class="chip" data-add-item="kamera">+ prohlídka kamerou</button>
          <button class="chip" data-add-item="frezovani">+ frézování (m)</button>
          <button class="chip" data-add-item="jine">+ jiná položka</button>
        </div>
      </div>
      <div class="card">
        <h2 style="margin-bottom:10px">Způsob platby</h2>
        <div class="paymethods">
          ${Object.entries(METHODS).map(([k, l]) => html`<button class="paym ${d.payment.method === k ? 'on' : ''}" data-method="${k}">${l}</button>`)}
        </div>
        ${d.payment.method === 'qr' ? html`
          <div class="qrbox">
            ${qrText ? raw(qrSvg(qrText, 230)) : html`<div class="note-box">${s.firma.ucet ? 'Číslo účtu nemá správný tvar (např. 2001234567/2010).' : 'QR kód půjde vytvořit, až doplníš číslo účtu v Nastavení → Firma a já.'}</div>`}
            <div><b style="font-size:24px;font-family:var(--head)">${fmtMoney(total)}</b><br><span class="sub">VS ${d.vs || '—'} · zákazník naskenuje QR v bankovní aplikaci</span></div>
          </div>
          <button class="chip ${d.payment.paid ? 'on' : ''}" data-set="payment.paid" data-v="${JSON.stringify(!d.payment.paid)}" style="margin-top:10px">${d.payment.paid ? '✓ Zaplaceno' : 'Označit jako zaplaceno'}</button>` : ''}
        ${d.payment.method === 'hotove' ? html`<p class="sub">Hotovost převezmeš a zákazník podepíše příjmový doklad.</p>` : ''}
        ${d.payment.method === 'faktura' ? html`<p class="sub">Zákazník nic nepodepisuje. Faktura se připraví ve Financích (etapa 6) a pošle se se zprávou.</p>` : ''}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:14px">
      ${d.kind !== 'doklad' ? html`<button class="btn" data-act="back">‹ Zpět na zprávu</button>` : html`<span></span>`}
      <button class="btn primary" data-act="next" ${d.payment.method ? '' : 'disabled'}>Pokračovat k podpisu ›</button>
    </div>
  `);
  const redraw = () => stepPayment(box, ctx);
  const { keep } = wire(box, ctx, redraw);
  // celková částka se přepočítá po dopsání
  box.querySelectorAll('[data-bind^="payment.items"]').forEach((i) => i.addEventListener('change', keep));
  box.querySelectorAll('[data-price]').forEach((b) => b.addEventListener('click', async () => {
    const [i, c] = b.dataset.price.split('|').map(Number); d.payment.items[i].price = c; await saveDraft(d); keep();
  }));
  box.querySelectorAll('[data-del-item]').forEach((b) => b.addEventListener('click', async () => { d.payment.items.splice(Number(b.dataset.delItem), 1); await saveDraft(d); keep(); }));
  box.querySelectorAll('[data-add-item]').forEach((b) => b.addEventListener('click', async () => {
    const t = b.dataset.addItem;
    d.payment.items.push(t === 'kamera' ? { id: uid('i_'), label: 'Prohlídka inspekční kamerou', qty: 1, unit: 'ks', price: s.cenik.kamera || 0 }
      : t === 'frezovani' ? { id: uid('i_'), label: 'Frézování komínového průduchu', qty: 1, unit: 'm', price: s.cenik.frezovaniZaMetr }
        : { id: uid('i_'), label: 'Jiná práce', qty: 1, unit: 'ks', price: 0 });
    await saveDraft(d); keep();
  }));
  box.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', async () => {
    d.payment.method = b.dataset.method;
    d.payment.paid = d.payment.method === 'hotove';
    if (d.payment.method === 'qr') await reserveNumber(d);
    await saveDraft(d); keep();
  }));
  box.querySelector('[data-act="back"]')?.addEventListener('click', () => goStep(ctx, 'formular'));
  box.querySelector('[data-act="next"]').addEventListener('click', () => {
    d.payment.items.forEach((it) => { it.qty = Number(String(it.qty).replace(',', '.')) || 0; it.price = Number(String(it.price).replace(',', '.')) || 0; });
    goStep(ctx, 'podpis');
  });
}

// ---------- 3) Kontrola a podpis ----------
function stepSign(box, ctx) {
  const { d, customer } = ctx;
  const gaps = d.kind === 'doklad' ? (d.payment.method ? [] : ['způsob platby']) : missing(d, customer);
  const needsSign = d.payment.method !== 'faktura';
  const total = paymentTotal(d.payment.items);
  box.innerHTML = String(html`
    ${gaps.length ? html`<div class="card warnbox">
      <h3>Než to zákazník podepíše – chybí:</h3>
      <ul>${gaps.map((g) => html`<li>${g}</li>`)}</ul>
      <div style="display:flex;gap:10px"><button class="btn" data-act="fix">Doplnit</button><span class="sub" style="align-self:center">nebo pokračuj, pokud to tak má být</span></div>
    </div>` : html`<div class="note-box ok-box" style="margin-bottom:12px">✓ Vše vyplněno.</div>`}
    <div class="grid c2" style="align-items:start">
      <div class="card">
        <h3 style="margin-bottom:8px">Souhrn</h3>
        ${d.kind === 'protokol' ? html`<div class="kv"><span>Protokol k revizi</span><b>${label(PURPOSES, d.protocol.purpose) || '— určení nevybráno —'}<br><span class="sub">${d.protocol.brand}</span></b></div>` : ''}
        ${d.chimneys.map((k, i) => html`<div class="kv"><span>${d.chimneys.length > 1 ? `${i + 1}) ` : ''}${k.label}</span><span><b>${label(CONCLUSIONS, k.conclusion) || '— závěr nevybrán —'}</b><br><span class="sub">${FUEL_LABEL[k.fuel]} · ${k.appliances.map((a) => (a.kind === 'jiný' ? a.kindOther : a.kind)).join(' + ')}</span></span></div>`)}
        <div class="kv"><span>Platba</span><b>${fmtMoney(total)} · ${METHODS[d.payment.method] || '—'}</b></div>
      </div>
      <div class="card">
        ${needsSign ? html`
          <div class="card-title"><h3>Podpis zákazníka</h3><button class="btn small" data-act="clear">Smazat</button></div>
          <canvas class="sigpad" id="sig" aria-label="Podpisové pole"></canvas>
          <p class="sub" style="margin:6px 0 0">${displayName(customer)} podepisuje příjmový doklad (platbu ${fmtMoney(total)}).</p>`
        : html`<h3>Bez podpisu zákazníka</h3><p class="sub">Při platbě fakturou zákazník nic nepodepisuje. Na zprávě bude jen tvoje razítko a podpis.</p>`}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:14px">
      <button class="btn" data-act="back">‹ Zpět na platbu</button>
      <button class="btn primary" data-act="finish">${icon('check')} Dokončit a vytvořit ${{ doklad: 'doklad', protokol: 'protokol' }[d.kind] || 'zprávu'}</button>
    </div>
  `);
  let pad = null;
  if (needsSign) {
    pad = signaturePad(box.querySelector('#sig'));
    if (d.signature) {
      const img = new Image(); img.onload = () => box.querySelector('#sig').getContext('2d').drawImage(img, 10, 10, Math.min(300, img.width / 3), Math.min(120, img.height / 3)); img.src = d.signature;
    }
    box.querySelector('[data-act="clear"]').addEventListener('click', () => { pad.clear(); d.signature = null; saveDraft(d); });
  }
  box.querySelector('[data-act="fix"]')?.addEventListener('click', () => goStep(ctx, d.kind === 'doklad' ? 'platba' : 'formular'));
  box.querySelector('[data-act="back"]').addEventListener('click', () => goStep(ctx, 'platba'));
  box.querySelector('[data-act="finish"]').addEventListener('click', async (e) => {
    if (needsSign && pad && !pad.isEmpty()) d.signature = pad.toDataURL();
    if (needsSign && !d.signature) {
      const ok = await modal({ title: 'Bez podpisu zákazníka?', body: '<p>Zákazník se zatím nepodepsal. Chceš dokončit i tak?</p>', actions: [{ label: 'Zpět k podpisu', value: false }, { label: 'Dokončit bez podpisu', value: true, kind: 'primary' }] });
      if (!ok) return;
    }
    e.target.disabled = true;
    e.target.textContent = 'Vytvářím PDF…';
    try {
      const doc = await finalize(d, buildVisitPdf);
      ctx.d = doc; ctx.customer = await get('customers', doc.customerId);
      ctx.d.step = 'hotovo';
      draw(ctx);
      toast(`Hotovo – č. ${doc.no}`);
    } catch (err) {
      console.error(err);
      e.target.disabled = false; e.target.textContent = 'Zkusit znovu';
      toast(`PDF se nepodařilo vytvořit: ${err.message}`);
    }
  });
}

// ---------- 4) Hotovo – odeslání ----------
function stepDone(box, ctx) {
  const { d, customer } = ctx;
  const pref = customer.delivery;
  const btn = (how, text, ic) => html`<button class="btn ${pref === how ? 'primary' : ''} big" data-share="${how}">${ic ? icon(ic) : ''}${text}</button>`;
  box.innerHTML = String(html`
    <div class="card done-card">
      <div class="done-head">
        <span class="done-check">${icon('check')}</span>
        <div><h2>${{ doklad: 'Doklad', protokol: 'Protokol' }[d.kind] || 'Zpráva'} č. ${d.no}</h2><span class="sub">${fmtDate(parseIso(d.date))} · ${fmtMoney(paymentTotal(d.payment.items))} · ${METHODS[d.payment.method]}</span></div>
      </div>
      <p class="sub">Odeslat zákazníkovi: otevře se nabídka Sdílet, kde vybereš WhatsApp, Mail nebo Tisk. Text zprávy se přiloží sám.</p>
      <div class="share-row">
        ${btn('whatsapp', 'WhatsApp')}
        ${btn('email', 'E-mail')}
        ${btn('tisk', 'Tisk')}
        <button class="btn big soft" data-act="preview">Náhled PDF</button>
      </div>
      ${customer.phones?.[0] ? html`<p class="sub">Telefon: ${customer.phones[0]}${customer.email ? ` · e-mail: ${customer.email}` : ''}</p>` : ''}
    </div>
    <div id="preview"></div>
    <div style="display:flex;justify-content:space-between;margin-top:14px">
      <a class="btn" href="#karta-${customer.id}">Karta zákazníka</a>
      <a class="btn dark" href="#dnes">Zpět na Dnes ›</a>
    </div>
  `);
  box.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await shareDocument(d, customer, b.dataset.share);
    if (ok) { d.sent = [...(d.sent || []), { how: b.dataset.share, at: new Date().toISOString() }]; await saveDraft(d); }
  }));
  box.querySelector('[data-act="preview"]').addEventListener('click', () => {
    const url = URL.createObjectURL(d.pdf);
    box.querySelector('#preview').innerHTML = String(html`<div class="card" style="margin-top:12px;padding:8px"><iframe class="pdfview" src="${url}" title="Náhled PDF"></iframe></div>`);
  });
}

