// Finance: faktury, upomínky, nabídky, náklady, pravidelné platby, tržby a limit paušální daně
import { all, get, put, uid } from './db.js';
import { settings, saveSettings } from './settings.js';
import { nextInvoiceNumber, nextOfferNumber } from './numbering.js';
import { paymentTotal } from './payment.js';
import { isoDate, parseIso } from './ui.js';

const trial = () => !!settings().rezim.zkusebni;
export const sumItems = (items = []) => items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);

// ---------- Faktury ----------
export async function createInvoice({ customerId, items, documentIds = [], note = '' }) {
  const s = settings();
  const date = new Date();
  const num = await nextInvoiceNumber(date, trial());
  const due = new Date(date); due.setDate(due.getDate() + (s.cenik.splatnostDni || 14));
  const inv = {
    id: uid('f_'), no: num.no, vs: num.vs, date: isoDate(date), due: isoDate(due), customerId, items, documentIds, note,
    total: sumItems(items), status: 'open', paidAt: null, reminders: [], trial: trial(), createdAt: date.toISOString(),
  };
  await put('invoices', inv);
  for (const id of documentIds) { const d = await get('documents', id); if (d) await put('documents', { ...d, invoiceId: inv.id, invoiceNo: inv.no }); }
  return inv;
}

export function invoiceState(inv, today = isoDate(new Date())) {
  if (inv.status === 'storno') return { key: 'storno', label: 'storno', tag: '' };
  if (inv.status === 'paid') return { key: 'paid', label: 'uhrazeno', tag: 'ok' };
  if (inv.due < today) {
    const days = Math.round((parseIso(today) - parseIso(inv.due)) / 86400000);
    return { key: 'overdue', label: `po splatnosti ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`, tag: 'bad', days };
  }
  return { key: 'open', label: `splatná ${parseIso(inv.due).getDate()}. ${parseIso(inv.due).getMonth() + 1}.`, tag: 'warn' };
}

// Upomínka 1 v den splatnosti, upomínka 2 po 14 dnech
export function reminderDue(inv, today = isoDate(new Date())) {
  if (inv.status !== 'open') return null;
  const sent = new Set((inv.reminders || []).map((r) => r.level));
  const [d1, d2] = settings().finance.upominkaDny || [0, 14];
  const due = parseIso(inv.due);
  const at = (n) => { const x = new Date(due); x.setDate(x.getDate() + n); return isoDate(x); };
  if (!sent.has(2) && today >= at(d2)) return 2;
  if (!sent.has(1) && today >= at(d1)) return 1;
  return null;
}

// zprávy/doklady placené fakturou, ke kterým ještě faktura není
export async function documentsToInvoice() {
  return (await all('documents')).filter((d) => d.status === 'final' && !d.storno && d.payment?.method === 'faktura' && !d.invoiceId);
}

// ---------- Nabídky ----------
export async function createOffer(data) {
  const s = settings();
  const date = new Date();
  const valid = new Date(date); valid.setDate(valid.getDate() + 30);
  const o = {
    id: uid('n_'), no: null, date: isoDate(date), validUntil: isoDate(valid), status: 'draft', subject: '', description: '',
    items: [], markupPct: s.cenik.prirazkaMaterial, photos: [], trial: trial(), createdAt: date.toISOString(), ...data,
  };
  await put('offers', o);
  return o;
}

export async function numberOffer(o) {
  if (o.no) return o;
  const n = await nextOfferNumber(new Date(), !!o.trial);
  o.no = n.no;
  await put('offers', o);
  return o;
}

// cena pro zákazníka (materiál s přirážkou) a co zůstane „v kapse“
export function offerTotals(o) {
  const k = 1 + (Number(o.markupPct) || 0) / 100;
  let prace = 0, material = 0, materialNakup = 0, doprava = 0;
  for (const i of o.items) {
    const base = (Number(i.qty) || 0) * (Number(i.price) || 0);
    if (i.group === 'material') { materialNakup += base; material += Math.round(base * k); } else if (i.group === 'doprava') doprava += base; else prace += base;
  }
  const total = prace + material + doprava;
  return { prace, material, materialNakup, doprava, total, vKapse: total - materialNakup, prirazka: material - materialNakup };
}
export const customerUnitPrice = (o, i) => (i.group === 'material' ? Math.round((Number(i.price) || 0) * (1 + (Number(o.markupPct) || 0) / 100) * 100) / 100 : Number(i.price) || 0);

// ---------- Náklady ----------
export const CATEGORIES = [
  ['tankovani', 'Auto · tankování', 'auto'], ['auto', 'Auto · ostatní', 'auto'], ['material', 'Materiál na zakázky', 'material'],
  ['naradi', 'Nářadí', 'naradi'], ['reklama', 'Reklama', 'reklama'], ['telefon', 'Telefon', 'telefon'],
  ['pojisteni', 'Pojištění', 'pojisteni'], ['ostatni', 'Ostatní', 'ostatni'],
];
export const catLabel = (k) => (CATEGORIES.find((c) => c[0] === k) || [])[1] || k;

export async function saveExpense(e) {
  const x = { id: uid('x_'), date: isoDate(), amount: 0, category: 'ostatni', note: '', photo: null, jobRef: null, returned: false, trial: trial(), createdAt: new Date().toISOString(), ...e };
  x.amount = Number(String(x.amount).replace(',', '.')) || 0;
  await put('expenses', x);
  return x;
}

// Pravidelné platby (telefon měsíčně, pojištění ročně) se samy zapíšou v den platby
export async function applyRecurring(today = new Date()) {
  const list = settings().finance.pravidelne || [];
  if (!list.length) return 0;
  const existing = new Set((await all('expenses')).map((e) => e.recurringKey).filter(Boolean));
  let added = 0;
  for (const r of list) {
    const start = parseIso(r.since || isoDate(today));
    for (let d = new Date(start); d <= today; d.setMonth(d.getMonth() + (r.every === 'rok' ? 12 : 1))) {
      const pay = new Date(d.getFullYear(), d.getMonth(), Math.min(r.day || 1, 28));
      if (pay > today || pay < start) continue;
      const k = `${r.id}:${isoDate(pay).slice(0, 7)}`;
      if (existing.has(k)) continue;
      await saveExpense({ date: isoDate(pay), amount: r.amount, category: r.category || 'ostatni', note: `${r.name} (pravidelná platba)`, recurringKey: k });
      existing.add(k); added++;
    }
  }
  return added;
}

export async function saveRecurring(list) { await saveSettings({ finance: { pravidelne: null } }); await saveSettings({ finance: { pravidelne: list } }); }

// ---------- Přehled ----------
// Tržby podle toho, kdy peníze přišly: hotově/QR v den návštěvy, faktury v den úhrady
export async function revenueByMonth(year) {
  const [docs, invs, exps] = await Promise.all([all('documents'), all('invoices'), all('expenses')]);
  const months = Array.from({ length: 12 }, () => ({ income: 0, cost: 0, cash: 0, qr: 0, invoice: 0, fuel: 0, material: 0 }));
  for (const d of docs) {
    if (d.status !== 'final' || d.storno || !['hotove', 'qr'].includes(d.payment?.method)) continue;
    const dt = parseIso(d.date); if (dt.getFullYear() !== year) continue;
    const t = paymentTotal(d.payment.items);
    months[dt.getMonth()].income += t; months[dt.getMonth()][d.payment.method === 'qr' ? 'qr' : 'cash'] += t;
  }
  for (const i of invs) {
    if (i.status !== 'paid' || !i.paidAt) continue;
    const dt = parseIso(i.paidAt.slice(0, 10)); if (dt.getFullYear() !== year) continue;
    months[dt.getMonth()].income += i.total; months[dt.getMonth()].invoice += i.total;
  }
  for (const e of exps) {
    const dt = parseIso(e.date); if (dt.getFullYear() !== year) continue;
    months[dt.getMonth()].cost += e.amount;
    if (e.category === 'tankovani') months[dt.getMonth()].fuel += e.amount;
    if (e.category === 'material') months[dt.getMonth()].material += e.amount;
  }
  return months;
}

// Limity paušálního režimu podle pásma (příjmy za rok)
export const PAUSAL_LIMITS = { 1: 1000000, 2: 1500000, 3: 2000000 };
