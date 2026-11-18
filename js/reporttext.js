// Text zprávy: z klikacích voleb složí věty jako ve vzoru dle přílohy č. 3 vyhlášky č. 34/2016 Sb.
import { FUEL_LABEL } from './lhuty.js';
import { elbowsText } from './catalog.js';

const num = (v) => String(v ?? '').trim().replace('.', ',');
const n = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const join = (arr, sep = '; ') => arr.filter(Boolean).join(sep);
const floorTxt = (pp, np) => join([n(pp) ? `${n(pp)} PP` : '', n(np) ? `${n(np)} NP` : ''], ', ');

const MAT_GEN = { 'plné pálené cihly': 'z plných pálených cihel', 'CDM cihly': 'z CDM cihel', 'komínové tvárnice': 'z komínových tvárnic', 'keramický systémový komín': 'z keramických systémových dílců', 'nerezový komín': 'z nerezové oceli', kámen: 'z kamene', 'šamotové tvárnice': 'ze šamotových tvárnic', 'pórobetonové tvárnice': 'z pórobetonových tvárnic' };
const LINER_INS = { 'flexibilní nerez': 'flexibilní nerezovou vložkou', sklolaminát: 'sklolaminátovou vložkou', nerez: 'nerezovou vložkou', keramika: 'keramickou (šamotovou) vložkou', hliník: 'hliníkovou vložkou', plast: 'plastovou vložkou', cihlová: 'cihlovou vložkou' };
const FUEL_ADJ = { tuha: 'na tuhá paliva', plyn: 'na plyn', kapalna: 'na kapalná paliva' };

export function objectLine(site = {}) {
  return join([site.objType ? cap(site.objType) : '', floorTxt(site.pp, site.np), site.roof ? `${site.roof} střecha` : '']);
}

const appKind = (a) => (a.kind === 'jiný' ? a.kindOther : a.kind) || 'spotřebič';
const placeTxt = (a) => {
  const places = [...(a.placement || []).filter((p) => p !== 'jiné'), a.placement?.includes('jiné') ? a.placementOther : ''].filter(Boolean);
  const floor = a.floor === 'PP' ? 'v 1. PP' : a.floor ? `v ${a.floor === 'NP' ? '1. NP' : a.floor}` : '';
  return places.length ? `${cap(places.join(', '))} ${floor}`.trim() : cap(floor);
};

export function applianceLine(k, a) {
  const kind = appKind(a);
  const isBoiler = /kotel/.test(kind);
  const types = (k.fuelTypes || []).length ? ` (${k.fuelTypes.join(', ')})` : '';
  const what = `${cap(kind)} ${isBoiler ? `${FUEL_ADJ[k.fuel] || ''}${types}` : ''}${isBoiler && k.condensing ? ' – kondenzační' : ''}${k.ut && isBoiler ? ' pro ústřední vytápění' : ''}`.replace(/\s+/g, ' ').trim();
  return join([what, a.brand, a.kw ? `jmenovitý výkon ${num(a.kw)} kW` : '', !isBoiler ? `palivo: ${(k.fuelTypes || []).length ? k.fuelTypes.join(', ') : FUEL_LABEL[k.fuel] || ''}` : '', k.operation ? `provoz ${k.operation}` : '']);
}

export function flueLine(a, k = {}) {
  const f = a.flue || {};
  const mat = f.material === 'jiný' ? f.materialOther : f.material;
  const opening = f.opening === true ? 'kontrolní otvor: ano' : f.opening === false ? 'kontrolní otvor: ne' : '';
  return join([f.separate ? cap(f.separate) : '', mat ? `materiál: ${mat}` : '', f.diameter ? `DN ${f.diameter} mm` : '', opening, f.length ? `délka cca ${num(f.length)} m` : '', elbowsText(f.elbows) ? `kolena: ${elbowsText(f.elbows)}` : '', f.reduction ? `redukce ${f.reduction} mm` : '', ...(k.damper || [])]);
}

// Popis komínu v odrážkách
export function chimneyBullets(k, site = {}) {
  if (k.descOverride?.trim()) return k.descOverride.split('\n').map((x) => x.replace(/^[-–•]\s*/, '').trim()).filter(Boolean);
  const out = [];
  const flues = Math.max(1, n(k.flues) || 1);
  const mat = k.bodyMaterial === 'jiný' ? k.bodyMaterialOther : k.bodyMaterial;
  const body = (k.body || []).filter((b) => !['vložkované'].includes(b));
  const matTxt = k.bodyMaterial === 'jiný' ? (mat ? `materiál: ${mat}` : '') : MAT_GEN[mat] || '';
  let s1 = `Komínové těleso${body.length ? ` ${body.join(', ')}` : ''}${matTxt ? `${body.length ? ',' : ''} ${matTxt}` : ''}`;
  s1 += flues > 1 ? `, se ${flues} průduchy` : ', s 1 průduchem';
  if (k.founded) s1 += `, založené ${k.founded === 'na půdě' ? 'na půdě' : `v ${k.founded}`}`;
  if (k.outlet) s1 += `, vyústěné cca ${num(k.outlet)} m nad ${site.roof ? `${site.roof.replace(/á$/, 'ou').replace(/rovná \(plochá\)/, 'rovnou')} ` : ''}střechou`;
  if (k.termination) s1 += k.termination === 'bez stříšky' ? ', ústí bez stříšky' : `, ukončené ${k.termination}`;
  out.push(`${s1}.`);
  if (flues > 1) out.push(`Spotřebič je napojen do průduchu č. ${n(k.flueNo) || 1}${k.otherFlues ? `; ostatní průduchy: ${k.otherFlues}` : ''}.`);
  const lin = k.liner || {};
  const linMat = lin.material === 'jiná' ? lin.materialOther : lin.material;
  if (linMat && linMat !== 'není') {
    out.push(`Průduch ${k.milled ? 'byl rozšířen komínovou frézou a ' : ''}je opatřen ${LINER_INS[linMat] || `vložkou (${linMat})`}${lin.diameter ? ` DN ${lin.diameter} mm` : ''}.`);
  } else if (k.flueSize || lin.diameter) {
    out.push(`Průduch bez vložky, světlost ${k.flueSize || `DN ${lin.diameter}`} mm.`);
  }
  const bh = n(k.buildHeight), eh = n(k.height);
  const heights = [bh ? `stavební výška cca ${num(k.buildHeight)} m` : '', eh ? `účinná výška cca ${num(k.height)} m` : '', bh && eh && bh > eh ? `neúčinná výška cca ${num(Math.round((bh - eh) * 10) / 10)} m` : ''].filter(Boolean);
  if (heights.length) out.push(`${cap(heights.join('; '))}.`);
  const layers = k.layers || ((k.body || []).some((b) => /systémov|třívrstv|vícevrstv/.test(b)) ? 'vícevrstvá' : (k.body || []).length ? 'jednovrstvá' : '');
  const extra = [k.pressure ? `${k.pressure.replace(/ý$/, 'á')}` : '', k.moisture ? `pro ${k.moisture}` : ''];
  if (k.pathType || layers || extra.some(Boolean)) out.push(`Spalinová cesta je ${join([k.pathType, layers, ...extra], ', ')}.`);
  return out;
}

export function airLine(k) { return k.air ? cap(k.air) : ''; }

export function accessBullets(k) {
  const out = [];
  if (k.cleanFrom?.length) out.push(`Čištění a kontrola komínového průduchu se provádí ${k.cleanFrom.join(' a ')}${k.access?.length ? `, přístup ${k.access.join(' a ')}` : ''}.`);
  else if (k.access?.length) out.push(`Přístup ke komínu ${k.access.join(' a ')}.`);
  if (k.ashDoor) out.push(k.ashDoor === 'není' ? 'Vybírací otvor není.' : `Vybírací otvor je ${k.ashDoor}.`);
  return out;
}

// krátký popis komínu do nadpisu („1. komín – kotel na tuhá paliva (kotelna, 1. PP)“)
export function chimneyTitle(k) {
  const a = k.appliances?.[0] || {};
  const kind = appKind(a);
  const p = placeTxt(a);
  const place = p ? p[0].toLowerCase() + p.slice(1) : '';
  return `${kind}${kind === 'kotel' ? ` ${FUEL_ADJ[k.fuel] || ''}` : ''}${place ? ` (${place})` : ''}`.replace(/\s+/g, ' ').trim();
}

export { placeTxt };
