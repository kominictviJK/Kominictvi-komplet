// Zkušební data – vymyšlení zákazníci pro vyzkoušení aplikace před ostrým provozem
import { putMany, all, del, uid } from './db.js';
import { isoDate } from './ui.js';

const addr = (street, city, zip, district, lat, lng) => ({ street, city, zip, district, lat, lng });

function customer(o) {
  return {
    id: uid('c_'), type: 'osoba', phones: [], email: '', delivery: 'whatsapp', tags: [], source: '',
    note: '', isNew: false, archived: false, ico: '', createdAt: new Date().toISOString(), trial: true, demo: true, ...o,
    name: o.name || `${o.firstName} ${o.lastName}`,
  };
}
function object(address, chimneys, type = 'RD') { return { id: uid('o_'), type, address, chimneys }; }
function chimney(label, fuel, lastCheck, appliances, extra = {}) {
  return { id: uid('k_'), label, fuel, lastCheck, appliances, ...extra };
}

export function buildSeed(today = new Date()) {
  const d = (offsetDays) => { const x = new Date(today); x.setDate(x.getDate() + offsetDays); return isoDate(x); };
  const lastYear = (offsetDays) => { const x = new Date(today); x.setFullYear(x.getFullYear() - 1); x.setDate(x.getDate() + offsetDays); return isoDate(x); };

  const c = [
    customer({ firstName: 'Marie', lastName: 'Vlčková', gender: 'f', phones: ['605 214 778'], email: 'vlckova.m@seznam.cz', delivery: 'email',
      objects: [object(addr('Pionýrů 18', 'Uničov', '783 91', 'Olomouc', 49.7712, 17.1196), [chimney('Komín 1', 'plyn', lastYear(0), [{ kind: 'kotel', brand: 'Baxi Luna 3', kw: 24, floor: '1. NP' }])])] }),
    customer({ firstName: 'Josef', lastName: 'Dvořák', gender: 'm', phones: ['731 554 902'], delivery: 'tisk', note: 'Pes na dvoře – zavolat před příjezdem.',
      objects: [object(addr('Lidická 7', 'Uničov', '783 91', 'Olomouc', 49.7741, 17.1238), [
        chimney('Komín 1', 'tuha', lastYear(-3), [{ kind: 'kotel', brand: 'Viadrus Hercules', kw: 26, floor: 'PP' }]),
        chimney('Komín 2', 'tuha', lastYear(-3), [{ kind: 'krbová kamna', brand: 'Romotop', kw: 8, floor: '1. NP' }]),
      ])] }),
    customer({ firstName: 'Petr', lastName: 'Šindelář', gender: 'm', phones: ['602 887 310', '604 112 093'], delivery: 'whatsapp',
      objects: [object(addr('Na Výsluní 41', 'Medlov', '783 91', 'Olomouc', 49.7962, 17.0614), [chimney('Komín 1', 'tuha', lastYear(2), [{ kind: 'krbová vložka', brand: 'Kobok', kw: 10, floor: '1. NP' }])])] }),
    customer({ firstName: 'Hana', lastName: 'Zbořilová', gender: 'f', phones: ['720 330 551'], delivery: 'whatsapp', isNew: true, source: 'doporučení souseda',
      objects: [object(addr('Hlavní 112', 'Šumvald', '783 85', 'Olomouc', 49.8302, 17.1325), [chimney('Komín 1', 'plyn', null, [{ kind: 'kotel', brand: 'Vaillant ecoTEC', kw: 20, floor: '1. NP', condensing: true }], { condensing: true })])] }),
    customer({ firstName: 'Lukáš', lastName: 'Beneš', gender: 'm', phones: ['777 402 118'], email: 'benes.lukas@email.cz', delivery: 'email', note: 'Odpoledne až po 14:00.',
      objects: [object(addr('Družstevní 5', 'Hlubočky', '783 61', 'Olomouc', 49.6268, 17.3954), [chimney('Komín 1', 'tuha', lastYear(10), [{ kind: 'kachlová kamna', brand: '', kw: 6, floor: '1. NP' }])])] }),
    customer({ type: 'obec', name: 'Obec Hnojice', phones: ['585 041 120'], email: 'obec@hnojice.cz', delivery: 'email', ico: '',
      objects: [
        object(addr('Hnojice 120 – hasičská zbrojnice', 'Hnojice', '785 01', 'Olomouc', 49.7202, 17.2259), [chimney('Komín 1', 'tuha', lastYear(-20), [{ kind: 'lokální kamna', brand: '', kw: 8, floor: '1. NP' }])], 'jiný'),
        object(addr('Hnojice 44 – základní škola', 'Hnojice', '785 01', 'Olomouc', 49.7215, 17.2271), [chimney('Komín 1', 'plyn', lastYear(-20), [{ kind: 'kotel', brand: 'Protherm', kw: 35, floor: 'PP' }])], 'jiný'),
      ] }),
    customer({ firstName: 'Martin', lastName: 'Kovář', gender: 'm', phones: ['608 117 902'], delivery: 'email', email: 'kovar.martin@post.cz',
      objects: [object(addr('Palackého 22', 'Lipník nad Bečvou', '751 31', 'Přerov', 49.5274, 17.5862), [chimney('Komín 1', 'tuha', lastYear(25), [{ kind: 'kotel', brand: 'Atmos', kw: 25, floor: 'PP' }])])] }),
    customer({ firstName: 'Jana', lastName: 'Horáková', gender: 'f', phones: ['739 220 671'], delivery: 'whatsapp',
      objects: [object(addr('Olomoucká 19', 'Šternberk', '785 01', 'Olomouc', 49.7287, 17.3005), [chimney('Komín 1', 'plyn', lastYear(40), [{ kind: 'kotel', brand: 'Junkers', kw: 24, floor: '1. NP' }])])] }),
    customer({ firstName: 'Pavel', lastName: 'Novotný', gender: 'm', phones: ['604 778 120'], delivery: 'whatsapp',
      objects: [object(addr('Gen. Svobody 30', 'Uničov', '783 91', 'Olomouc', 49.7705, 17.1255), [chimney('Komín 1', 'tuha', lastYear(30), [{ kind: 'kotel', brand: 'Dakon', kw: 22, floor: 'PP' }])])] }),
    customer({ firstName: 'Eva', lastName: 'Svobodová', gender: 'f', phones: ['731 209 554'], delivery: 'email', email: 'eva.svobodova@seznam.cz',
      objects: [object(addr('Uničovská 12', 'Šternberk', '785 01', 'Olomouc', 49.7321, 17.2958), [chimney('Komín 1', 'plyn', lastYear(-12), [{ kind: 'kotel', brand: 'Thermona', kw: 24, floor: '1. NP' }])])] }),
    customer({ firstName: 'Jiří', lastName: 'Malý', gender: 'm', phones: ['605 330 871'], delivery: 'tisk',
      objects: [object(addr('Medlov 54', 'Medlov', '783 91', 'Olomouc', 49.7955, 17.0632), [chimney('Komín 1', 'tuha', lastYear(55), [{ kind: 'krbová kamna', brand: 'Haas+Sohn', kw: 7, floor: '1. NP' }])])] }),
    customer({ firstName: 'Lenka', lastName: 'Králová', gender: 'f', phones: ['720 115 446'], delivery: 'whatsapp',
      objects: [object(addr('Lidická 21', 'Uničov', '783 91', 'Olomouc', 49.7738, 17.1245), [chimney('Komín 1', 'plyn', lastYear(20), [{ kind: 'kotel', brand: 'Baxi', kw: 24, floor: '1. NP' }])])] }),
  ];

  const ap = (cust, date, block, time, order, extra = {}) => ({
    id: uid('a_'), date, block, time, order, customerId: cust.id, objectId: cust.objects[0].id,
    kind: 'kontrola', status: 'planned', prefer: '', note: '', trial: true, ...extra,
  });

  const appointments = [
    ap(c[0], d(0), '8–10', '08:00', 1, { prefer: 'dopoledne' }),
    ap(c[1], d(0), '8–10', '09:00', 2, { prefer: 'kdykoli' }),
    ap(c[2], d(0), '10–12', '10:30', 3, { prefer: 'dopoledne' }),
    ap(c[3], d(0), '10–12', '11:15', 4, { prefer: 'kdykoli', note: 'Nový zákazník – kondenzační kotel' }),
    ap(c[4], d(0), '12–14', '14:00', 5, { prefer: 'od 14:00' }),
    ap(c[7], d(1), '8–10', '08:30', 1),
    ap(c[5], d(2), '8–10', '08:00', 1, { objectId: c[5].objects[0].id }),
    ap(c[5], d(2), '8–10', '09:00', 2, { objectId: c[5].objects[1].id }),
  ];

  const inquiries = [
    { id: uid('q_'), stage: 'open', customerId: c[6].id, objectId: c[6].objects[0].id, kind: 'ostatni', prefer: 'odpoledne', note: 'Vložkování – nabídka N2026/03 odeslána, čeká na rozhodnutí', desiredDate: '', createdAt: new Date().toISOString(), trial: true },
    { id: uid('q_'), stage: 'open', customerId: c[3].id, objectId: c[3].objects[0].id, kind: 'kontrola', prefer: 'kdykoli', note: 'Volala, chce i prohlídku kamerou', desiredDate: d(9), createdAt: new Date().toISOString(), trial: true },
    { id: uid('q_'), stage: 'waiting', customerId: c[4].id, objectId: c[4].objects[0].id, kind: 'kontrola', prefer: 'od 14:00', note: 'Pozvánka na výjezd Hlubočky', desiredDate: d(7), invitedAt: new Date().toISOString(), createdAt: new Date().toISOString(), trial: true },
  ];
  const events = [
    { id: uid('t_'), kind: 'vyjezd', date: d(7), type: 'okruzni', villages: ['Hlubočky', 'Velká Bystřice'], title: 'Okružní výjezd', trial: true, createdAt: new Date().toISOString() },
    { id: uid('e_'), kind: 'task', date: d(0), title: 'Zavolat na obec Hnojice kvůli dni v obci', done: false, trial: true, createdAt: new Date().toISOString() },
    { id: uid('e_'), kind: 'event', date: d(3), time: '09:00', title: 'Servis auta', note: '', trial: true, createdAt: new Date().toISOString() },
  ];
  return { customers: c, appointments, inquiries, events };
}

export async function seedIfEmpty() {
  const existing = await all('customers');
  if (existing.length) { await markDemo(existing); return false; }
  const { customers, appointments, inquiries, events } = buildSeed();
  await putMany('customers', customers);
  await putMany('appointments', appointments);
  await putMany('inquiries', inquiries);
  await putMany('events', events);
  return true;
}

// Obnoví zkušební data (smaže jen zkušební záznamy)
export const DATA_STORES = ['customers', 'appointments', 'documents', 'invoices', 'offers', 'expenses', 'events', 'inquiries'];

export async function removeTrialData() {
  for (const store of DATA_STORES) {
    for (const item of await all(store)) if (item.trial) await del(store, item.id);
  }
  for (const c of await all('counters')) if (c.key.startsWith('trial:')) await del('counters', c.key);
}

export async function resetTrialData() {
  // vlastní zákazníky (zadané ručně) ponechá, smaže jen ukázkové a všechny zkoušky
  for (const store of DATA_STORES) {
    for (const item of await all(store)) if (item.trial && (store !== 'customers' || item.demo !== false)) await del(store, item.id);
  }
  for (const c of await all('counters')) if (c.key.startsWith('trial:')) await del('counters', c.key);
  const { customers, appointments, inquiries, events } = buildSeed();
  await putMany('customers', customers);
  await putMany('appointments', appointments);
  await putMany('inquiries', inquiries);
  await putMany('events', events);
}

// Starší instalace: ukázkoví zákazníci vznikli najednou při prvním spuštění → označit je jako ukázkové
async function markDemo(customers) {
  const trial = customers.filter((c) => c.trial && c.demo === undefined);
  if (!trial.length) return;
  const t0 = Math.min(...trial.map((c) => new Date(c.createdAt).getTime()));
  await putMany('customers', trial.map((c) => ({ ...c, demo: new Date(c.createdAt).getTime() - t0 < 60000 })));
}

// Zákazníci, které zadal sám ve zkušebním režimu (ne ukázkoví)
export async function ownTrialCustomers() { return (await all('customers')).filter((c) => c.trial && !c.demo); }

// Přepnutí na ostrý provoz: smaže zkoušky (návštěvy, dokumenty, faktury, nabídky, náklady, plány) a ukázkové zákazníky;
// vlastní zákazníky může ponechat. Číselné řady začnou od 1.
export async function goLive({ keepOwn = true } = {}) {
  for (const store of DATA_STORES.filter((x) => x !== 'customers')) {
    for (const item of await all(store)) if (item.trial) await del(store, item.id);
  }
  for (const c of await all('customers')) {
    if (!c.trial) continue;
    if (keepOwn && !c.demo) await putMany('customers', [{ ...c, trial: false }]);
    else await del('customers', c.id);
  }
  for (const c of await all('counters')) if (c.key.startsWith('trial:')) await del('counters', c.key);
  for (const t of await all('trash')) await del('trash', t.id);
}
