// Protokol k přípravě revize spalinové cesty (podklad pro revizní techničku)
import { label, DEFECTS, elbowsText } from './catalog.js';
import { FUEL_LABEL } from './lhuty.js';

export const PURPOSES = [['novy', 'po instalaci nového spotřebiče'], ['kolaudace', 'ke kolaudaci'], ['vyvlozkovani', 'po vyvložkování']];
export const P_FLUES = ['ocelový', 'nerezový', 'plastový'];
export const P_LINERS = ['šamotová', 'nerezová', 'plastová'];
export const CLEANING = ['z půdy', 'ze střechy', 'z vybíracího otvoru', 'od spotřebiče'];
export const ROOFS = ['sedlová', 'valbová', 'jiná'];
export const CONTRACTORS = ['svépomocí', 'odborná firma'];

export function emptyProtocol(chimney, lastReportNo = '') {
  const a = chimney?.appliances?.[0] || {};
  const fl = a.flue || {};
  return {
    purpose: '', checkReportNo: lastReportNo,
    brand: a.brand || '', kw: a.kw || '', fuelText: chimney?.fuel === 'plyn' ? 'zemní plyn' : chimney?.fuel === 'tuha' ? 'dřevo' : '', placementText: [a.floor, ...(a.placement || [])].filter(Boolean).join(', '),
    flue: { material: '', diameterCm: fl.diameter ? String(Number(fl.diameter) / 10).replace('.', ',') : '', length: fl.length || '', elbows: fl.elbows ? structuredClone(fl.elbows) : { e90: 0, e45: 0, flex: 0, none: false } },
    buildHeight: '', effHeight: chimney?.height || '', linerDiameterCm: chimney?.liner?.diameter ? String(Number(chimney.liner.diameter) / 10).replace('.', ',') : '', liner: '',
    cleaning: [], openingPlace: '', plastered: true, plasteredWhere: '', manufacturer: '',
    contractor: '', contractorName: '', building: 'rodinný dům', roof: '', roofOther: '',
    safeDistance: true, safeDistanceWhere: '', airSupply: '', fan: false, fanWhat: '',
    fixedText: 'žádné', defects: [], defectOther: '', deadline: { mode: '', date: '' },
  };
}

// Řádky protokolu pro PDF (popisek → hodnota), ve stejném pořadí jako na papírovém protokolu
export function protocolRows(p, chimneyFuel) {
  const fl = p.flue || {};
  const yesNo = (v) => (v ? 'ano' : 'ne');
  return [
    ['Určení revize', label(PURPOSES, p.purpose) || '—'],
    ['Spotřebič – značka/typ', [p.brand, p.kw ? `výkon ${String(p.kw).replace('.', ',')} kW` : ''].filter(Boolean).join(' · ') || '—'],
    ['Druh paliva', p.fuelText || FUEL_LABEL[chimneyFuel] || '—'],
    ['Umístění spotřebiče/patro', p.placementText || '—'],
    ['Kouřovod', [fl.material, fl.diameterCm ? `průměr ${fl.diameterCm} cm` : '', fl.length ? `délka ${String(fl.length).replace('.', ',')} m` : '', elbowsText(fl.elbows) ? `koleno ${elbowsText(fl.elbows)}` : ''].filter(Boolean).join(' · ') || '—'],
    ['Výšky a vložka', [p.buildHeight ? `stavební výška ${String(p.buildHeight).replace('.', ',')} m` : '', p.effHeight ? `účinná výška ${String(p.effHeight).replace('.', ',')} m` : '', p.linerDiameterCm ? `průměr vložky ${p.linerDiameterCm} cm` : ''].filter(Boolean).join(' · ') || '—'],
    ['Vložka', p.liner || '—'],
    ['Čištění komína se provádí', p.cleaning.join(', ') || '—'],
    ['Vybírací otvor je umístěn', p.openingPlace || '—'],
    ['Komín je po celé délce omítnutý', p.plastered ? 'ano' : `ne – ${p.plasteredWhere || 'neuvedeno'}`],
    ['Výrobce komína, komponentů, vložek', p.manufacturer || '—'],
    ['Zhotovitel spalinové cesty', [p.contractor, p.contractorName].filter(Boolean).join(' – ') || '—'],
    ['Popis stavby', p.building || '—'],
    ['Typ střechy', p.roof === 'jiná' ? p.roofOther || 'jiná' : p.roof || '—'],
    ['Bezpečná vzdálenost 5 cm od hořlavých konstrukcí', p.safeDistance ? 'ano' : `není – ${p.safeDistanceWhere || 'neuvedeno'}`],
    ['Přívod vzduchu je zajištěn', p.airSupply || '—'],
    ['Další ventilátor v prostoru spotřebiče', p.fan ? `ano – ${p.fanWhat || 'neuvedeno'}` : yesNo(false)],
  ];
}

export function protocolDefects(p) {
  return [...p.defects.map((x) => label(DEFECTS, x)), p.defectOther.trim()].filter(Boolean);
}

export function protocolMissing(p) {
  const out = [];
  if (!p.purpose) out.push('určení revize');
  if (!p.brand) out.push('značka/typ spotřebiče');
  if (!p.flue.material) out.push('kouřovod');
  if (!p.effHeight) out.push('účinná výška');
  if (!p.liner) out.push('druh vložky');
  if (!p.cleaning.length) out.push('odkud se komín čistí');
  if ((p.defects.length || p.defectOther.trim()) && !p.deadline.mode) out.push('termín odstranění nedostatků');
  return out;
}
