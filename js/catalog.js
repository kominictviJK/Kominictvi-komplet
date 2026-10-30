// Volby formuláře zprávy (podle zprávy dle vyhl. č. 34/2016 Sb., příloha č. 3, s úpravami z návrhu)
export const FUELS = [['tuha', 'Tuhá'], ['plyn', 'Plynná'], ['kapalna', 'Kapalná']];

export const APPLIANCE_KINDS = ['kotel', 'krbová vložka', 'kachlová kamna', 'krbová kamna', 'lokální kamna', 'sporák', 'ohřívač vody', 'jiný'];

export const PLACEMENTS = ['R.D.', 'byt', 'obytná místnost', 'kuchyň', 'kotelna', 'technická místnost', 'jiné'];

export const FLOORS = ['NP', 'PP'];

export const BODY_TYPES = ['jednovrstvé', 'zděné', 'vložkované', 'systémové', 'individuální', 'víceprůduchové', 'vymazávané', 'třívrstvé nerezové'];

export const LINERS = ['nerez', 'keramika', 'hliník', 'cihlová', 'plast', 'není', 'jiná'];

export const FLUES = ['ocel', 'nerez', 'hliník', 'plast', 'zděný', 'plech', 'přímé napojení', 'jiný'];

// Neodstraněné nedostatky (13) – dvířka rozdělena na netěsná / poškozená
export const DEFECTS = [
  ['jadro', 'Drolící se jádro'],
  ['koupristup', 'Nepřístupný kouřovod'],
  ['oxidace', 'Oxidace materiálu'],
  ['kourstav', 'Špatný stav kouřovodu'],
  ['dehet', 'Dehet v komínovém tělese'],
  ['dvirkanetesna', 'Netěsná revizní dvířka'],
  ['dvirkaposkozena', 'Poškozená revizní dvířka'],
  ['plast', 'Špatný stav pláště komína'],
  ['vyska', 'Nedostatečná výška vůči hřebenu'],
  ['horlave', 'Hořlavé materiály v blízkosti komínu'],
  ['pristupkomin', 'Není zajištěn bezpečný přístup ke komínu'],
  ['napojeni', 'Napojení spotřebiče neodpovídá ČSN 73 4201'],
  ['puda', 'Nebyl zajištěn bezpečný a volný přístup na půdu'],
];

// Doporučení (12) – bez lomítek, každá varianta zvlášť
export const RECOMMENDATIONS = [
  ['vlozkovani', 'Vložkování'],
  ['prevlozkovani', 'Převložkování'],
  ['dehetstroj', 'Strojní odstranění dehtu'],
  ['dehetchem', 'Chemické odstranění dehtu'],
  ['detektor', 'Instalace detektoru úniku spalin'],
  ['izolace', 'Izolovat komín od hořlavých materiálů (min. 50 mm)'],
  ['dvirkautesneni', 'Utěsnění revizních dvířek'],
  ['dvirkavymena', 'Výměna revizních dvířek'],
  ['kourovodvymena', 'Výměna kouřovodu'],
  ['plastnad', 'Oprava pláště komína – nadstřešní část'],
  ['plastpuda', 'Oprava pláště komína – půdní část'],
  ['nadstavit', 'Nadstavit komín (nedostatečná výška)'],
];

export const CONCLUSIONS = [
  ['vyhovuje', 'VYHOVUJE'],
  ['poodstraneni', 'VYHOVUJE PO ODSTRANĚNÍ NEDOSTATKŮ'],
  ['nevyhovuje', 'NEVYHOVUJE'],
];

export const label = (list, key) => (list.find(([k]) => k === key) || [])[1] || key;

// Souhrnný text kolen: „2× 90° + 1× 45°“
export function elbowsText(e = {}) {
  if (e.none) return 'bez kolen';
  const parts = [];
  if (e.e90) parts.push(`${e.e90}× 90°`);
  if (e.e45) parts.push(`${e.e45}× 45°`);
  if (e.flex) parts.push(`${e.flex}× flexibilní`);
  return parts.join(' + ');
}
