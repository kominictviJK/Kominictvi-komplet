// Nastavení aplikace – výchozí hodnoty podle knihy aplikace
import { get, put } from './db.js';

export const DEFAULTS = {
  firma: {
    jmeno: 'Jan Klimesch – Kominictví',
    znacka: 'Kominictví Klimesch',
    slogan: 'Kominické práce a služby se zárukou poctivé práce za férovou cenu',
    opravneni: 'živnostenské oprávnění v oboru kominictví dle zák. č. 455/1991 Sb.',
    adresa: 'Nádražní 1963/10e, 785 01 Šternberk',
    ico: '199 17 881',
    dph: 'nejsem plátce DPH',
    telefon: '702 048 741',
    email: 'KominictviJK@gmail.com',
    web: '',
    ucet: '',
  },
  cenik: {
    kontrola: [450, 500, 600],
    revize: 1500,
    frezovaniZaMetr: 500,
    kamera: 0,
    dopravaZaKm: 7,
    prirazkaMaterial: 10,
    splatnostDni: 14,
  },
  lhuty: {
    tuhaMesice: 12,
    plynMesice: 12,
    kondenzacniMesice: 24,
    oslovitMesicePredem: 3,
    pripominkaTydenPredem: true,
    pripominkaVecerHodina: 18,
    domov: 'Komenského 31, 785 01 Šternberk',
  },
  finance: {
    pausalPasmo: 1,
    upominkaDny: [0, 14],
  },
  rezim: {
    zkusebni: true,        // zkušební režim do přepnutí na ostrý provoz
    ostryOd: null,
  },
  bezpecnost: {
    zamekMinuty: 15,
  },
};

let cache = null;

export async function loadSettings() {
  const rec = await get('settings', 'app');
  cache = deepMerge(structuredClone(DEFAULTS), rec?.value || {});
  return cache;
}

export function settings() {
  if (!cache) throw new Error('Nastavení ještě není načtené');
  return cache;
}

export async function saveSettings(patch) {
  cache = deepMerge(cache || structuredClone(DEFAULTS), patch);
  await put('settings', { key: 'app', value: cache, updatedAt: new Date().toISOString() });
  return cache;
}

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
}

// Průvodce nastavením: co je hotové
export function guideSteps(s = settings()) {
  return [
    { label: 'Údaje firmy', done: !!(s.firma.jmeno && s.firma.ico && s.firma.adresa) },
    { label: 'Logo', done: true },
    { label: 'Razítko', done: !!s.firma.razitko },
    { label: 'Podpis', done: !!s.firma.podpis },
    { label: 'Číslo účtu', done: !!s.firma.ucet },
    { label: 'Ceník', done: true },
    { label: 'Pomocník Google', done: !!s.propojeni?.googleUrl },
    { label: 'Mapy.cz', done: !!s.propojeni?.mapyKey },
    { label: 'AI (Claude)', done: !!s.propojeni?.aiKey },
    { label: 'Import zákazníků', done: !!s.importHotovo },
  ];
}
