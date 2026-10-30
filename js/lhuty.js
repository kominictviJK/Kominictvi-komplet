// Lhůty kontrol: kdy je další kontrola a v jakém je stavu
import { settings } from './settings.js';
import { isoDate, parseIso, monthName } from './ui.js';

export const FUEL_LABEL = { tuha: 'tuhá paliva', plyn: 'plyn', kapalna: 'kapalná paliva' };

// Počet měsíců do další kontroly podle paliva (kondenzační kotel 24 měsíců)
export function intervalMonths(chimney, s = settings()) {
  const condensing = chimney.condensing || chimney.appliances?.some((a) => a.condensing);
  if (condensing) return s.lhuty.kondenzacniMesice;
  if (chimney.fuel === 'plyn') return s.lhuty.plynMesice;
  return s.lhuty.tuhaMesice;
}

export function nextCheck(chimney, s = settings()) {
  if (!chimney.lastCheck) return null;
  const d = parseIso(chimney.lastCheck);
  d.setMonth(d.getMonth() + intervalMonths(chimney, s));
  return d;
}

// Stav: 'none' (neznámá), 'overdue' (propadlá), 'soon' (do 30 dní), 'contact' (do 3 měsíců – oslovit), 'ok'
export function dueState(chimney, today = new Date(), s = settings()) {
  const n = nextCheck(chimney, s);
  if (!n) return { state: 'none', label: 'lhůta neznámá', date: null };
  const days = Math.floor((n - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const label = `${monthName(n.getMonth())} ${n.getFullYear()}`;
  if (days < 0) return { state: 'overdue', label: `propadlá (${label})`, date: n, days };
  if (days <= 30) return { state: 'soon', label: `do 30 dní (${label})`, date: n, days };
  const contactDays = s.lhuty.oslovitMesicePredem * 30.5;
  if (days <= contactDays) return { state: 'contact', label: `oslovit · ${label}`, date: n, days };
  return { state: 'ok', label, date: n, days };
}

// Nejnaléhavější stav ze všech komínů zákazníka
const ORDER = { overdue: 0, soon: 1, contact: 2, none: 3, ok: 4 };
export function customerDue(customer, today = new Date()) {
  let best = null;
  for (const o of customer.objects || []) for (const k of o.chimneys || []) {
    const d = dueState(k, today);
    if (!best || ORDER[d.state] < ORDER[best.state] || (d.state === best.state && d.date && best.date && d.date < best.date)) best = d;
  }
  return best || { state: 'none', label: 'bez komínu', date: null };
}

export const DUE_TAG = { overdue: 'bad', soon: 'warn', contact: 'new', none: '', ok: 'ok' };

export { isoDate };
