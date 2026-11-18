// Návštěva: šablona → formulář zprávy → platba → podpis → hotovo (odeslání)
import { get, put } from '../db.js';
import { openPdfViewer } from '../pdfview.js';
import { settings } from '../settings.js';
import { displayName } from '../customers.js';
import { FUEL_LABEL } from '../lhuty.js';
import {
  FUELS, APPLIANCE_KINDS, PLACEMENTS, FLOORS, BODY_TYPES, LINERS, FLUES, DEFECTS, RECOMMENDATIONS, CONCLUSIONS, elbowsText, label,
  OBJECT_TYPES, ROOFS as OBJ_ROOFS, BODY_MATERIALS, FOUNDED, OTHER_FLUES, PATH_TYPES, LAYERS, AIR_SUPPLY, CLEAN_FROM, ACCESS, ASH_DOOR, NOTE_CHIPS,
  FUEL_TYPES, TERMINATION, DAMPERS, PRESSURE, MOISTURE, OPERATION,
} from '../catalog.js';
import { saveSettings } from '../settings.js';
import { chimneyBullets, accessBullets, objectLine } from '../reporttext.js';
import {
  KINDS, createDraft, saveDraft, openDraftForAppointment, lastFinalDocument, chimneyFrom, suggestConclusion, missing, finalize, reserveNumber,
  DETAIL_DEFAULTS, siteFrom, warnings, REVISION_NOTE,
} from '../visit.js';
import { buildVisitPdf } from '../pdf.js';
import { spdString, qrSvg, paymentTotal, METHODS, METHOD_LABEL } from '../payment.js';
import { signaturePad } from '../signature.js';
import { shareDocument } from '../share.js';
import { html, raw, icon, toast, modal, fmtMoney, fmtDate, parseIso } from '../ui.js';
import { uid } from '../db.js';
import { hasAi, readLabel, tagPhoto, PHOTO_TAGS, readOldReport } from '../ai.js';
import { allPresets, applyPreset, savePreset } from '../presets.js';
import { hasHelper } from '../google.js';
import { photoData } from './finance.js';
import { PURPOSES, P_FLUES, P_LINERS, CLEANING, ROOFS, CONTRACTORS } from '../protocol.js';

const STEPS = [['formular', 'Zpráva'], ['platba', 'Platba'], ['podpis', 'Podpis'], ['hotovo', 'Odeslání']];

export async function render(el, { args, go }) {
  // #navsteva-zacit-<appointmentId> | #navsteva-zakaznik-<customerId>[-<objectId>] | #navsteva-<draftId>
  if (args[0] === 'zacit' || args[0] === 'zakaznik') return chooseTemplate(el, args, go);
  const d = await get('documents', args[0]);
  if (!d) { el.innerHTML = String(html`<div class="card empty">Návštěva nenalezena. <a href="#dnes">Zpět na Dnes</a></div>`); return; }
  const customer = await get('customers', d.customerId);
  if (d.status === 'final') d.step = 'hotovo';
  // ukázková / obnovená data: PDF se vytvoří až při prvním otevření
  if (d.status === 'final' && !d.pdf) {
    el.innerHTML = '<div class="card empty">Připravuji PDF…</div>';
    try { d.pdf = await buildVisitPdf(d, customer, settings()); await put('documents', d); } catch (e) { console.error(e); }
  }
  if (!d.step) d.step = d.kind === 'doklad' ? 'platba' : 'formular';
  if (d.status !== 'final' && d.kind === 'zprava') {
    // starší koncepty: doplnit nová pole podrobného popisu
    d.site ||= siteFrom(customer.objects.find((o) => o.id === d.objectId) || customer.objects[0]);
    for (const k of d.chimneys) {
      for (const [key, v] of Object.entries(DETAIL_DEFAULTS)) if (k[key] === undefined) k[key] = structuredClone(v);
      for (const a of k.appliances) a.flue = { separate: 'samostatný', opening: '', reduction: '', ...a.flue };
    }
  }
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

// volby s „+ vlastní“: základní seznam + vlastní volby z nastavení + aktuální hodnota (když v seznamu není)
const OTHERS = ['jiný', 'jiné', 'jiná'];
const opts = (key, base, current) => {
  const arr = [...base.filter((x) => !OTHERS.includes(x)), ...(settings().vlastni?.[key] || [])];
  for (const c of [].concat(current || [])) if (c && typeof c === 'string' && !arr.includes(c) && !OTHERS.includes(c)) arr.push(c);
  return arr;
};
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = (path) => (SpeechRec ? html`<button type="button" class="btn small soft" data-dictate="${path}" aria-label="Diktovat">${icon('mic')} Diktovat</button>` : '');
const addCustom = (path, key, many = false) => html`<button type="button" class="chip add-custom" data-custom="${path}|${key}|${many ? 1 : 0}">+ vlastní</button>`;
const one = (path, key, base, cur, text = (x) => x) => html`${opts(key, base, cur).map((x) => chipOne(path, x, text(x), cur))}${addCustom(path, key)}`;
const many = (path, key, base, cur) => html`${opts(key, base, cur).map((x) => chipMany(path, x, x, cur))}${addCustom(path, key, true)}`;

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
  box.querySelectorAll('[data-dictate]').forEach((b) => b.addEventListener('click', () => {
    const path = b.dataset.dictate;
    const field = box.querySelector(`[data-bind="${path}"]`);
    if (b._rec) { b._rec.stop(); return; }
    const base = field.value ? `${field.value.trim()} ` : '';
    const rec = new SpeechRec(); rec.lang = 'cs-CZ'; rec.continuous = true; rec.interimResults = true; b._rec = rec;
    rec.onresult = (e) => { field.value = base + [...e.results].map((r) => r[0].transcript).join(' '); setPath(d, path, field.value); };
    rec.onend = () => { b._rec = null; b.classList.remove('primary'); save(); };
    rec.onerror = () => toast('Diktování nešlo – použij mikrofon na klávesnici');
    rec.start(); b.classList.add('primary');
  }));
  box.querySelectorAll('[data-custom]').forEach((b) => b.addEventListener('click', async () => {
    const [path, key, isMany] = b.dataset.custom.split('|');
    const v = await modal({ title: 'Vlastní volba', body: '<label class="field"><span>Napiš volbu – příště už bude v nabídce</span><input class="input" id="cv" autocomplete="off"></label>', actions: [{ label: 'Zrušit', value: null }, { label: 'Přidat', kind: 'primary', value: (root) => root.querySelector('#cv').value.trim() }], onOpen: (root) => setTimeout(() => root.querySelector('#cv').focus(), 50) });
    if (!v) return;
    const list = settings().vlastni?.[key] || [];
    if (!list.includes(v)) await saveSettings({ vlastni: { [key]: [...list, v] } });
    if (isMany === '1') { const arr = getPath(d, path) || []; if (!arr.includes(v)) setPath(d, path, [...arr, v]); } else setPath(d, path, v);
    afterChange(d, path); save(); keep();
  }));
  box.querySelectorAll('[data-cnt]').forEach((b) => b.addEventListener('click', () => {
    const [p, delta, min, max] = b.dataset.cnt.split('|');
    setPath(d, p, Math.min(Number(max), Math.max(Number(min), (Number(getPath(d, p)) || 0) + Number(delta))));
    save(); keep();
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
  if (m[2] === 'fuel') k.fuelTypes = (k.fuelTypes || []).filter((t) => (FUEL_TYPES[k.fuel] || []).includes(t) || (settings().vlastni?.fuelType || []).includes(t));
  if (['defects', 'defectOther'].includes(m[2]) && !k.conclusionManual) k.conclusion = suggestConclusion(k);
  if (m[2] === 'defects' && k.defects.length) k.fixed.noDefects = k.fixed.noDefects && false;
}

// ---------- 1) Formulář zprávy ----------
function stepForm(box, ctx) {
  const { d } = ctx;
  box.innerHTML = String(html`
    ${d.sameAsLast ? html`<div class="note-box" style="margin-bottom:12px">Převzato z minulé zprávy beze změn. Projdi hlavně nedostatky a závěr.</div>` : ''}
    ${siteForm(d.site)}
    ${d.chimneys.map((k, i) => chimneyForm(k, i, d.chimneys.length, d.site))}
    ${reportForm(d.site)}
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px;flex-wrap:wrap">
      <button class="btn soft" data-act="add-ch">+ další komín</button>
      <button class="btn primary" data-act="next">Pokračovat na platbu ›</button>
    </div>
    ${photoCard(d)}
    <div class="card" style="margin-top:12px">
      <label class="field"><span>Interní poznámka (netiskne se)</span><textarea id="i-note" data-bind="note" placeholder="Jen pro tebe, např. co nabídnout příště">${d.note}</textarea></label>${mic('note')}
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
  box.querySelectorAll('[data-label]').forEach((inpEl) => inpEl.addEventListener('change', async () => {
    const f = inpEl.files?.[0]; if (!f) return;
    const [ki, ai] = inpEl.dataset.label.split('.').map(Number);
    const lbl = inpEl.closest('label'); lbl.firstChild.textContent = 'Čtu štítek…';
    try {
      const r = await readLabel(await photoData(f));
      const k = d.chimneys[ki], a = k.appliances[ai];
      if (APPLIANCE_KINDS.includes(r.kind)) a.kind = r.kind;
      if (r.brand) a.brand = r.brand;
      if (r.kw) a.kw = String(r.kw).replace('.', ',');
      if (r.flueDiameter && !a.flue.diameter) a.flue.diameter = String(r.flueDiameter);
      if (ai === 0 && ['tuha', 'plyn', 'kapalna'].includes(r.fuel)) { k.fuel = r.fuel; if (r.fuel === 'plyn') k.condensing = !!r.condensing; }
      await saveDraft(d); redraw();
      toast('Štítek přečten – zkontroluj údaje');
    } catch (e) { toast(e.message); lbl.firstChild.textContent = 'Vyfotit štítek'; }
  }));
  wirePhotos(box, d, redraw);
  box.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', async () => {
    const list = allPresets();
    const id = await modal({ title: 'Předvolba komínu', body: '<p class="sub">Vyplní typické údaje. Značku, výkon, výšky a výsledek kontroly doplníš.</p>', actions: [...list.map((pv) => ({ label: pv.name, value: pv.id })), { label: 'Zrušit', value: null }] });
    if (!id) return;
    const k = d.chimneys[Number(b.dataset.preset)];
    applyPreset(k, list.find((x) => x.id === id).data);
    await saveDraft(d); redraw(); toast('Předvolba použita – zkontroluj údaje');
  }));
  box.querySelectorAll('[data-savepreset]').forEach((b) => b.addEventListener('click', async () => {
    const name = await modal({ title: 'Uložit jako předvolbu', body: '<label class="field"><span>Název předvolby</span><input class="input" id="pvn" placeholder="např. Krbová vložka – nerezový komín"></label>', actions: [{ label: 'Zrušit', value: null }, { label: 'Uložit', kind: 'primary', value: (root) => root.querySelector('#pvn').value.trim() }] });
    if (!name) return;
    await savePreset(name, d.chimneys[Number(b.dataset.savepreset)]);
    toast('Předvolba uložena');
  }));
  box.querySelectorAll('[data-oldrep]').forEach((inpEl) => inpEl.addEventListener('change', async () => {
    const f = inpEl.files?.[0]; if (!f) return;
    const k = d.chimneys[Number(inpEl.dataset.oldrep)];
    const lbl = inpEl.closest('label'); lbl.firstChild.textContent = 'Čtu zprávu…';
    try {
      const url = f.type === 'application/pdf' ? await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }) : await photoData(f);
      const r = await readOldReport(url);
      const a = k.appliances[0];
      const set = (obj, key, v) => { if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) obj[key] = v; };
      set(k, 'fuel', r.fuel); if (r.condensing !== undefined && r.condensing !== null) k.condensing = !!r.condensing; set(k, 'fuelTypes', r.fuelTypes);
      set(a, 'kind', r.applianceKind); set(a, 'brand', r.brand); if (r.kw) a.kw = String(r.kw).replace('.', ','); set(a, 'floor', r.floor); set(a, 'placement', r.placement);
      set(a.flue, 'material', r.flueMaterial); set(a.flue, 'diameter', r.flueDiameter && String(r.flueDiameter)); set(a.flue, 'length', r.flueLength && String(r.flueLength));
      if (r.elbows90 || r.elbows45) a.flue.elbows = { ...a.flue.elbows, e90: Number(r.elbows90) || 0, e45: Number(r.elbows45) || 0, none: false };
      set(k, 'body', r.body); set(k, 'bodyMaterial', r.bodyMaterial); set(k.liner, 'material', r.linerMaterial); set(k.liner, 'diameter', r.linerDiameter && String(r.linerDiameter));
      if (Number(r.flues) > 0) k.flues = Number(r.flues); if (Number(r.flueNo) > 0) k.flueNo = Number(r.flueNo);
      set(k, 'height', r.height && String(r.height).replace('.', ',')); set(k, 'buildHeight', r.buildHeight && String(r.buildHeight).replace('.', ',')); set(k, 'outlet', r.outlet && String(r.outlet).replace('.', ','));
      if (r.revisionNo) { k.revisionNo = String(r.revisionNo); k.revisionMissing = false; }
      set(k, 'air', r.air);
      await saveDraft(d); redraw();
      toast('Údaje ze staré zprávy načteny – zkontroluj je');
    } catch (e) { toast(e.message); lbl.firstChild.textContent = 'Načíst ze staré zprávy'; }
  }));
  box.querySelectorAll('[data-desc-edit]').forEach((b) => b.addEventListener('click', async () => {
    const k = d.chimneys[Number(b.dataset.descEdit)];
    k.descOverride = chimneyBullets({ ...k, descOverride: '' }, d.site).map((x) => `– ${x}`).join('\n');
    await saveDraft(d); redraw();
  }));
  box.querySelectorAll('[data-desc-auto]').forEach((b) => b.addEventListener('click', async () => { d.chimneys[Number(b.dataset.descAuto)].descOverride = ''; await saveDraft(d); redraw(); }));
  box.querySelector('[data-act="next"]').addEventListener('click', () => goStep(ctx, 'platba'));
}


// ---------- Fotodokumentace (zpráva i protokol) ----------
function photoCard(d, hint = 'Nefotí se do zprávy, jen do karty zákazníka.') {
  return html`<div class="card" style="margin-top:12px">
      <div class="card-title"><h3>Fotodokumentace</h3><label class="btn small soft">+ Vyfotit<input type="file" accept="image/*" capture="environment" id="v-photo" hidden></label></div>
      ${(d.photos || []).length ? html`<div class="photo-grid">${d.photos.map((ph, i) => html`<figure data-pid="${ph.id}"><img src="${ph.data}" alt="${ph.tag || 'fotka'}"><figcaption>
        <select data-ptag="${i}" aria-label="Štítek fotky">${['', ...PHOTO_TAGS].map((t) => html`<option value="${t}" ${ph.tag === t ? 'selected' : ''}>${t || (ph.pending ? 'označuji…' : '— štítek —')}</option>`)}</select>
        <button class="btn small" data-pdel="${i}" aria-label="Smazat fotku">✕</button>
        ${ph.note ? html`<span class="sub" style="width:100%">${ph.note}</span>` : ''}</figcaption></figure>`)}</div>`
        : html`<p class="sub" style="margin:0">Štítek, kouřovod, ústí, závady… ${hasAi() ? 'Fotky se samy označí.' : 'Štítek fotce vybereš.'} ${hint}</p>`}
    </div>`;
}
function wirePhotos(box, d, redraw) {
  box.querySelector('#v-photo').addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0]; if (!f) return;
    d.photos = d.photos || [];
    const ph = { id: uid('p_'), data: await photoData(f), tag: '', note: '', at: new Date().toISOString(), pending: hasAi() };
    d.photos.push(ph); await saveDraft(d); redraw();
    if (!hasAi()) return;
    try { const r = await tagPhoto(ph.data); ph.tag = PHOTO_TAGS.includes(r.tag) ? r.tag : 'jiné'; ph.note = r.note || ''; } catch { /* štítek vybere ručně */ }
    ph.pending = false; await saveDraft(d);
    const fig = box.querySelector(`[data-pid="${ph.id}"]`);
    if (fig) {
      const sel = fig.querySelector('select'); sel.options[0].textContent = '— štítek —'; sel.value = ph.tag;
      if (ph.note) { const sp = document.createElement('span'); sp.className = 'sub'; sp.style.width = '100%'; sp.textContent = ph.note; fig.querySelector('figcaption').appendChild(sp); }
    }
  });
  box.querySelectorAll('[data-ptag]').forEach((sel) => sel.addEventListener('change', async () => { d.photos[Number(sel.dataset.ptag)].tag = sel.value; await saveDraft(d); }));
  box.querySelectorAll('[data-pdel]').forEach((b) => b.addEventListener('click', async () => { d.photos.splice(Number(b.dataset.pdel), 1); await saveDraft(d); redraw(); }));
}

const frow = (title, content) => html`<div class="frow"><span class="flabel">${title}</span><div class="fval">${content}</div></div>`;
const counter = (path, value, min, max, unit = '') => html`<span class="counter"><button type="button" data-cnt="${path}|-1|${min}|${max}" aria-label="ubrat">−</button><b>${value ?? 0}${unit}</b><button type="button" data-cnt="${path}|1|${min}|${max}" aria-label="přidat">+</button></span>`;

function siteForm(site) {
  const line = objectLine(site);
  return html`
    <div class="card fcard">
      <div class="card-title"><h2>Objekt</h2><span class="sub">${line || 'typ, podlaží, střecha'}</span></div>
      ${frow('Typ objektu', html`<div class="chips">${one('site.objType', 'objType', OBJECT_TYPES, site.objType)}</div>`)}
      ${frow('Podlaží', html`<div class="inline"><span class="sub">podzemní</span>${counter('site.pp', site.pp || 0, 0, 3, ' PP')}<span class="sub">nadzemní</span>${counter('site.np', site.np || 0, 0, 12, ' NP')}</div>`)}
      ${frow('Střecha', html`<div class="chips">${one('site.roof', 'roof', OBJ_ROOFS, site.roof)}</div>`)}
      ${frow('Vlastník objektu', html`${inp('site.owner', site.owner, { ph: 'jen když se liší od objednatele (jméno, adresa, IČO)' })}`)}
      ${frow('U koho provedeno', html`${inp('site.place', site.place, { ph: 'jen když se liší – např. byt pí Nováková, 2. NP' })}`)}
    </div>`;
}

function reportForm(site) {
  return html`
    <div class="card fcard" style="margin-top:12px">
      <div class="card-title"><h2>Na zprávě</h2></div>
      ${frow('Zakryté části', html`<div class="chips">${chipBool('site.hidden', site.hidden !== false, 'Odstavec o nepřístupných prostupech konstrukcemi')}</div>
        <p class="sub" style="margin:6px 0 0">Vypni jen u venkovního komínu viditelného celého nebo u hrubé stavby.</p>`)}
      ${frow('Poznámky', html`<div class="chips">${many('site.notes', 'notes', NOTE_CHIPS, site.notes)}</div>
        <div class="inline" style="margin-top:8px">${inp('site.noteText', site.noteText, { ph: 'vlastní poznámka na zprávu (tiskne se)' })}${mic('site.noteText')}</div>`)}
    </div>`;
}

function chimneyForm(k, i, total, site = {}) {
  const p = `chimneys.${i}`;
  const row = (title, content) => html`<div class="frow"><span class="flabel">${title}</span><div class="fval">${content}</div></div>`;
  return html`
    <div class="card fcard">
      <div class="card-title"><h2>${total > 1 ? `${i + 1}) ` : ''}${k.label}</h2>${total > 1 ? html`<button class="btn small danger" data-del-ch="${i}">Odebrat komín</button>` : ''}</div>
      <div class="preset-bar">
        <button type="button" class="btn small soft" data-preset="${i}">Předvolba…</button>
        ${hasAi() ? html`<label class="btn small soft">Načíst ze staré zprávy<input type="file" accept="image/*,application/pdf" data-oldrep="${i}" hidden></label>` : ''}
        <button type="button" class="btn small" data-savepreset="${i}">Uložit jako předvolbu</button>
      </div>
      ${row('Palivo', html`<div class="chips">${FUELS.map(([v, l]) => chipOne(`${p}.fuel`, v, l, k.fuel))}
        ${k.fuel === 'plyn' ? chipBool(`${p}.condensing`, k.condensing, 'kondenzační kotel') : ''}</div>
        <div class="chips" style="margin-top:8px"><span class="sub">druh:</span>${many(`${p}.fuelTypes`, 'fuelType', FUEL_TYPES[k.fuel] || [], k.fuelTypes)}</div>`)}
      ${row('Provoz', html`<div class="chips">${OPERATION.map((x) => chipOne(`${p}.operation`, x, x, k.operation))}</div>`)}
      ${row('Ústřední topení', html`<div class="chips">${chipOne(`${p}.ut`, true, 'Ano', k.ut)}${chipOne(`${p}.ut`, false, 'Ne', k.ut)}</div>`)}

      ${k.appliances.map((a, ai) => {
        const ap = `${p}.appliances.${ai}`;
        const n = k.appliances.length > 1 ? ` ${ai + 1}` : '';
        const e = a.flue.elbows;
        return html`
          <div class="subcard">
            <div class="card-title"><h3>Spotřebič${n}</h3><span style="display:flex;gap:8px">${hasAi() ? html`<label class="btn small soft">Vyfotit štítek<input type="file" accept="image/*" capture="environment" data-label="${i}.${ai}" hidden></label>` : ''}${k.appliances.length > 1 ? html`<button class="btn small" data-del-ap="${i}.${ai}">Odebrat</button>` : ''}</span></div>
            ${row('Druh', html`<div class="chips">${one(`${ap}.kind`, 'kind', APPLIANCE_KINDS, a.kind === 'jiný' ? a.kindOther : a.kind)}</div>`)}
            ${row('Značka a výkon', html`<div class="inline">${inp(`${ap}.brand`, a.brand, { ph: 'značka / typ', w: '260px' })}${inp(`${ap}.kw`, a.kw, { ph: 'kW', mode: 'decimal', w: '90px' })}
              <span class="chips">${FLOORS.map((x) => chipOne(`${ap}.floor`, x, x, a.floor))}</span></div>`)}
            ${row('Umístění', html`<div class="chips">${many(`${ap}.placement`, 'placement', PLACEMENTS, a.placement)}</div>`)}
            ${row('Kouřovod', html`<div class="chips">${one(`${ap}.flue.material`, 'flueMaterial', FLUES, a.flue.material === 'jiný' ? a.flue.materialOther : a.flue.material)}</div>
              <div class="inline" style="margin-top:8px">${inp(`${ap}.flue.diameter`, a.flue.diameter, { ph: 'Ø mm', mode: 'numeric', w: '100px' })}${inp(`${ap}.flue.length`, a.flue.length, { ph: 'délka m', mode: 'decimal', w: '110px' })}</div>`)}
            ${row('Kolena', html`<div class="inline">
              ${[['e90', '90°'], ['e45', '45°'], ['flex', 'flexi']].map(([key, l]) => html`<span class="counter"><button type="button" data-inc="${ap}.flue.elbows.${key}|-1" aria-label="ubrat">−</button><b>${e[key] || 0}× ${l}</b><button type="button" data-inc="${ap}.flue.elbows.${key}|1" aria-label="přidat">+</button></span>`)}
              ${chipBool(`${ap}.flue.elbows.none`, e.none, 'bez kolen')}
              <span class="sub">${elbowsText(e)}</span></div>`)}
            ${row('Kouřovod – další', html`<div class="chips">${['samostatný', 'společný'].map((x) => chipOne(`${ap}.flue.separate`, x, x, a.flue.separate))}
              ${chipOne(`${ap}.flue.opening`, true, 'kontrolní otvor ano', a.flue.opening)}${chipOne(`${ap}.flue.opening`, false, 'kontrolní otvor ne', a.flue.opening)}</div>
              <div class="inline" style="margin-top:8px">${inp(`${ap}.flue.reduction`, a.flue.reduction, { ph: 'redukce, např. 130/160', w: '200px' })}<span class="sub">mm (jen když je)</span></div>`)}
          </div>`;
      })}
      ${k.appliances.length < 2 ? html`<button class="btn small soft" data-add-ap="${i}" style="margin:6px 0 4px">+ druhý spotřebič na tento komín</button>` : ''}

      ${row('Komínové těleso', html`<div class="chips">${many(`${p}.body`, 'body', BODY_TYPES, k.body)}</div>`)}
      ${row('Materiál tělesa', html`<div class="chips">${one(`${p}.bodyMaterial`, 'bodyMaterial', BODY_MATERIALS, k.bodyMaterial === 'jiný' ? k.bodyMaterialOther : k.bodyMaterial)}</div>`)}
      ${row('Průduchy', html`<div class="inline">${html`<span class="sub">počet</span>`}${counter(`${p}.flues`, k.flues || 1, 1, 12)}
        ${(k.flues || 1) > 1 ? html`<span class="sub">napojen do č.</span>${counter(`${p}.flueNo`, k.flueNo || 1, 1, k.flues || 1)}` : ''}</div>
        ${(k.flues || 1) > 1 ? html`<div class="chips" style="margin-top:8px"><span class="sub">ostatní průduchy:</span>${one(`${p}.otherFlues`, 'otherFlues', OTHER_FLUES, k.otherFlues)}</div>` : ''}`)}
      ${row('Založení a ústí', html`<div class="chips">${one(`${p}.founded`, 'founded', FOUNDED, k.founded, (x) => (FOUNDED.includes(x) ? `založen ${x === 'na půdě' ? x : `v ${x}`}` : x))}</div>
        <div class="inline" style="margin-top:8px">${inp(`${p}.outlet`, k.outlet, { ph: 'nad střechou m', mode: 'decimal', w: '150px' })}<span class="sub">m nad střechou</span></div>`)}
      ${row('Vložka', html`<div class="chips">${one(`${p}.liner.material`, 'liner', LINERS, k.liner.material === 'jiná' ? k.liner.materialOther : k.liner.material)}</div>
        <div class="inline" style="margin-top:8px">${inp(`${p}.liner.diameter`, k.liner.diameter, { ph: 'světlost Ø mm', mode: 'numeric', w: '150px' })}
          ${k.liner.material === 'není' ? inp(`${p}.flueSize`, k.flueSize, { ph: 'průduch např. 150×150', w: '190px' }) : chipBool(`${p}.milled`, k.milled, 'průduch rozšířen frézou')}</div>`)}
      ${row('Revizní zpráva', html`<div class="inline">${inp(`${p}.revisionNo`, k.revisionNo, { ph: 'číslo revizní zprávy', w: '220px' })}${chipBool(`${p}.revisionMissing`, k.revisionMissing, 'nedoloženo')}</div>`)}
      ${row('Výška', html`<div class="inline"><span class="sub">stavební</span>${inp(`${p}.buildHeight`, k.buildHeight, { ph: 'm', mode: 'decimal', w: '90px' })}<span class="sub">účinná</span>${inp(`${p}.height`, k.height, { ph: 'm', mode: 'decimal', w: '90px' })}<span class="sub">metrů</span></div>`)}
      ${row('Spalinová cesta', html`<div class="chips">${PATH_TYPES.map((x) => chipOne(`${p}.pathType`, x, x, k.pathType))}${LAYERS.map((x) => chipOne(`${p}.layers`, x, x, k.layers))}</div>
        <div class="chips" style="margin-top:8px">${PRESSURE.map((x) => chipOne(`${p}.pressure`, x, x, k.pressure))}${MOISTURE.map((x) => chipOne(`${p}.moisture`, x, x, k.moisture))}</div>`)}
      ${row('Ukončení komínu', html`<div class="chips">${one(`${p}.termination`, 'termination', TERMINATION, k.termination)}</div>`)}
      ${row('Klapka v kouřovodu', html`<div class="chips">${DAMPERS.map((x) => chipMany(`${p}.damper`, x, x, k.damper))}</div>`)}
      ${row('Přívod vzduchu', html`<div class="chips">${one(`${p}.air`, 'air', AIR_SUPPLY, k.air)}</div>`)}
      ${row('Čištění', html`<div class="chips">${many(`${p}.cleanFrom`, 'cleanFrom', CLEAN_FROM, k.cleanFrom)}</div>`)}
      ${row('Přístup', html`<div class="chips">${many(`${p}.access`, 'access', ACCESS, k.access)}</div>`)}
      ${row('Vybírací otvor', html`<div class="chips">${one(`${p}.ashDoor`, 'ashDoor', ASH_DOOR, k.ashDoor)}</div>`)}
      <div class="desc-preview">
        <div class="card-title"><h3>Popis komínu na zprávě</h3>${k.descOverride ? html`<button class="btn small" data-desc-auto="${i}">Vrátit automatický</button>` : html`<button class="btn small soft" data-desc-edit="${i}">Upravit ručně</button>`}</div>
        ${k.descOverride
          ? html`<textarea class="input" rows="6" data-bind="${p}.descOverride">${k.descOverride}</textarea><div class="inline" style="margin-top:4px"><span class="sub">Každý řádek = jedna odrážka. Ruční text se příště převezme.</span>${mic(`${p}.descOverride`)}</div>`
          : html`<ul>${chimneyBullets(k, site).map((x) => html`<li>${x}</li>`)}${accessBullets(k).map((x) => html`<li class="sub">${x}</li>`)}</ul>`}
      </div>

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
    ${photoCard(d, 'Fotky se přidají na konec PDF protokolu jako příloha „Fotodokumentace“ pro revizní techničku.')}
    <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="next">Pokračovat na platbu ›</button></div>
  `);
  wire(box, ctx, () => stepProtocol(box, ctx));
  wirePhotos(box, d, () => stepProtocol(box, ctx));
  box.querySelector('[data-act="next"]').addEventListener('click', () => goStep(ctx, 'platba'));
}

// ---------- 2) Platba ----------
function stepPayment(box, ctx) {
  const { d } = ctx;
  if (d.payment.method === 'namiste' && !d.vs && !d.no) { reserveNumber(d).then(() => saveDraft(d)).then(() => stepPayment(box, ctx)); return; }
  const s = settings();
  const total = paymentTotal(d.payment.items);
  const qrText = ['qr', 'namiste'].includes(d.payment.method) && d.vs ? spdString({ account: s.firma.ucet, amount: total, vs: d.vs, message: `Kominictvi ${d.no}` }) : null;
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
        ${['qr', 'namiste'].includes(d.payment.method) ? html`
          <div class="qrbox">
            ${qrText ? raw(qrSvg(qrText, 230)) : html`<div class="note-box">${s.firma.ucet ? 'Číslo účtu nemá správný tvar (např. 2001234567/2010).' : 'QR kód půjde vytvořit, až doplníš číslo účtu v Nastavení → Firma a já.'}</div>`}
            <div><b style="font-size:24px;font-family:var(--head)">${fmtMoney(total)}</b><br><span class="sub">VS ${d.vs || '—'} · zaplatí hotově, nebo naskenuje QR v bankovní aplikaci</span></div>
          </div>
          <button class="chip ${d.payment.paid ? 'on' : ''}" data-set="payment.paid" data-v="${JSON.stringify(!d.payment.paid)}" style="margin-top:10px">${d.payment.paid ? '✓ Zaplaceno' : 'Označit jako zaplaceno'}</button>` : ''}

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
  // celková částka se přepočítá hned, bez překreslení
  box.querySelectorAll('[data-bind^="payment.items"]').forEach((i) => i.addEventListener('input', () => {
    const tot = d.payment.items.reduce((s2, it) => s2 + (Number(String(it.qty).replace(',', '.')) || 0) * (Number(String(it.price).replace(',', '.')) || 0), 0);
    box.querySelector('.big-total').textContent = fmtMoney(tot);
  }));
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
    d.payment.paid = false;
    if (d.payment.method === 'namiste') await reserveNumber(d);
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
  const warns = d.kind === 'zprava' ? warnings(d) : [];
  box.innerHTML = String(html`
    ${gaps.length ? html`<div class="card warnbox">
      <h3>Než to zákazník podepíše – chybí:</h3>
      <ul>${gaps.map((g) => html`<li>${g}</li>`)}</ul>
      <div style="display:flex;gap:10px"><button class="btn" data-act="fix">Doplnit</button><span class="sub" style="align-self:center">nebo pokračuj, pokud to tak má být</span></div>
    </div>` : html`<div class="note-box ok-box" style="margin-bottom:12px">✓ Vše vyplněno.</div>`}
    ${warns.length ? html`<div class="card warnbox soft-warn">
      <h3>Zkontroluj, jestli to tak má být:</h3>
      <ul>${warns.map((w) => html`<li>${w.text} ${w.action ? html`<button class="btn small soft" data-warn="${w.action}">${w.label}</button>` : ''}</li>`)}</ul>
    </div>` : ''}
    <div class="grid c2" style="align-items:start">
      <div class="card">
        <h3 style="margin-bottom:8px">Souhrn</h3>
        ${d.kind === 'protokol' ? html`<div class="kv"><span>Protokol k revizi</span><b>${label(PURPOSES, d.protocol.purpose) || '— určení nevybráno —'}<br><span class="sub">${d.protocol.brand}</span></b></div>` : ''}
        ${d.chimneys.map((k, i) => html`<div class="kv"><span>${d.chimneys.length > 1 ? `${i + 1}) ` : ''}${k.label}</span><span><b>${label(CONCLUSIONS, k.conclusion) || '— závěr nevybrán —'}</b><br><span class="sub">${FUEL_LABEL[k.fuel]} · ${k.appliances.map((a) => (a.kind === 'jiný' ? a.kindOther : a.kind)).join(' + ')}</span></span></div>`)}
        <div class="kv"><span>Platba</span><b>${fmtMoney(total)} · ${METHOD_LABEL[d.payment.method] || '—'}</b></div>
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
  box.querySelectorAll('[data-warn]').forEach((btn) => btn.addEventListener('click', async () => {
    if (btn.dataset.warn === 'revnote') { d.site = d.site || {}; d.site.notes = [...(d.site.notes || []), REVISION_NOTE]; await saveDraft(d); toast('Poznámka přidána'); stepSign(box, ctx); }
  }));
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
      <p class="sub">Odeslat zákazníkovi: otevře se nabídka Sdílet, kde vybereš WhatsApp, Mail nebo Tisk. Text zprávy se přiloží sám.${hasHelper() && customer.email ? ' E-mail odejde rovnou z KominictviJK@gmail.com.' : ''}</p>
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
    openPdfViewer(d.pdf, `${{ doklad: 'Doklad', protokol: 'Protokol' }[d.kind] || 'Zpráva'} č. ${d.no}`);
  });
}

