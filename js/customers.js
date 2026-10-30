// Práce se zákazníky: hledání, strom obcí, duplicity, sousedé, oslovení
import { all, get, put, moveToTrash, uid } from './db.js';
import { settings } from './settings.js';
import { FUEL_LABEL } from './lhuty.js';

export const TYPES = { osoba: 'Osoba', firma: 'Firma', obec: 'Obec', svj: 'SVJ' };
export const DELIVERY = { whatsapp: 'WhatsApp', email: 'E-mail', tisk: 'Tisk' };
export const APPLIANCES = ['kotel', 'krbová vložka', 'kachlová kamna', 'krbová kamna', 'lokální kamna', 'sporák', 'jiný'];

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const digits = (s) => String(s || '').replace(/\D/g, '');

export function displayName(c) {
  if (c.type === 'osoba') return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'Bez jména';
  return c.name || 'Bez názvu';
}

export function sortKey(c) {
  return norm(c.type === 'osoba' ? `${c.lastName} ${c.firstName}` : c.name);
}

// Text pro hledání: jméno, adresy, telefony, e-mail, spotřebiče, štítky, poznámka, IČO
export function searchText(c, docs = []) {
  const parts = [displayName(c), c.email, c.ico, c.note, c.source, ...(c.tags || []), ...(c.phones || []), ...(c.phones || []).map(digits)];
  for (const o of c.objects || []) {
    const a = o.address || {};
    parts.push(a.street, a.city, a.zip, a.district);
    for (const k of o.chimneys || []) {
      parts.push(FUEL_LABEL[k.fuel], k.label);
      for (const ap of k.appliances || []) parts.push(ap.kind, ap.brand);
    }
  }
  for (const d of docs) parts.push(d.no, d.vs);
  return norm(parts.filter(Boolean).join(' | '));
}

export function matches(c, query, docs) {
  const q = norm(query);
  if (!q) return true;
  const text = searchText(c, docs);
  const qd = digits(query);
  return q.split(' ').every((w) => text.includes(w)) || (qd.length >= 3 && text.includes(qd));
}

export async function listCustomers({ archived = false } = {}) {
  const items = await all('customers');
  return items.filter((c) => !!c.archived === archived).sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'cs'));
}

export const getCustomer = (id) => get('customers', id);

export async function saveCustomer(c) {
  c.name = displayName(c);
  c.updatedAt = new Date().toISOString();
  if (!c.id) { c.id = uid('c_'); c.createdAt = c.updatedAt; c.trial = !!settings().rezim.zkusebni; }
  await put('customers', c);
  return c;
}

export async function archiveCustomer(id, archived = true) {
  const c = await get('customers', id);
  c.archived = archived;
  await put('customers', c);
}

export async function deleteCustomer(id) {
  const c = await get('customers', id);
  await moveToTrash('customers', id, `Zákazník: ${displayName(c)}`);
}

// Strom okres → obec → ulice (každý objekt zvlášť)
export function buildTree(customers) {
  const tree = new Map();
  for (const c of customers) for (const o of c.objects || []) {
    const a = o.address || {};
    const d = a.district || 'Neurčený okres';
    const city = a.city || 'Bez obce';
    const street = (a.street || '').replace(/\s*\d.*$/, '').trim() || city;
    if (!tree.has(d)) tree.set(d, new Map());
    const cities = tree.get(d);
    if (!cities.has(city)) cities.set(city, new Map());
    const streets = cities.get(city);
    if (!streets.has(street)) streets.set(street, []);
    streets.get(street).push({ customer: c, object: o });
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'cs'));
  return sorted(tree).map(([district, cities]) => ({
    name: district,
    cities: sorted(cities).map(([city, streets]) => ({
      name: city,
      streets: sorted(streets).map(([street, items]) => ({ name: street, items })),
    })),
  }));
}

// Možné duplicity: stejný telefon, e-mail nebo stejné jméno ve stejné obci
export function findDuplicates(candidate, customers) {
  const phones = new Set((candidate.phones || []).map(digits).filter((p) => p.length >= 9));
  const email = norm(candidate.email);
  const name = norm(displayName(candidate));
  const cities = new Set((candidate.objects || []).map((o) => norm(o.address?.city)));
  return customers.filter((c) => c.id !== candidate.id && (
    (c.phones || []).some((p) => phones.has(digits(p))) ||
    (email && norm(c.email) === email) ||
    (name && norm(displayName(c)) === name && (c.objects || []).some((o) => cities.has(norm(o.address?.city))))
  ));
}

// Sousedé: další zákazníci na stejné ulici ve stejné obci
export function neighbours(customer, object, customers) {
  const a = object.address || {};
  const street = norm((a.street || '').replace(/\s*\d.*$/, ''));
  const city = norm(a.city);
  const out = [];
  for (const c of customers) {
    if (c.id === customer.id || c.archived) continue;
    for (const o of c.objects || []) {
      if (norm(o.address?.city) === city && norm((o.address?.street || '').replace(/\s*\d.*$/, '')) === street) out.push({ customer: c, object: o });
    }
  }
  return out;
}

// Oslovení v 5. pádu („Dobrý den, pane Nováku,“). Firmy, obce a SVJ jen „Dobrý den,“.
export function salutation(c) {
  if (c.type !== 'osoba' || !c.lastName) return 'Dobrý den,';
  const female = c.gender === 'f' || /(ová|á)$/i.test(c.lastName);
  return `Dobrý den, ${female ? 'paní' : 'pane'} ${female ? c.lastName : vocative(c.lastName)},`;
}

export function vocative(n) {
  const rules = [
    [/(ek)$/i, (m) => n.slice(0, -2) + 'ku'], // Hájek → Hájku
    [/(el)$/i, (m) => n.slice(0, -2) + 'le'], // Havel → Havle
    [/ec$/i, () => n.slice(0, -2) + 'če'],   // Němec → Němče
    [/[kgh]$/i, () => n + 'u'],               // Novák → Nováku
    [/(ř|š|ž|č|c|j|ď|ť|ň|x|s|z)$/i, () => n + 'i'], // Kovář → Kováři, Beneš → Beneši
    [/r$/i, () => n.slice(0, -1) + 'ře'],     // Petr → Petře
    [/a$/i, () => n.slice(0, -1) + 'o'],      // Svoboda → Svobodo
    [/[ýí]$/i, () => n],                      // Černý → Černý
    [/[bdflmnptvw]$/i, () => n + 'e'],        // Dvořák handled above; Šindelář above; Beran → Berane
  ];
  for (const [re, fn] of rules) if (re.test(n)) return fn();
  return n;
}

export function emptyCustomer() {
  return {
    id: null, type: 'osoba', firstName: '', lastName: '', name: '', gender: '', ico: '', phones: [''], email: '',
    delivery: 'whatsapp', tags: [], source: '', note: '', isNew: true, archived: false,
    objects: [emptyObject()],
  };
}
export function emptyObject() {
  return { id: uid('o_'), type: 'RD', address: { street: '', city: '', zip: '', district: '', lat: null, lng: null }, chimneys: [emptyChimney(1)] };
}
export function emptyChimney(n = 1) {
  return { id: uid('k_'), label: `Komín ${n}`, fuel: 'tuha', condensing: false, lastCheck: '', appliances: [{ kind: 'kotel', brand: '', kw: '', floor: '' }] };
}
