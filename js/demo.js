// Velká ukázková data: půl roku provozu (zákazníci, návštěvy, zprávy, doklady, protokoly,
// faktury, nabídky, náklady, poptávky, výjezdy). Vše je zkušební – „Přepnout na ostrý provoz“ to smaže.
import { putMany, all, del, uid } from './db.js';
import { isoDate } from './ui.js';
import { emptyProtocol } from './protocol.js';

// --- náhoda se stálým semínkem (stejná data při každém spuštění) ---
let seed = 20261117;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const pad = (n, l = 2) => String(n).padStart(l, '0');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

// obec, PSČ, okres, zem. šířka, délka, velikost (váha), oblast (pro trasy), ulice (města)
const PLACES = [
  ['Šternberk', '785 01', 'Olomouc', 49.7300, 17.2990, 14, 'S', ['Olomoucká', 'Uničovská', 'Komenského', 'Hlavní náměstí', 'Lidická', 'Dvorská', 'Opavská', 'Nádražní', 'Jívavská', 'Sadová', 'Na Valech', 'Zahradní']],
  ['Hnojice', '785 01', 'Olomouc', 49.7190, 17.2265, 3, 'S'], ['Babice', '785 01', 'Olomouc', 49.7105, 17.2686, 2, 'S'],
  ['Lipina', '785 01', 'Olomouc', 49.7147, 17.2427, 2, 'S'], ['Mladějovice', '785 01', 'Olomouc', 49.7535, 17.2228, 2, 'S'],
  ['Komárov', '785 01', 'Olomouc', 49.7616, 17.3175, 2, 'S'], ['Lužice', '785 01', 'Olomouc', 49.7023, 17.2475, 2, 'S'],
  ['Řídeč', '785 01', 'Olomouc', 49.7728, 17.2668, 1, 'S'], ['Těšíkov', '785 01', 'Olomouc', 49.7480, 17.2790, 1, 'S'],
  ['Horní Loděnice', '783 05', 'Olomouc', 49.7808, 17.3839, 2, 'V'], ['Moravský Beroun', '793 05', 'Bruntál', 49.7937, 17.4423, 4, 'V'],
  ['Domašov nad Bystřicí', '783 06', 'Olomouc', 49.7436, 17.4433, 2, 'V'], ['Jívová', '783 16', 'Olomouc', 49.7085, 17.4565, 2, 'V'],
  ['Uničov', '783 91', 'Olomouc', 49.7710, 17.1210, 10, 'U', ['Pionýrů', 'Lidická', 'Gen. Svobody', 'Haškova', 'Moravská', 'Šternberská', 'Palackého', 'Nádražní', 'Dukelská', 'Litovelská']],
  ['Medlov', '783 91', 'Olomouc', 49.7960, 17.0610, 2, 'U'], ['Troubelice', '783 83', 'Olomouc', 49.8183, 17.0786, 3, 'U'],
  ['Šumvald', '783 85', 'Olomouc', 49.8302, 17.1325, 3, 'U'], ['Dlouhá Loučka', '783 86', 'Olomouc', 49.8259, 17.1820, 3, 'U'],
  ['Paseka', '783 97', 'Olomouc', 49.7958, 17.2215, 2, 'U'], ['Újezd', '783 96', 'Olomouc', 49.7621, 17.1820, 2, 'U'],
  ['Moravská Huzová', '785 01', 'Olomouc', 49.7390, 17.1920, 1, 'U'],
  ['Litovel', '784 01', 'Olomouc', 49.7012, 17.0760, 7, 'L', ['Nám. Přemysla Otakara', 'Palackého', 'Uničovská', 'Olomoucká', 'Husova', 'Nasobůrky', 'Smetanova']],
  ['Červenka', '784 01', 'Olomouc', 49.7194, 17.0742, 2, 'L'], ['Mladeč', '783 21', 'Olomouc', 49.7044, 17.0189, 1, 'L'],
  ['Náklo', '783 32', 'Olomouc', 49.6553, 17.1270, 2, 'L'], ['Žerotín', '783 25', 'Olomouc', 49.7243, 17.1820, 1, 'L'],
  ['Štěpánov', '783 13', 'Olomouc', 49.6847, 17.2214, 3, 'O'], ['Liboš', '783 13', 'Olomouc', 49.6978, 17.2063, 1, 'O'],
  ['Bohuňovice', '783 14', 'Olomouc', 49.6919, 17.2827, 3, 'O'], ['Dolany', '783 16', 'Olomouc', 49.6537, 17.3187, 2, 'O'],
  ['Hlubočky', '783 61', 'Olomouc', 49.6268, 17.3954, 3, 'O'], ['Velká Bystřice', '783 53', 'Olomouc', 49.5943, 17.3640, 3, 'O', ['Zámecké náměstí', 'Svatoplukova', 'Nádražní', 'Na Letné', 'Hlavní']],
  ['Olomouc', '779 00', 'Olomouc', 49.5938, 17.2509, 3, 'O', ['Masarykova třída', 'Dlouhá', 'Wellnerova', 'Horní lán', 'Tř. Svornosti', 'Zikova']],
];
const AREAS = { S: ['S'], V: ['V', 'S'], U: ['U'], L: ['L', 'U'], O: ['O'] };

const MEN = ['Jan', 'Petr', 'Josef', 'Pavel', 'Martin', 'Tomáš', 'Jiří', 'Lukáš', 'Michal', 'David', 'Jaroslav', 'Milan', 'Zdeněk', 'Karel', 'Miroslav', 'František', 'Radek', 'Ondřej', 'Vladimír', 'Stanislav', 'Antonín', 'Roman', 'Libor', 'Aleš'];
const WOMEN = ['Marie', 'Jana', 'Eva', 'Hana', 'Anna', 'Lenka', 'Kateřina', 'Lucie', 'Věra', 'Alena', 'Petra', 'Jaroslava', 'Ludmila', 'Helena', 'Martina', 'Zdeňka', 'Ivana', 'Monika', 'Jitka', 'Dana', 'Libuše', 'Markéta'];
const SURNAMES = [['Novák', 'Nováková'], ['Svoboda', 'Svobodová'], ['Dvořák', 'Dvořáková'], ['Černý', 'Černá'], ['Procházka', 'Procházková'], ['Kučera', 'Kučerová'], ['Veselý', 'Veselá'], ['Horák', 'Horáková'], ['Němec', 'Němcová'], ['Marek', 'Marková'], ['Pospíšil', 'Pospíšilová'], ['Pokorný', 'Pokorná'], ['Hájek', 'Hájková'], ['Král', 'Králová'], ['Jelínek', 'Jelínková'], ['Růžička', 'Růžičková'], ['Beneš', 'Benešová'], ['Fiala', 'Fialová'], ['Sedláček', 'Sedláčková'], ['Doležal', 'Doležalová'], ['Zeman', 'Zemanová'], ['Kolář', 'Kolářová'], ['Navrátil', 'Navrátilová'], ['Čermák', 'Čermáková'], ['Vaněk', 'Vaňková'], ['Urban', 'Urbanová'], ['Blažek', 'Blažková'], ['Kříž', 'Křížová'], ['Kovář', 'Kovářová'], ['Bartoš', 'Bartošová'], ['Vlček', 'Vlčková'], ['Polák', 'Poláková'], ['Musil', 'Musilová'], ['Kopecký', 'Kopecká'], ['Šimek', 'Šimková'], ['Konečný', 'Konečná'], ['Malý', 'Malá'], ['Holub', 'Holubová'], ['Štěpánek', 'Štěpánková'], ['Kadlec', 'Kadlecová'], ['Dostál', 'Dostálová'], ['Soukup', 'Soukupová'], ['Šindelář', 'Šindelářová'], ['Zbořil', 'Zbořilová'], ['Hanák', 'Hanáková'], ['Vybíral', 'Vybíralová'], ['Coufal', 'Coufalová'], ['Hradil', 'Hradilová'], ['Grygar', 'Grygarová'], ['Zapletal', 'Zapletalová'], ['Kubíček', 'Kubíčková'], ['Spáčil', 'Spáčilová'], ['Ondráček', 'Ondráčková'], ['Hrubý', 'Hrubá'], ['Machala', 'Machalová'], ['Krejčí', 'Krejčí']];
const FIRMS = ['Pekárna U Lípy s.r.o.', 'Autoservis Vrba s.r.o.', 'Truhlářství Sedlák', 'Penzion Pod Hradem', 'Zemědělské družstvo Haná', 'Restaurace U Zlatého kohouta', 'Stavebniny Morava s.r.o.', 'Kovovýroba Dostál s.r.o.'];
const SVJ = ['SVJ Olomoucká 12', 'SVJ Nádražní 8', 'Bytové družstvo Sadová'];

const BOILERS_SOLID = [['Viadrus Hercules U22', 20], ['Atmos DC25S', 25], ['Dakon DOR 24', 24], ['Opop H424', 24], ['Benekov C16', 16], ['Verner A251', 25], ['Ling Ekoline 20', 20], ['Slokov SL 24', 24]];
const BOILERS_GAS = [['Baxi Luna 3', 24], ['Junkers Ceraclass', 24], ['Protherm Panther', 25], ['Thermona Therm 24', 24], ['Buderus Logamax', 24], ['Ariston Genus', 24]];
const BOILERS_COND = [['Vaillant ecoTEC plus', 20], ['Viessmann Vitodens 100', 19], ['Bosch Condens 2300', 24], ['Baxi Duo-tec', 24], ['Protherm Lynx Condens', 25], ['Geminox THRs', 18]];
const STOVES = [['krbová kamna', 'Romotop Nordic', 8], ['krbová kamna', 'Haas+Sohn', 7], ['krbová vložka', 'Kobok', 10], ['krbová vložka', 'Romotop Impression', 9], ['kachlová kamna', '', 6], ['sporák', 'Mora', 7], ['krbová kamna', 'Thorma Lugo', 8], ['lokální kamna', 'Karkulka', 5]];

const DEFECT_RECS = { jadro: 'vlozkovani', dehet: 'dehetstroj', dvirkanetesna: 'dvirkautesneni', dvirkaposkozena: 'dvirkavymena', kourstav: 'kourovodvymena', plast: 'plastnad', vyska: 'nadstavit', horlave: 'izolace', oxidace: 'prevlozkovani' };

function phone() { return `${pick(['602', '603', '604', '605', '606', '608', '720', '721', '724', '731', '732', '736', '737', '739', '774', '775', '777', '728'])} ${int(100, 999)} ${int(100, 999)}`; }
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function makeChimney(fuel, condensing, n) {
  let appliances;
  if (fuel === 'plyn') { const [brand, kw] = pick(condensing ? BOILERS_COND : BOILERS_GAS); appliances = [{ kind: 'kotel', brand, kw, floor: '1. NP', placement: [pick(['kotelna', 'kuchyň', 'technická místnost'])] }]; }
  else if (fuel === 'kapalna') appliances = [{ kind: 'kotel', brand: 'Viessmann Vitola', kw: 22, floor: 'PP', placement: ['kotelna'] }];
  else if (n === 1 && chance(0.55)) { const [brand, kw] = pick(BOILERS_SOLID); appliances = [{ kind: 'kotel', brand, kw, floor: chance(0.6) ? 'PP' : '1. NP', placement: ['kotelna'] }]; }
  else { const [kind, brand, kw] = pick(STOVES); appliances = [{ kind, brand, kw, floor: '1. NP', placement: ['obytná místnost'] }]; }
  appliances.forEach((a) => { a.flue = { material: condensing ? 'plast' : pick(['ocel', 'ocel', 'nerez']), materialOther: '', diameter: condensing ? '80' : String(pick([120, 130, 150, 160])), length: String(pick([0.5, 1, 1, 1.5, 2])).replace('.', ','), elbows: { e90: int(0, 2), e45: int(0, 1), flex: 0, none: false } }; });
  return {
    id: uid('k_'), label: `Komín ${n}`, fuel, condensing: !!condensing, lastCheck: null, appliances,
    body: condensing ? ['systémové'] : fuel === 'plyn' ? ['vložkované'] : [pick(['zděné', 'zděné', 'vložkované', 'systémové'])],
    liner: { material: condensing ? 'plast' : fuel === 'plyn' ? 'nerez' : pick(['není', 'keramika', 'nerez', 'není']), materialOther: '', diameter: condensing ? '80' : String(pick([140, 150, 160, 180, 200])) },
    height: String(pick([6, 6.5, 7, 7.5, 8, 8.5, 9, 10])).replace('.', ','), revisionNo: chance(0.5) ? `${int(10, 250)}/${int(2015, 2025)}` : '',
  };
}

function makeCustomer(place, kind = 'osoba') {
  const [city, zip, district, lat, lng, , area, streets] = place;
  const street = streets ? `${pick(streets)} ${int(1, 80)}` : `${city} ${int(1, 220)}`;
  const address = { street, city, zip, district, lat: +(lat + (rnd() - 0.5) * 0.012).toFixed(5), lng: +(lng + (rnd() - 0.5) * 0.018).toFixed(5) };
  const c = { id: uid('c_'), type: kind, phones: [phone()], email: '', delivery: 'whatsapp', tags: [], source: pick(['', '', '', 'doporučení', 'web', 'den v obci', 'leták']), note: '', isNew: false, archived: false, ico: '', createdAt: new Date().toISOString(), trial: true, demo: true, area };
  if (kind === 'osoba') {
    const female = chance(0.42); const [m, f] = pick(SURNAMES);
    Object.assign(c, { gender: female ? 'f' : 'm', firstName: female ? pick(WOMEN) : pick(MEN), lastName: female ? f : m });
    c.name = `${c.firstName} ${c.lastName}`;
    if (chance(0.35)) { c.email = `${ascii(c.lastName)}.${ascii(c.firstName)[0]}${int(1, 99)}@${pick(['seznam.cz', 'email.cz', 'gmail.com', 'centrum.cz'])}`; c.delivery = 'email'; } else if (chance(0.12)) c.delivery = 'tisk';
    if (chance(0.08)) c.phones.push(phone());
    if (chance(0.1)) c.note = pick(['Pes na dvoře – zavolat před příjezdem.', 'Odpoledne až po 14:00.', 'Klíče u sousedky v č. p. vedle.', 'Nedoslýchá – volat hlasitě.', 'Platí vždy hotově.', 'Parkovat před garáží.']);
    const solid = chance(0.55); const condensing = !solid && chance(0.38);
    const chimneys = [makeChimney(solid ? 'tuha' : chance(0.97) ? 'plyn' : 'kapalna', condensing, 1)];
    if (chance(solid ? 0.35 : 0.25)) chimneys.push(makeChimney('tuha', false, 2));
    c.objects = [{ id: uid('o_'), type: 'RD', address, chimneys }];
  } else {
    c.name = kind === 'firma' ? pick(FIRMS) : kind === 'svj' ? pick(SVJ) : `Obec ${city}`;
    c.ico = String(int(10000000, 99999999)); c.email = kind === 'obec' ? `obec@${ascii(city).replace(/\s+/g, '')}.cz` : `info@${ascii(c.name).replace(/[^a-z]/g, '').slice(0, 12)}.cz`; c.delivery = 'email';
    const objects = kind === 'obec'
      ? [['obecní úřad', 'plyn'], ['hasičská zbrojnice', 'tuha'], ['mateřská škola', 'plyn']].slice(0, int(2, 3)).map(([what, fuel]) => ({ id: uid('o_'), type: 'jiný', address: { ...address, street: `${city} ${int(1, 150)} – ${what}` }, chimneys: [makeChimney(fuel, fuel === 'plyn' && chance(0.5), 1)] }))
      : [{ id: uid('o_'), type: kind === 'svj' ? 'BD' : 'jiný', address, chimneys: Array.from({ length: kind === 'svj' ? int(3, 6) : int(1, 2) }, (_, i) => makeChimney(kind === 'svj' ? 'plyn' : pick(['plyn', 'tuha']), kind === 'svj' && chance(0.5), i + 1)) }];
    c.objects = objects;
  }
  return c;
}

function applianceDoc(a) {
  return { kind: a.kind, kindOther: '', brand: a.brand || '', kw: a.kw || '', floor: /pp/i.test(a.floor || '') ? 'PP' : 'NP', placement: a.placement || [], placementOther: '', flue: structuredClone(a.flue) };
}

function chimneyDoc(k) {
  const defects = []; let conclusion = 'vyhovuje';
  if (chance(k.fuel === 'tuha' ? 0.24 : 0.1)) {
    defects.push(pick(k.fuel === 'tuha' ? ['dehet', 'jadro', 'dvirkanetesna', 'plast', 'kourstav', 'horlave', 'vyska'] : ['oxidace', 'kourstav', 'dvirkanetesna', 'napojeni']));
    if (chance(0.25)) defects.push(pick(['pristupkomin', 'puda', 'dvirkaposkozena']));
    conclusion = chance(0.12) ? 'nevyhovuje' : 'poodstraneni';
  }
  const uniq = [...new Set(defects)];
  return {
    id: k.id, label: k.label, fuel: k.fuel, ut: true, condensing: !!k.condensing, appliances: k.appliances.map(applianceDoc),
    body: k.body, liner: k.liner, revisionNo: k.revisionNo, revisionMissing: !k.revisionNo, height: k.height,
    fixed: { noDefects: true, camera: false, text: '' }, defects: uniq, defectOther: '',
    deadline: uniq.length ? (conclusion === 'nevyhovuje' ? { mode: 'neprodlene', date: '' } : { mode: 'nestanoven', date: '' }) : { mode: '', date: '' },
    recs: uniq.map((d) => DEFECT_RECS[d]).filter(Boolean), recOther: '', conclusion,
  };
}

export async function fillDemo(today = new Date()) {
  seed = 20261117;
  const T0 = new Date(today); T0.setHours(0, 0, 0, 0);
  const start = addDays(T0, -183);
  const out = { customers: [], appointments: [], documents: [], invoices: [], offers: [], expenses: [], events: [], inquiries: [] };
  const counters = new Map();
  const visitNo = (d) => { const k = `trial:visit:${d.getFullYear()}-${pad(d.getMonth() + 1)}`; const n = (counters.get(k) || 0) + 1; counters.set(k, n); return { no: `${n}/${d.getMonth() + 1}/${d.getFullYear()}`, vs: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(n, 3)}` }; };
  const invNo = (d) => { const k = `trial:invoice:${d.getFullYear()}`; const n = (counters.get(k) || 0) + 1; counters.set(k, n); return { no: `${d.getFullYear()}/${pad(n)}`, vs: `${d.getFullYear()}${pad(n)}` }; };
  const offNo = (d) => { const k = `trial:offer:${d.getFullYear()}`; const n = (counters.get(k) || 0) + 1; counters.set(k, n); return `N${d.getFullYear()}/${pad(n)}`; };

  // --- zákazníci ---
  const weighted = PLACES.flatMap((p) => Array(p[5]).fill(p));
  for (let i = 0; i < 640; i++) out.customers.push(makeCustomer(pick(weighted)));
  for (const p of PLACES.filter((x) => x[5] >= 2 && x[0] !== 'Olomouc').slice(0, 9)) out.customers.push(makeCustomer(p, 'obec'));
  FIRMS.forEach(() => out.customers.push(makeCustomer(pick(PLACES.filter((x) => x[7])), 'firma')));
  SVJ.forEach(() => out.customers.push(makeCustomer(pick(PLACES.filter((x) => x[7])), 'svj')));
  const byArea = {};
  for (const c of out.customers) (byArea[c.area] ||= []).push(c);
  const visited = new Set();

  // --- pracovní dny: návštěvy, zprávy, platby ---
  const s = { cena: [450, 500, 600] };
  const docsForInvoice = new Map(); // customerId → [doc]
  for (let d = new Date(start); d < T0; d = addDays(d, 1)) {
    const dow = d.getDay();
    if (dow === 0 || (dow === 6 && !chance(0.15))) continue;
    if (d.getMonth() === 7 && d.getDate() >= 3 && d.getDate() <= 16) continue; // dovolená v srpnu
    if (chance(0.06)) continue; // volno / nemoc / úřady
    const area = pick(Object.keys(AREAS));
    const pool = AREAS[area].flatMap((a) => byArea[a] || []).filter((c) => !visited.has(c.id));
    const count = Math.min(pool.length, dow === 6 ? int(1, 3) : int(2, 6));
    const isTrip = chance(0.18);
    if (isTrip) { const villages = [...new Set(pool.slice(0, 6).map((c) => c.objects[0].address.city))].slice(0, 2); out.events.push({ id: uid('t_'), kind: 'vyjezd', date: isoDate(d), type: villages.length === 1 ? 'obec' : 'okruzni', villages, note: '', title: '', trial: true, createdAt: d.toISOString() }); }
    let time = at(d, 8, pick([0, 0, 30]));
    for (let i = 0; i < count; i++) {
      const c = pool.splice(int(0, pool.length - 1), 1)[0];
      visited.add(c.id);
      const objs = c.type === 'obec' ? c.objects : [c.objects[0]];
      for (const o of objs) {
        const block = ['8–10', '10–12', '12–14', '14–16', '16–18'][Math.min(4, Math.floor((time.getHours() - 8) / 2))];
        const missed = c.type === 'osoba' && chance(0.035);
        const apt = { id: uid('a_'), date: isoDate(d), block, time: `${pad(time.getHours())}:${pad(time.getMinutes())}`, order: i + 1, customerId: c.id, objectId: o.id, kind: 'kontrola', status: missed ? 'missed' : 'done', prefer: pick(['', 'dopoledne', 'odpoledne', 'kdykoli']), note: '', trial: true };
        out.appointments.push(apt);
        if (missed) { out.inquiries.push({ id: uid('q_'), stage: 'open', customerId: c.id, objectId: o.id, kind: 'kontrola', prefer: '', note: 'Nezastižen – domluvit nový termín', desiredDate: '', fromAppointment: apt.id, createdAt: d.toISOString(), trial: true }); time = new Date(time.getTime() + 25 * 60000); continue; }
        const minutes = int(5, 10) + o.chimneys.reduce((m, k) => m + (k.fuel === 'tuha' ? int(18, 32) : k.condensing ? int(16, 26) : int(12, 22)), 0);
        const created = new Date(time.getTime() + int(0, 8) * 60000);
        const finished = new Date(created.getTime() + minutes * 60000);
        const kind = c.type === 'osoba' && chance(0.035) && o.chimneys[0].fuel === 'plyn' ? 'protokol' : 'zprava';
        const num = visitNo(d);
        const price = c.type === 'osoba' ? pick([450, 500, 500, 500, 600]) : 600;
        const method = c.type !== 'osoba' ? 'faktura' : chance(0.52) ? 'hotove' : chance(0.9) ? 'qr' : 'faktura';
        const doc = {
          id: uid('d_'), status: 'final', kind, customerId: c.id, objectId: o.id, appointmentId: apt.id, date: isoDate(d),
          createdAt: created.toISOString(), finalizedAt: finished.toISOString(), trial: true, sameAsLast: false, basedOn: null,
          chimneys: kind === 'zprava' ? o.chimneys.map(chimneyDoc) : [], note: '', purpose: '',
          payment: { items: kind === 'protokol' ? [{ id: uid('i_'), label: 'Příprava revize spalinové cesty', qty: 1, unit: 'ks', price: 1500 }] : [{ id: uid('i_'), label: 'Kontrola a čištění spalinové cesty', qty: o.chimneys.length, unit: 'ks', price }], method, paid: method !== 'faktura' },
          signature: null, no: num.no, vs: num.vs, customerName: c.name,
          sent: [{ how: c.delivery, at: finished.toISOString() }],
        };
        if (kind === 'protokol') {
          const k = o.chimneys[0];
          doc.protocolChimneyId = k.id;
          doc.protocol = { ...emptyProtocol(k, ''), purpose: pick(['novy', 'kolaudace', 'vyvlozkovani']), buildHeight: k.height, liner: pick(['nerezová', 'plastová']), cleaning: ['ze střechy'], openingPlace: 'v 1. NP', contractor: 'odborná firma', contractorName: 'Topenářství Hanák', roof: 'sedlová', airSupply: 'okny', flue: { ...emptyProtocol(k, '').flue, material: 'nerezový' } };
          doc.title = 'protokol k revizi';
        } else doc.title = `${o.chimneys.length} ${o.chimneys.length === 1 ? 'komín' : o.chimneys.length < 5 ? 'komíny' : 'komínů'}`;
        out.documents.push(doc);
        if (method === 'faktura') (docsForInvoice.get(c.id) || docsForInvoice.set(c.id, []).get(c.id)).push(doc);
        // karta zákazníka: poslední kontrola
        if (kind === 'zprava') o.chimneys.forEach((k) => { k.lastCheck = isoDate(d); });
        else o.chimneys[0].revisionPrepared = isoDate(d);
        time = new Date(finished.getTime() + int(10, 30) * 60000);
      }
    }
    // frézování / samostatný doklad – občas odpoledne
    if (chance(0.13)) {
      const c = pick(out.customers.filter((x) => x.type === 'osoba' && x.objects[0].chimneys[0].fuel === 'tuha'));
      const m = int(6, 12); const created = at(d, 15, 0); const num = visitNo(d);
      out.documents.push({ id: uid('d_'), status: 'final', kind: 'doklad', customerId: c.id, objectId: c.objects[0].id, appointmentId: null, date: isoDate(d), createdAt: created.toISOString(), finalizedAt: new Date(created.getTime() + int(70, 130) * 60000).toISOString(), trial: true, chimneys: [], note: '', purpose: 'frézování komínového průduchu', payment: { items: [{ id: uid('i_'), label: 'Frézování komínového průduchu', qty: m, unit: 'm', price: 500 }, { id: uid('i_'), label: 'Doprava', qty: int(10, 40), unit: 'km', price: 7 }], method: chance(0.5) ? 'hotove' : 'qr', paid: true }, signature: null, no: num.no, vs: num.vs, customerName: c.name, title: 'frézování komínového průduchu' });
    }
    // tankování
    if (dow === 1 || (dow === 4 && chance(0.6))) out.expenses.push({ id: uid('x_'), date: isoDate(d), amount: int(1150, 1950), category: 'tankovani', note: pick(['Benzina Šternberk', 'OMV Uničov', 'Shell Olomouc', 'Orlen Litovel']), photo: null, jobRef: null, returned: false, trial: true, createdAt: d.toISOString() });
  }

  // --- faktury (obce, firmy, SVJ a pár osob) ---
  for (const [customerId, docs] of docsForInvoice) {
    const d = new Date(`${docs.at(-1).date}T12:00:00`); const num = invNo(d);
    const due = addDays(d, 14);
    const items = docs.flatMap((x) => x.payment.items.map((i) => ({ label: `${i.label} – ${out.customers.find((c) => c.id === customerId).objects.find((o) => o.id === x.objectId).address.street}`, qty: i.qty, unit: i.unit, price: i.price })));
    const total = items.reduce((a, i) => a + i.qty * i.price, 0);
    const daysAgo = (T0 - d) / 86400000;
    const status = daysAgo < 10 ? 'open' : chance(0.88) ? 'paid' : 'open';
    const inv = { id: uid('f_'), no: num.no, vs: num.vs, date: isoDate(d), due: isoDate(due), customerId, items, documentIds: docs.map((x) => x.id), note: '', total, status, paidAt: status === 'paid' ? addDays(d, int(3, 20)).toISOString() : null, reminders: [], trial: true, createdAt: d.toISOString() };
    if (status === 'open' && due < T0) inv.reminders.push({ level: 1, at: due.toISOString() });
    out.invoices.push(inv);
    docs.forEach((x) => { x.invoiceId = inv.id; x.invoiceNo = inv.no; });
  }

  // --- nabídky (vložkování, frézování, opravy) a materiál ---
  const OFFERS = [
    ['Vložkování komínu nerezovou vložkou', [['prace', 'Montáž nerezové vložky', 1, 'ks', 6500], ['material', 'Nerezová vložka Ø 150, 0,6 mm', 9, 'm', 890], ['material', 'Komínová dvířka s rámem', 1, 'ks', 1250], ['material', 'Ukončovací kus s kloboukem', 1, 'ks', 1100], ['doprava', 'Doprava', 30, 'km', 7]]],
    ['Frézování a vložkování průduchu', [['prace', 'Frézování komínového průduchu', 9, 'm', 500], ['prace', 'Montáž vložky', 1, 'ks', 5500], ['material', 'Nerezová vložka Ø 160', 9, 'm', 940], ['doprava', 'Doprava', 25, 'km', 7]]],
    ['Oprava nadstřešní části komínu', [['prace', 'Oprava pláště komína – nadstřešní část', 1, 'ks', 7800], ['material', 'Komínová stříška', 1, 'ks', 1650], ['material', 'Cihly, malta, oplechování', 1, 'kpl', 2400]]],
    ['Strojní odstranění dehtu', [['prace', 'Strojní odstranění dehtu', 8, 'm', 450], ['prace', 'Prohlídka kamerou', 1, 'ks', 900]]],
    ['Výměna revizních dvířek', [['prace', 'Výměna revizních dvířek', 2, 'ks', 900], ['material', 'Komínová dvířka 150×250', 2, 'ks', 640]]],
  ];
  const offerDates = Array.from({ length: 16 }, () => int(5, 180)).sort((a, b) => a - b);
  for (let i = 0; i < 16; i++) {
    const d = addDays(start, offerDates[i]); const c = pick(out.customers.filter((x) => x.type === 'osoba'));
    const [subject, rows] = pick(OFFERS);
    const status = (T0 - d) / 86400000 < 12 ? pick(['draft', 'sent', 'sent']) : pick(['accepted', 'accepted', 'sent', 'rejected']);
    const o = { id: uid('n_'), no: status === 'draft' ? null : offNo(d), date: isoDate(d), validUntil: isoDate(addDays(d, 30)), status, subject, description: `${subject} – ${c.objects[0].address.street}, ${c.objects[0].address.city}.`, customerId: c.id, objectId: c.objects[0].id, items: rows.map(([group, label, qty, unit, price]) => ({ id: uid('i_'), group, label, qty, unit, price })), markupPct: 10, photos: [], trial: true, createdAt: d.toISOString(), sentAt: status !== 'draft' ? d.toISOString() : undefined };
    out.offers.push(o);
    if (status === 'accepted') {
      const jd = addDays(d, int(7, 25)); if (jd >= T0) continue;
      const nakup = o.items.filter((x) => x.group === 'material').reduce((a, x) => a + x.qty * x.price, 0);
      if (nakup) out.expenses.push({ id: uid('x_'), date: isoDate(addDays(jd, -3)), amount: nakup, category: 'material', note: `Materiál – ${subject.toLowerCase()} (${c.lastName})`, photo: null, jobRef: o.id, returned: false, trial: true, createdAt: jd.toISOString() });
      const num = invNo(jd); const items = o.items.map((x) => ({ label: x.label, qty: x.qty, unit: x.unit, price: x.group === 'material' ? Math.round(x.price * 1.1) : x.price }));
      const total = items.reduce((a, x) => a + x.qty * x.price, 0);
      out.invoices.push({ id: uid('f_'), no: num.no, vs: num.vs, date: isoDate(jd), due: isoDate(addDays(jd, 14)), customerId: c.id, items, documentIds: [], note: `Dle nabídky ${o.no}`, total, status: (T0 - jd) / 86400000 < 8 ? 'open' : 'paid', paidAt: (T0 - jd) / 86400000 < 8 ? null : addDays(jd, int(2, 12)).toISOString(), reminders: [], trial: true, createdAt: jd.toISOString() });
    }
  }
  out.invoices.sort((a, b) => a.date.localeCompare(b.date));
  // přečíslovat faktury podle data
  out.invoices.forEach((inv, i) => { const y = inv.date.slice(0, 4); inv.no = `${y}/${pad(i + 1)}`; inv.vs = `${y}${pad(i + 1)}`; out.documents.filter((x) => x.invoiceId === inv.id).forEach((x) => { x.invoiceNo = inv.no; }); });
  counters.set(`trial:invoice:${T0.getFullYear()}`, out.invoices.length);
  const overdue = out.invoices.filter((x) => x.status === 'paid' && (T0 - new Date(x.date)) / 86400000 > 30).slice(-2);
  overdue.forEach((x) => { x.status = 'open'; x.paidAt = null; x.reminders = [{ level: 1, at: new Date(x.due).toISOString() }, { level: 2, at: addDays(new Date(x.due), 14).toISOString() }]; });

  // --- další náklady ---
  for (let m = 0; m < 6; m++) {
    const d = new Date(T0.getFullYear(), T0.getMonth() - m, 5);
    if (d < start) continue;
    out.expenses.push({ id: uid('x_'), date: isoDate(d), amount: 399, category: 'telefon', note: 'Telefon a data – měsíční tarif', photo: null, jobRef: null, returned: false, trial: true, createdAt: d.toISOString(), recurringKey: `demo-tel-${m}` });
  }
  [['pojisteni', 4860, 'Pojištění odpovědnosti – roční'], ['naradi', 3290, 'Kominické štětky a koule'], ['naradi', 12900, 'Komínová kamera'], ['naradi', 1890, 'Lano, karabiny, jištění'], ['reklama', 2450, 'Letáky A5 – 1000 ks'], ['reklama', 1200, 'Firmy.cz – profil'], ['auto', 6200, 'Zimní pneumatiky'], ['auto', 3480, 'Servis auta – olej, filtry'], ['auto', 1550, 'Dálniční známka'], ['material', 1840, 'Těsnicí šňůra, tmel, malta'], ['ostatni', 890, 'Pracovní rukavice a respirátory'], ['material', 2650, 'Komínová dvířka – zásoba']].forEach(([category, amount, note]) => {
    const d = addDays(start, int(3, 175));
    out.expenses.push({ id: uid('x_'), date: isoDate(d), amount, category, note, photo: null, jobRef: null, returned: false, trial: true, createdAt: d.toISOString() });
  });

  // --- zákazníci, kteří letos ještě nebyli: poslední kontrola před 6–18 měsíci ---
  for (const c of out.customers) {
    if (visited.has(c.id)) continue;
    const last = isoDate(addDays(start, -int(0, 210)));
    c.objects.forEach((o) => o.chimneys.forEach((k) => { k.lastCheck = last; }));
  }
  // pár nových zákazníků bez historie
  const fresh = out.customers.filter((c) => !visited.has(c.id) && c.type === 'osoba').slice(0, 14);
  fresh.forEach((c) => { c.isNew = true; c.source = pick(['web', 'doporučení', 'telefon']); c.objects.forEach((o) => o.chimneys.forEach((k) => { k.lastCheck = null; })); });

  // --- plán na další 3 týdny ---
  const due = out.customers.filter((c) => !visited.has(c.id) && !c.isNew && c.type === 'osoba');
  let di = 0;
  for (let d = new Date(T0); d < addDays(T0, 21); d = addDays(d, 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const n = (d - T0) / 86400000 < 8 ? int(4, 7) : int(1, 4);
    let time = at(d, 8, 0);
    for (let i = 0; i < n && di < due.length; i++, di++) {
      const c = due[di];
      out.appointments.push({ id: uid('a_'), date: isoDate(d), block: ['8–10', '10–12', '12–14', '14–16', '16–18'][Math.min(4, Math.floor((time.getHours() - 8) / 2))], time: chance(0.7) ? `${pad(time.getHours())}:${pad(time.getMinutes())}` : '', order: i + 1, customerId: c.id, objectId: c.objects[0].id, kind: 'kontrola', status: 'planned', prefer: pick(['', 'dopoledne', 'odpoledne', 'kdykoli', 'od 14:00']), note: '', trial: true });
      time = new Date(time.getTime() + pick([45, 60, 60, 75]) * 60000);
    }
  }
  [[3, 'obec', ['Dlouhá Loučka']], [9, 'okruzni', ['Moravský Beroun', 'Horní Loděnice']], [16, 'obec', ['Štěpánov']]].forEach(([off, type, villages]) => out.events.push({ id: uid('t_'), kind: 'vyjezd', date: isoDate(addDays(T0, off)), type, villages, note: '', title: '', trial: true, createdAt: T0.toISOString() }));
  out.events.forEach((e) => { if (e.kind === 'vyjezd') e.title = `${e.type === 'obec' ? 'Den v obci' : 'Okružní výjezd'}: ${e.villages.join(', ')}`; });
  // úkoly a události
  [[-40, 'task', 'Objednat nerezové vložky', true], [-12, 'task', 'Zavolat starostovi do Štěpánova kvůli dni v obci', true], [1, 'task', 'Vyzvednout dvířka ve stavebninách', false], [4, 'task', 'Poslat nabídku na vložkování (Kolář)', false], [6, 'event', 'STK auta', false], [13, 'event', 'Seminář CIKO komíny', false]].forEach(([off, kind, title, done]) => out.events.push({ id: uid('e_'), kind, date: isoDate(addDays(T0, off)), time: kind === 'event' ? '09:00' : undefined, title, note: '', done, trial: true, createdAt: T0.toISOString() }));

  // poptávky
  const inqPool = out.customers.filter((c) => !visited.has(c.id) && c.type === 'osoba').slice(30);
  inqPool.slice(0, 12).forEach((c, i) => out.inquiries.push({ id: uid('q_'), stage: 'open', customerId: c.id, objectId: c.objects[0].id, kind: i % 5 === 0 ? 'frezovani' : i % 7 === 0 ? 'ostatni' : 'kontrola', prefer: pick(['dopoledne', 'odpoledne', 'kdykoli', 'od 14:00', 'po 16:00']), note: pick(['', 'Volal, spěchá – topná sezóna', 'Chce i prohlídku kamerou', 'Nová krbová kamna', 'Doporučila sousedka', 'Kouří do místnosti']), desiredDate: chance(0.3) ? isoDate(addDays(T0, int(3, 20))) : '', createdAt: addDays(T0, -int(0, 14)).toISOString(), trial: true }));
  inqPool.slice(12, 19).forEach((c) => out.inquiries.push({ id: uid('q_'), stage: 'waiting', customerId: c.id, objectId: c.objects[0].id, kind: 'kontrola', prefer: '', note: 'Pozvánka na výjezd poslána', desiredDate: '', invitedAt: addDays(T0, -int(1, 5)).toISOString(), createdAt: addDays(T0, -int(5, 20)).toISOString(), trial: true }));
  inqPool.slice(19, 22).forEach((c) => out.inquiries.push({ id: uid('q_'), stage: 'lost', customerId: c.id, objectId: c.objects[0].id, kind: 'kontrola', prefer: '', note: 'Má jiného kominíka', desiredDate: '', createdAt: addDays(T0, -int(20, 60)).toISOString(), trial: true }));

  // --- uložit: nejdřív smazat dosavadní zkušební data ---
  for (const store of ['appointments', 'documents', 'invoices', 'offers', 'expenses', 'events', 'inquiries', 'customers']) {
    for (const item of await all(store)) if (item.trial && (store !== 'customers' || item.demo !== false)) await del(store, item.id);
  }
  for (const c of await all('counters')) if (c.key.startsWith('trial:')) await del('counters', c.key);
  out.customers.forEach((c) => { delete c.area; });
  for (const [store, items] of Object.entries(out)) await putMany(store, items);
  await putMany('counters', [...counters].map(([key, last]) => ({ key, last })));
  return { customers: out.customers.length, documents: out.documents.length, invoices: out.invoices.length, offers: out.offers.length, expenses: out.expenses.length, appointments: out.appointments.length, inquiries: out.inquiries.length };
}
