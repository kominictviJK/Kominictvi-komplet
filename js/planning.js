// Plánování: oslovení podle lhůt, poptávky, výjezdy, domluvené termíny
import { all, get, put, byIndex, uid } from './db.js';
import { settings } from './settings.js';
import { customerDue, dueState } from './lhuty.js';
import { isoDate, parseIso } from './ui.js';

export const BLOCKS = ['8–10', '10–12', '12–14', '14–16', '16–18'];
export const PREFS = ['dopoledne', 'odpoledne', 'kdykoli', 'od 14:00', 'po 16:00'];
export const KIND_LABEL = { kontrola: 'Kontrola a čištění', revize: 'Revize', frezovani: 'Frézování', ostatni: 'Ostatní práce' };
export const TRIP_TYPES = { obec: 'Den v obci', okruzni: 'Okružní výjezd' };

const trial = () => !!settings().rezim.zkusebni;

// ① Oslovit: komu končí lhůta do 3 měsíců (nebo už propadla) a ještě nemá domluveno
export async function contactCandidates(today = new Date()) {
  const [customers, appts, inquiries] = await Promise.all([all('customers'), all('appointments'), all('inquiries')]);
  const t = isoDate(today);
  const busy = new Set([
    ...appts.filter((a) => a.status === 'planned' && a.date >= t).map((a) => `${a.customerId}|${a.objectId}`),
    ...inquiries.filter((q) => ['waiting', 'open'].includes(q.stage)).map((q) => `${q.customerId}|${q.objectId}`),
  ]);
  const out = [];
  for (const c of customers) {
    if (c.archived || c.noSms) continue;
    for (const o of c.objects || []) {
      if (busy.has(`${c.id}|${o.id}`)) continue;
      const states = o.chimneys.map((k) => dueState(k, today)).filter((d) => ['overdue', 'soon', 'contact'].includes(d.state));
      if (!states.length) continue;
      states.sort((a, b) => a.date - b.date);
      out.push({ customer: c, object: o, due: states[0] });
    }
  }
  out.sort((a, b) => a.due.date - b.due.date);
  return out;
}

export function groupByCity(items, key = (x) => x.object?.address?.city || 'Bez obce') {
  const m = new Map();
  for (const it of items) { const k = key(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'cs'));
}

export async function createInquiry(data) {
  const q = { id: uid('q_'), stage: 'open', kind: 'kontrola', note: '', prefer: '', desiredDate: '', tripId: null, createdAt: new Date().toISOString(), trial: trial(), ...data };
  await put('inquiries', q);
  return q;
}

export async function listInquiries(stages) {
  const items = await all('inquiries');
  return items.filter((q) => stages.includes(q.stage)).sort((a, b) => (a.desiredDate || a.createdAt).localeCompare(b.desiredDate || b.createdAt));
}

export const updateInquiry = async (id, patch) => { const q = await get('inquiries', id); const n = { ...q, ...patch }; await put('inquiries', n); return n; };

// Domluvený termín → návštěva v plánu dne (a v kalendáři)
export async function scheduleAppointment({ customerId, objectId, date, block = '', time = '', kind = 'kontrola', prefer = '', note = '', tripId = null, inquiryId = null }) {
  const sameDay = await byIndex('appointments', 'date', date);
  const a = {
    id: uid('a_'), date, block, time: time || (block ? `${block.split('–')[0].padStart(2, '0')}:00` : ''), order: sameDay.length + 1,
    customerId, objectId, kind, status: 'planned', prefer, note, tripId, inquiryId, trial: trial(), createdAt: new Date().toISOString(),
  };
  await put('appointments', a);
  if (inquiryId) await updateInquiry(inquiryId, { stage: 'done', appointmentId: a.id });
  return a;
}

export async function moveAppointment(id, { date, block, time }) {
  const a = await get('appointments', id);
  const sameDay = await byIndex('appointments', 'date', date);
  const n = { ...a, date, block: block ?? a.block, time: time || (block ? `${block.split('–')[0].padStart(2, '0')}:00` : a.time), order: sameDay.length + 1, status: 'planned' };
  await put('appointments', n);
  return n;
}

// Nezastižen / zrušený den: návštěva zpět do Poptávek
export async function backToInquiries(appointment, reason) {
  await put('appointments', { ...appointment, status: 'missed', missedReason: reason });
  return createInquiry({ customerId: appointment.customerId, objectId: appointment.objectId, kind: appointment.kind, prefer: appointment.prefer, note: reason, stage: 'open', fromAppointment: appointment.id });
}

export async function reorder(date, idsInOrder) {
  const items = await byIndex('appointments', 'date', date);
  for (const a of items) { const i = idsInOrder.indexOf(a.id); if (i >= 0 && a.order !== i + 1) await put('appointments', { ...a, order: i + 1 }); }
}

// Výjezdy (Den v obci / Okružní) – uložené jako události kalendáře typu „vyjezd“
export async function createTrip({ date, type = 'okruzni', villages = [], note = '' }) {
  const t = { id: uid('t_'), kind: 'vyjezd', date, type, villages, note, title: `${TRIP_TYPES[type]}: ${villages.join(', ') || 'bez obcí'}`, trial: trial(), createdAt: new Date().toISOString() };
  await put('events', t);
  return t;
}

export async function upcomingTrips(today = new Date()) {
  const t = isoDate(today);
  return (await all('events')).filter((e) => e.kind === 'vyjezd' && e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
}

export async function appointmentsBetween(from, to) {
  return (await all('appointments')).filter((a) => a.date >= from && a.date <= to);
}

export function tomorrow(d = new Date()) { const x = new Date(d); x.setDate(x.getDate() + 1); return x; }
export function addDays(iso, n) { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoDate(d); }

export { customerDue };
