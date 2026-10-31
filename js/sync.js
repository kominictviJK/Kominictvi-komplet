// Napojení na svět: kalendář Google, Gmail (poptávky a nákupy), banka (platby a karty)
import { all, get, put, del, uid } from './db.js';
import { settings } from './settings.js';
import { callHelper, hasHelper } from './google.js';
import { hasAi, readInquiry } from './ai.js';
import { displayName } from './customers.js';
import { KIND_LABEL, TRIP_TYPES, addDays } from './planning.js';
import { isoDate } from './ui.js';

const getVal = async (k, d) => (await get('settings', k))?.value ?? d;
const setVal = (k, value) => put('settings', { key: k, value });

// ---------- Kalendář Google ----------
export async function syncCalendar() {
  if (!hasHelper()) return null;
  const today = isoDate();
  const from = addDays(today, -30), to = addDays(today, 150);
  const [appts, events, customers] = await Promise.all([all('appointments'), all('events'), all('customers')]);
  const cust = new Map(customers.map((c) => [c.id, c]));
  const list = [];
  for (const a of appts) {
    if (a.date < from || a.date > to || a.status === 'missed' || a.trial) continue;
    const c = cust.get(a.customerId); if (!c) continue;
    const o = c.objects.find((x) => x.id === a.objectId) || c.objects[0];
    const [h, m] = (a.time || `${(a.block || '8').split('–')[0]}:00`).split(':').map(Number);
    const start = new Date(`${a.date}T00:00:00`); start.setHours(h || 8, m || 0);
    const end = new Date(start); end.setMinutes(end.getMinutes() + (a.block ? 60 : 45));
    list.push({ id: a.id, title: `${KIND_LABEL[a.kind] || 'Návštěva'}: ${displayName(c)}`, start: start.toISOString(), end: end.toISOString(), location: `${o.address.street}, ${o.address.zip} ${o.address.city}`, description: `Tel. ${(c.phones || []).join(', ')}${a.prefer ? `\nHodí se: ${a.prefer}` : ''}${c.note ? `\n${c.note}` : ''}` });
  }
  for (const e of events) {
    if (e.date < from || e.date > to || e.trial) continue;
    const title = e.kind === 'vyjezd' ? `${TRIP_TYPES[e.type]}: ${e.villages.join(', ')}` : e.kind === 'task' ? `☐ ${e.title}` : e.title;
    if (e.time && e.kind === 'event') { const s = new Date(`${e.date}T${e.time}:00`); const en = new Date(s); en.setHours(en.getHours() + 1); list.push({ id: e.id, title, start: s.toISOString(), end: en.toISOString(), description: e.note || '' }); }
    else list.push({ id: e.id, title, start: `${e.date}T00:00:00`, end: `${e.date}T23:59:00`, allDay: true, description: e.note || '' });
  }
  const r = await callHelper('calendarSync', { from: `${from}T00:00:00`, to: `${to}T23:59:59`, events: list }, { timeout: 120000 });
  await setVal('gcal:personal', r.personal || []);
  await setVal('gcal:last', new Date().toISOString());
  return r;
}
export const personalEvents = () => getVal('gcal:personal', []);

// ---------- Fronta ke kontrole (nákupy z Gmailu a banky, e-mailové poptávky) ----------
export const pending = async (type) => (await all('queue')).filter((q) => !type || q.type === type).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
export const dropPending = (id) => del('queue', id);

const INQUIRY_WORDS = /kom[ií]n|kominík|čištění|vyčistit|revize|kontrol|vložk|frézov|kotel|krb|kamna/i;

export async function scanGmail() {
  if (!hasHelper()) return 0;
  const seen = new Set(await getVal('gmail:seen', []));
  const items = await callHelper('scanGmail', {
    queries: [
      { kind: 'inquiry', query: 'in:inbox newer_than:14d -category:promotions -category:social -category:updates -from:me', max: 25 },
      { kind: 'purchase', query: 'newer_than:45d has:attachment (faktura OR "daňový doklad" OR "potvrzení objednávky" OR "doklad o zaplacení") -from:me', max: 15, withAttachments: true },
    ],
  }, { timeout: 120000 });
  let added = 0;
  for (const m of items) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    if (m.kind === 'purchase' && !(settings().finance.obchodyOsobni || []).some((s) => m.from.toLowerCase().includes(s))) {
      await put('queue', { id: uid('g_'), type: 'expense', source: 'Gmail', date: m.date.slice(0, 10), title: m.subject, from: m.from, text: m.text, attachments: m.attachments });
      added++;
    } else if (m.kind === 'inquiry') {
      let parsed = null;
      if (hasAi()) {
        try { parsed = await readInquiry({ text: `Předmět: ${m.subject}\nOd: ${m.from}\n${m.text.slice(0, 2500)}` }); } catch { seen.delete(m.id); continue; }
        if (!parsed.isInquiry && !parsed.isMayorConfirmation) continue;
      } else if (!INQUIRY_WORDS.test(`${m.subject} ${m.text}`)) continue;
      await put('queue', { id: uid('g_'), type: 'mail', source: 'Gmail', date: m.date.slice(0, 10), title: m.subject, from: m.from, text: m.text, parsed });
      added++;
    }
  }
  await setVal('gmail:seen', [...seen].slice(-800));
  await setVal('gmail:last', new Date().toISOString());
  return added;
}

// ---------- Banka ----------
// Příchozí platby se párují podle VS (faktury a QR platby), odchozí platby kartou → návrh nákladu
export async function applyTransactions(txs) {
  const seen = new Set(await getVal('bank:seen', []));
  const [invs, docs] = await Promise.all([all('invoices'), all('documents')]);
  let paired = 0, suggested = 0;
  for (const t of txs) {
    const key = t.id || `${t.date}|${t.amount}|${t.vs}|${t.counterparty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (t.amount > 0 && t.vs) {
      const inv = invs.find((i) => i.vs === t.vs && i.status === 'open');
      if (inv) { await put('invoices', { ...inv, status: 'paid', paidAt: `${t.date}T12:00:00`, paidAmount: t.amount }); paired++; continue; }
      const d = docs.find((x) => x.vs === t.vs && x.status === 'final' && !x.payment.paid);
      if (d) { await put('documents', { ...d, payment: { ...d.payment, paid: true, paidAt: t.date } }); paired++; continue; }
    }
    if (t.amount < 0) {
      await put('queue', { id: uid('b_'), type: 'expense', source: 'banka', date: t.date, title: t.counterparty || t.message || 'Platba', amount: Math.abs(t.amount), text: t.message });
      suggested++;
    }
  }
  await setVal('bank:seen', [...seen].slice(-3000));
  return { paired, suggested };
}

export async function fetchBank() {
  const token = settings().propojeni?.fioToken;
  if (!token) throw new Error('Chybí token banky (Nastavení → Propojení → Banka)');
  const last = await getVal('bank:last', addDays(isoDate(), -30));
  const txs = await callHelper('fio', { token, from: last, to: isoDate() }, { timeout: 90000 });
  const r = await applyTransactions(txs);
  await setVal('bank:last', isoDate());
  return r;
}

// Výpis z banky v CSV (většina bank: datum; částka; VS; protistrana; zpráva)
export function parseStatement(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  let hi = lines.findIndex((l) => /datum/i.test(l) && /(částka|objem|amount)/i.test(l));
  if (hi < 0) hi = 0;
  const head = split(lines[hi]).map((h) => h.toLowerCase());
  const col = (...names) => { for (const n of names) { const i = head.findIndex((h) => h.includes(n)); if (i >= 0) return i; } return -1; };
  const ci = { date: col('datum'), amount: col('částka', 'objem', 'amount'), vs: col('vs', 'variabilní'), party: col('název protiúčtu', 'protistrana', 'protiúčet', 'obchodník', 'popis'), msg: col('zpráva', 'poznámka', 'message') };
  const toIso = (s) => { const m = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; const n = s.match(/(\d{4})-(\d{2})-(\d{2})/); return n ? n[0] : ''; };
  return lines.slice(hi + 1).map(split).map((r) => ({
    id: '', date: toIso(r[ci.date] || ''), amount: Number(String(r[ci.amount] || '').replace(/\s/g, '').replace(',', '.')) || 0,
    vs: ci.vs >= 0 ? (r[ci.vs] || '').replace(/\D/g, '') : '', counterparty: ci.party >= 0 ? r[ci.party] : '', message: ci.msg >= 0 ? r[ci.msg] : '',
  })).filter((t) => t.date && t.amount);
}

// Spuštění na pozadí po otevření aplikace (nejvýš jednou za 30 minut)
export async function backgroundSync() {
  if (!hasHelper() || !navigator.onLine) return;
  const last = await getVal('sync:last', null);
  if (last && Date.now() - new Date(last).getTime() < 30 * 60000) return;
  await setVal('sync:last', new Date().toISOString());
  try { await syncCalendar(); } catch { /* další pokus příště */ }
  try { await scanGmail(); } catch { /* další pokus příště */ }
  if (settings().propojeni?.fioToken) { try { await fetchBank(); } catch { /* další pokus příště */ } }
}
