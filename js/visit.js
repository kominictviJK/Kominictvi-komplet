// Návštěva: rozpracovaná zpráva (koncept) → dokončená zpráva / doklad s číslem
import { get, put, all, byIndex, uid } from './db.js';
import { settings } from './settings.js';
import { nextVisitNumber } from './numbering.js';
import { displayName } from './customers.js';
import { isoDate } from './ui.js';
import { label, DEFECTS, RECOMMENDATIONS, APPLIANCE_KINDS } from './catalog.js';

export const KINDS = {
  zprava: 'Zpráva o kontrole a čištění',
  protokol: 'Protokol k revizi',
  doklad: 'Jen doklad (frézování, ostatní práce)',
};

function emptyFlue() { return { material: '', materialOther: '', diameter: '', length: '', elbows: { e90: 0, e45: 0, flex: 0, none: false } }; }

function applianceFrom(a = {}) {
  const known = !a.kind || APPLIANCE_KINDS.includes(a.kind);
  return {
    kind: known ? (a.kind || 'kotel') : 'jiný', kindOther: known ? '' : a.kind, brand: a.brand || '', kw: a.kw || '',
    floor: /pp/i.test(a.floor || '') ? 'PP' : 'NP', placement: a.placement || [], placementOther: '',
    flue: a.flue ? structuredClone(a.flue) : emptyFlue(),
  };
}

// Komín ve zprávě – předvyplněný z karty zákazníka (a z minulé zprávy, pokud existuje)
export function chimneyFrom(k, prev) {
  const base = {
    id: k.id, label: k.label, fuel: k.fuel || 'tuha', ut: true, condensing: !!k.condensing,
    appliances: (k.appliances?.length ? k.appliances : [{}]).map(applianceFrom),
    body: k.body || [], liner: k.liner || { material: '', materialOther: '', diameter: '' },
    revisionNo: k.revisionNo || '', revisionMissing: !k.revisionNo, height: k.height || '',
    fixed: { noDefects: true, camera: false, text: '' },
    defects: [], defectOther: '', deadline: { mode: '', date: '' },
    recs: [], recOther: '', conclusion: '',
  };
  if (prev) {
    // převzít technický popis z minulé zprávy, výsledek kontroly je nový
    Object.assign(base, structuredClone({ fuel: prev.fuel, ut: prev.ut, condensing: prev.condensing, appliances: prev.appliances, body: prev.body, liner: prev.liner, revisionNo: prev.revisionNo, revisionMissing: prev.revisionMissing, height: prev.height }));
  }
  return base;
}

export async function lastFinalDocument(customerId, objectId) {
  const docs = (await byIndex('documents', 'customerId', customerId)).filter((d) => d.status === 'final' && d.kind === 'zprava' && (!objectId || d.objectId === objectId));
  return docs.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0] || null;
}

export async function createDraft({ customerId, objectId, appointmentId = null, kind = 'zprava', sameAsLast = false }) {
  const s = settings();
  const c = await get('customers', customerId);
  const obj = c.objects.find((o) => o.id === objectId) || c.objects[0];
  const last = await lastFinalDocument(c.id, obj.id);
  const prevBy = new Map((last?.chimneys || []).map((k) => [k.id, k]));
  const chimneys = kind === 'doklad' ? [] : obj.chimneys.map((k) => chimneyFrom(k, prevBy.get(k.id)));
  if (sameAsLast && last) {
    // „Beze změn jako loni“ – převezme i loňský výsledek; zkontroluje se jen závěr a cena
    chimneys.forEach((k, i) => {
      const p = prevBy.get(k.id);
      if (p) Object.assign(chimneys[i], structuredClone({ ...p, deadline: { mode: '', date: '' } }));
    });
  }
  const price = s.cenik.kontrola[1] || s.cenik.kontrola[0] || 500;
  const draft = {
    id: uid('d_'), status: 'draft', kind, customerId: c.id, objectId: obj.id, appointmentId,
    date: isoDate(), createdAt: new Date().toISOString(), trial: !!s.rezim.zkusebni,
    sameAsLast: !!(sameAsLast && last), basedOn: last?.id || null,
    chimneys, note: '', purpose: kind === 'doklad' ? 'frézování komínového průduchu' : '',
    payment: {
      items: kind === 'doklad'
        ? [{ id: uid('i_'), label: 'Frézování komínového průduchu', qty: 1, unit: 'm', price: s.cenik.frezovaniZaMetr }]
        : kind === 'protokol'
          ? [{ id: uid('i_'), label: 'Příprava revize spalinové cesty', qty: 1, unit: 'ks', price: s.cenik.revize }]
          : [{ id: uid('i_'), label: 'Kontrola a čištění spalinové cesty', qty: Math.max(1, chimneys.length), unit: 'ks', price }],
      method: '', paid: false,
    },
    signature: null,
  };
  await put('documents', draft);
  return draft;
}

export const saveDraft = (d) => put('documents', { ...d, updatedAt: new Date().toISOString() });

// Číslo se přidělí nejpozději při dokončení; dřív jen když je potřeba VS pro QR platbu
export async function reserveNumber(d) {
  if (d.no) return d;
  const num = await nextVisitNumber(new Date(), !!d.trial);
  d.no = num.no; d.vs = num.vs;
  await saveDraft(d);
  return d;
}

export async function openDraftForAppointment(appointmentId) {
  const docs = await all('documents');
  return docs.find((d) => d.appointmentId === appointmentId && d.status === 'draft') || null;
}

// Navržený závěr podle nedostatků
export function suggestConclusion(k) {
  const hasDefects = k.defects.length || k.defectOther.trim();
  return hasDefects ? 'poodstraneni' : 'vyhovuje';
}

// Kontrola před podpisem – co chybí
export function missing(d, customer) {
  const out = [];
  d.chimneys.forEach((k, i) => {
    const n = d.chimneys.length > 1 ? `${i + 1}) ` : '';
    if (!k.fuel) out.push(`${n}palivo`);
    k.appliances.forEach((a, ai) => { if (!a.kind || (a.kind === 'jiný' && !a.kindOther.trim())) out.push(`${n}druh spotřebiče ${ai + 1}`); });
    if (!k.body.length) out.push(`${n}komínové těleso`);
    if (!k.height) out.push(`${n}účinná výška`);
    if ((k.defects.length || k.defectOther.trim()) && !k.deadline.mode) out.push(`${n}termín odstranění nedostatků`);
    if (!k.conclusion) out.push(`${n}závěr`);
  });
  if (!d.payment.method) out.push('způsob platby');
  if (!d.payment.items.length || d.payment.items.some((i) => !(Number(i.price) >= 0) || !i.label.trim())) out.push('položky platby');
  if (customer.delivery === 'email' && !customer.email) out.push('e-mail zákazníka (zprávy se mají posílat e-mailem)');
  return out;
}

export function defectsText(k) {
  return [...k.defects.map((x) => label(DEFECTS, x)), k.defectOther.trim()].filter(Boolean);
}
export function recsText(k) {
  return [...k.recs.map((x) => label(RECOMMENDATIONS, x)), k.recOther.trim()].filter(Boolean);
}

// Dokončení: přidělí číslo, uloží, propíše údaje do karty zákazníka, označí návštěvu jako hotovou
export async function finalize(draft, pdfBuilder) {
  const s = settings();
  const date = new Date();
  const num = draft.no ? { no: draft.no, vs: draft.vs } : await nextVisitNumber(date, !!draft.trial);
  const doc = { ...draft, status: 'final', no: num.no, vs: num.vs, date: isoDate(date), finalizedAt: date.toISOString() };
  doc.payment.paid = doc.payment.method === 'hotove' || doc.payment.method === 'qr' ? doc.payment.paid : false;
  const customer = await get('customers', doc.customerId);
  doc.customerName = displayName(customer);
  doc.title = doc.kind === 'doklad' ? doc.purpose : `${doc.chimneys.length} ${doc.chimneys.length === 1 ? 'komín' : doc.chimneys.length < 5 ? 'komíny' : 'komínů'}`;
  doc.pdf = await pdfBuilder(doc, customer, s);
  await put('documents', doc);

  // karta zákazníka: poslední kontrola a technické údaje
  if (doc.kind !== 'doklad') {
    const obj = customer.objects.find((o) => o.id === doc.objectId);
    for (const k of doc.chimneys) {
      let ck = obj.chimneys.find((x) => x.id === k.id);
      if (!ck) { ck = { id: k.id, label: k.label }; obj.chimneys.push(ck); }
      Object.assign(ck, {
        fuel: k.fuel, condensing: k.condensing, lastCheck: doc.date, body: k.body, liner: k.liner,
        revisionNo: k.revisionMissing ? '' : k.revisionNo, height: k.height,
        appliances: k.appliances.map((a) => ({ kind: a.kind === 'jiný' ? a.kindOther : a.kind, brand: a.brand, kw: a.kw, floor: a.floor, placement: a.placement, flue: a.flue })),
      });
    }
  }
  customer.isNew = false;
  await put('customers', customer);

  if (doc.appointmentId) {
    const ap = await get('appointments', doc.appointmentId);
    if (ap) await put('appointments', { ...ap, status: 'done', documentId: doc.id });
  }
  return doc;
}
