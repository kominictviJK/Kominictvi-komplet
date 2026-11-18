// Předvolby komínu: jedním ťuknutím vyplní typické údaje (značka, výkon, výšky a výsledek kontroly zůstávají)
import { settings, saveSettings } from './settings.js';
import { uid } from './db.js';

const KEYS = ['fuel', 'condensing', 'ut', 'fuelTypes', 'operation', 'body', 'bodyMaterial', 'liner', 'flues', 'flueNo', 'otherFlues', 'milled', 'founded', 'pathType', 'layers', 'pressure', 'moisture', 'termination', 'damper', 'air', 'cleanFrom', 'access', 'ashDoor'];

const ap = (kind, floor, placement, flue) => ({ kind, floor, placement, flue: { separate: 'samostatný', ...flue } });

export const BUILTIN = [
  { id: 'b1', name: 'Kondenzační kotel – systémový komín', data: { fuel: 'plyn', condensing: true, ut: true, fuelTypes: ['zemní plyn'], body: ['systémové'], bodyMaterial: 'keramický systémový komín', liner: { material: 'plast', diameter: '80' }, flues: 1, pathType: 'individuální', layers: 'vícevrstvá', pressure: 'přetlakový', moisture: 'mokrý provoz', air: 'koaxiálně z venkovního prostředí (spotřebič typu C)', cleanFrom: ['kontrolním otvorem kouřovodu', 'ze sklepa (spodem)'], ashDoor: 'v technické místnosti', appliance: ap('kotel', 'NP', ['technická místnost'], { material: 'plast', diameter: '80', opening: true }) } },
  { id: 'b2', name: 'Plynový kotel – vložkovaný komín', data: { fuel: 'plyn', condensing: false, ut: true, fuelTypes: ['zemní plyn'], body: ['zděné', 'vložkované'], bodyMaterial: 'plné pálené cihly', liner: { material: 'nerez', diameter: '140' }, flues: 1, pathType: 'individuální', layers: 'vícevrstvá', pressure: 'podtlakový', moisture: 'suchý provoz', air: 'z interiéru (spotřebič typu B)', cleanFrom: ['z ústí komína ze střechy'], access: ['po žebříku'], ashDoor: 'v patě komína', termination: 'komínovou stříškou', appliance: ap('kotel', 'NP', ['kotelna'], { material: 'ocel', diameter: '130', opening: true }) } },
  { id: 'b3', name: 'Kotel na tuhá paliva – zděný komín s nerezovou vložkou', data: { fuel: 'tuha', condensing: false, ut: true, fuelTypes: ['dřevo', 'uhlí'], operation: 'celoroční', body: ['zděné', 'vložkované'], bodyMaterial: 'plné pálené cihly', liner: { material: 'nerez', diameter: '160' }, flues: 1, pathType: 'individuální', layers: 'vícevrstvá', air: 'trvalý přívod z venkovního prostředí', cleanFrom: ['z ústí komína ze střechy'], access: ['po žebříku', 'střešním výlezem'], ashDoor: 'v patě komína', termination: 'komínovou stříškou', damper: ['kouřová klapka'], appliance: ap('kotel', 'PP', ['kotelna'], { material: 'ocel', diameter: '150', opening: true }) } },
  { id: 'b4', name: 'Kotel na tuhá paliva – zděný komín bez vložky', data: { fuel: 'tuha', condensing: false, ut: true, fuelTypes: ['dřevo', 'uhlí'], operation: 'celoroční', body: ['zděné'], bodyMaterial: 'plné pálené cihly', liner: { material: 'není', diameter: '' }, flues: 1, pathType: 'individuální', layers: 'jednovrstvá', air: 'trvalý přívod z venkovního prostředí', cleanFrom: ['z ústí komína ze střechy'], access: ['po žebříku'], ashDoor: 'v patě komína', appliance: ap('kotel', 'PP', ['kotelna'], { material: 'ocel', diameter: '150', opening: true }) } },
  { id: 'b5', name: 'Krbová kamna – systémový komín', data: { fuel: 'tuha', condensing: false, ut: false, fuelTypes: ['dřevo'], operation: 'sezónní', body: ['systémové'], bodyMaterial: 'keramický systémový komín', liner: { material: 'keramika', diameter: '180' }, flues: 1, pathType: 'individuální', layers: 'vícevrstvá', air: 'z interiéru (spotřebič typu B)', cleanFrom: ['z ústí komína ze střechy'], access: ['po žebříku'], ashDoor: 'v 1. NP', termination: 'komínovou stříškou', appliance: ap('krbová kamna', 'NP', ['obývací pokoj'], { material: 'ocel', diameter: '150', opening: false }) } },
];

export const allPresets = () => [...BUILTIN, ...(settings().predvolby || [])];

export function applyPreset(k, data) {
  for (const key of KEYS) if (data[key] !== undefined) k[key] = structuredClone(data[key]);
  if (data.liner) k.liner = { material: '', materialOther: '', diameter: '', ...structuredClone(data.liner) };
  if (data.appliance) {
    const a = k.appliances[0];
    const p = data.appliance;
    Object.assign(a, { kind: p.kind, kindOther: '', floor: p.floor, placement: [...(p.placement || [])] });
    a.flue = { ...a.flue, ...structuredClone(p.flue), elbows: a.flue.elbows };
  }
  if (k.flues > 1 && !k.flueNo) k.flueNo = 1;
}

export async function savePreset(name, k) {
  const a = k.appliances[0] || {};
  const data = Object.fromEntries(KEYS.map((key) => [key, structuredClone(k[key])]));
  data.liner = { material: k.liner?.material || '', diameter: k.liner?.diameter || '' };
  data.appliance = { kind: a.kind, floor: a.floor, placement: [...(a.placement || [])], flue: { material: a.flue?.material, diameter: a.flue?.diameter, separate: a.flue?.separate, opening: a.flue?.opening } };
  const list = settings().predvolby || [];
  await saveSettings({ predvolby: [...list, { id: uid('pv_'), name, data }] });
}
