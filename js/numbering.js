// Číselné řady
// • návštěvy (zpráva, protokol, samostatný doklad): číslo/měsíc/rok, každý měsíc od 1; VS = RRRRMM + 3 číslice
// • faktury: RRRR/NN, VS = RRRRNN
// • nabídky: NRRRR/NN
import { update, get } from './db.js';

const pad = (n, len) => String(n).padStart(len, '0');

export function formatVisit(n, date) {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  return { no: `${n}/${m}/${y}`, vs: `${y}${pad(m, 2)}${pad(n, 3)}`, n, month: m, year: y };
}

export function formatInvoice(n, year) {
  return { no: `${year}/${pad(n, 2)}`, vs: `${year}${pad(n, 2)}`, n, year };
}

export function formatOffer(n, year) {
  return { no: `N${year}/${pad(n, 2)}`, n, year };
}

// Rozsah řady: zkušební režim má vlastní, oddělené čítače
function scope(trial) { return trial ? 'trial:' : ''; }

export async function nextVisitNumber(date = new Date(), trial = false) {
  const key = `${scope(trial)}visit:${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}`;
  const rec = await update('counters', key, (cur) => ({ key, last: (cur?.last || 0) + 1 }));
  return formatVisit(rec.last, date);
}

export async function nextInvoiceNumber(date = new Date(), trial = false) {
  const key = `${scope(trial)}invoice:${date.getFullYear()}`;
  const rec = await update('counters', key, (cur) => ({ key, last: (cur?.last || 0) + 1 }));
  return formatInvoice(rec.last, date.getFullYear());
}

export async function nextOfferNumber(date = new Date(), trial = false) {
  const key = `${scope(trial)}offer:${date.getFullYear()}`;
  const rec = await update('counters', key, (cur) => ({ key, last: (cur?.last || 0) + 1 }));
  return formatOffer(rec.last, date.getFullYear());
}

// Stav řad pro Nastavení → Dokumenty a číslování (jen zobrazení)
export async function counterState(date = new Date(), trial = false) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  const s = scope(trial);
  const v = (await get('counters', `${s}visit:${y}-${m}`))?.last || 0;
  const i = (await get('counters', `${s}invoice:${y}`))?.last || 0;
  const o = (await get('counters', `${s}offer:${y}`))?.last || 0;
  return {
    visit: v ? formatVisit(v, date).no : `zatím žádná (další 1/${date.getMonth() + 1}/${y})`,
    invoice: i ? formatInvoice(i, y).no : 'zatím žádná',
    offer: o ? formatOffer(o, y).no : 'zatím žádná',
  };
}
