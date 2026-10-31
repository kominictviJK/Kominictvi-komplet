// Volby formuláře zprávy (podle zprávy dle vyhl. č. 34/2016 Sb., příloha č. 3, s úpravami z návrhu)
export const FUELS = [['tuha', 'Tuhá'], ['plyn', 'Plynná'], ['kapalna', 'Kapalná']];

export const APPLIANCE_KINDS = ['kotel', 'krbová vložka', 'kachlová kamna', 'krbová kamna', 'lokální kamna', 'sporák', 'ohřívač vody', 'jiný'];

export const PLACEMENTS = ['R.D.', 'byt', 'obytná místnost', 'kuchyň', 'kotelna', 'technická místnost', 'jiné'];

export const FLOORS = ['NP', 'PP'];

export const BODY_TYPES = ['jednovrstvé', 'zděné', 'vložkované', 'systémové', 'individuální', 'víceprůduchové', 'vymazávané', 'třívrstvé nerezové'];

export const LINERS = ['nerez', 'keramika', 'hliník', 'cihlová', 'plast', 'není', 'jiná'];

export const FLUES = ['ocel', 'nerez', 'hliník', 'plast', 'zděný', 'plech', 'přímé napojení', 'jiný'];

// Neodstraněné nedostatky (13) – dvířka rozdělena na netěsná / poškozená
export const BASE_DEFECTS = [
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
export const BASE_RECOMMENDATIONS = [
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

// Pracovní seznamy – upravují se v Nastavení → Katalog závad (vlastní položky, pořadí, skrytí)
export const DEFECTS = [...BASE_DEFECTS];
export const RECOMMENDATIONS = [...BASE_RECOMMENDATIONS];
const LABELS = new Map([...BASE_DEFECTS, ...BASE_RECOMMENDATIONS]);

// k = { defects: [{ key, label, hidden }], recs: [...] } – když chybí, platí původní seznam
export function applyCatalog(k = {}) {
  const build = (target, base, custom) => {
    const list = custom?.length ? custom : base.map(([key, lbl]) => ({ key, label: lbl }));
    list.forEach((x) => LABELS.set(x.key, x.label));
    target.length = 0;
    target.push(...list.filter((x) => !x.hidden).map((x) => [x.key, x.label]));
  };
  build(DEFECTS, BASE_DEFECTS, k?.defects);
  build(RECOMMENDATIONS, BASE_RECOMMENDATIONS, k?.recs);
}
export const catalogList = (which, k = {}) => (k?.[which]?.length ? k[which].map((x) => ({ ...x })) : (which === 'defects' ? BASE_DEFECTS : BASE_RECOMMENDATIONS).map(([key, lbl]) => ({ key, label: lbl, hidden: false })));

export const CONCLUSIONS = [
  ['vyhovuje', 'VYHOVUJE'],
  ['poodstraneni', 'VYHOVUJE PO ODSTRANĚNÍ NEDOSTATKŮ'],
  ['nevyhovuje', 'NEVYHOVUJE'],
];

export const label = (list, key) => (list.find(([k]) => k === key) || [])[1] || LABELS.get(key) || key;

// Souhrnný text kolen: „2× 90° + 1× 45°“
export function elbowsText(e = {}) {
  if (e.none) return 'bez kolen';
  const parts = [];
  if (e.e90) parts.push(`${e.e90}× 90°`);
  if (e.e45) parts.push(`${e.e45}× 45°`);
  if (e.flex) parts.push(`${e.flex}× flexibilní`);
  return parts.join(' + ');
}
