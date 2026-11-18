// Volby formuláře zprávy (podle zprávy dle vyhl. č. 34/2016 Sb., příloha č. 3, s úpravami z návrhu)
export const FUELS = [['tuha', 'Tuhá'], ['plyn', 'Plynná'], ['kapalna', 'Kapalná']];

export const APPLIANCE_KINDS = ['kotel', 'kombinovaný kotel', 'krbová vložka', 'krbová kamna', 'kachlová kamna', 'akumulační kamna', 'lokální kamna', 'sporák', 'pec / udírna', 'ohřívač vody', 'jiný'];

export const PLACEMENTS = ['kotelna', 'technická místnost', 'obývací pokoj', 'kuchyň', 'chodba', 'koupelna', 'sklep', 'půda', 'garáž', 'dílna', 'jiné'];

export const FLOORS = ['NP', 'PP'];

export const BODY_TYPES = ['jednovrstvé', 'zděné', 'vložkované', 'systémové', 'individuální', 'víceprůduchové', 'vymazávané', 'třívrstvé nerezové'];

export const LINERS = ['nerez', 'flexibilní nerez', 'keramika', 'hliník', 'plast', 'sklolaminát', 'cihlová', 'není', 'jiná'];

export const FLUES = ['ocel', 'smaltovaný', 'nerez', 'flexi', 'hliník', 'plast', 'zděný', 'plech', 'přímé napojení', 'jiný'];

// druh paliva podle skupiny
export const FUEL_TYPES = { tuha: ['dřevo', 'uhlí', 'koks', 'pelety', 'brikety'], plyn: ['zemní plyn', 'propan (LPG)'], kapalna: ['topný olej'] };

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

// ---------- Podrobný popis spalinové cesty (vzor dle přílohy č. 3) ----------
export const OBJECT_TYPES = ['rodinný dům', 'řadový dům', 'bytový dům', 'bytová jednotka', 'chata / chalupa', 'penzion / ubytování', 'provozovna', 'veřejná budova', 'hospodářská budova'];
export const ROOFS = ['sedlová', 'valbová', 'polovalbová', 'rovná', 'pultová', 'mansardová', 'stanová'];
export const BODY_MATERIALS = ['plné pálené cihly', 'CDM cihly', 'komínové tvárnice', 'šamotové tvárnice', 'pórobetonové tvárnice', 'keramický systémový komín', 'nerezový komín', 'kámen'];
export const FOUNDED = ['1. PP', '1. NP', '2. NP', 'na půdě'];
export const OTHER_FLUES = ['větrání', 'nevyužité', 'další spotřebiče'];
export const PATH_TYPES = ['individuální', 'společná'];
export const LAYERS = ['jednovrstvá', 'vícevrstvá'];
export const AIR_SUPPLY = ['z interiéru (spotřebič typu B)', 'trvalý přívod z venkovního prostředí', 'externí přívod vzduchu potrubím do spotřebiče', 'koaxiálně z venkovního prostředí (spotřebič typu C)', 'odděleně dvoutrubkovým systémem (spotřebič typu C)'];
export const CLEAN_FROM = ['z ústí komína ze střechy', 'z komínové lávky', 'komínovými dvířky na půdě', 'komínovými dvířky v místnosti', 'ze sklepa (spodem)', 'kontrolním otvorem kouřovodu'];
export const ACCESS = ['po žebříku', 'z výsuvného žebříku', 'střešním výlezem', 'z vikýře', 'po střešní lávce', 'po střešních stupačkách', 'z plošiny', 'bez výstupu na střechu'];
export const ASH_DOOR = ['v patě komína', 've sklepě', 'v kotelně', 'v technické místnosti', 'v garáži', 'v 1. NP', 'na půdě', 'není'];
export const TERMINATION = ['komínovou stříškou', 'komínovou hlavicí', 'rotační hlavicí', 'lapačem jisker', 'bez stříšky'];
export const DAMPERS = ['kouřová klapka', 'regulátor tahu'];
export const PRESSURE = ['podtlakový', 'přetlakový'];
export const MOISTURE = ['suchý provoz', 'mokrý provoz'];
export const OPERATION = ['celoroční', 'sezónní'];
export const NOTE_CHIPS = [
  'Spotřebič byl v době kontroly mimo provoz.',
  'Ústí komína kontrolováno kamerou / zdola – výstup na střechu nebyl bezpečný.',
  'Zpráva o revizi spalinové cesty nebyla předložena – doporučeno ji doložit.',
  'Nový spotřebič: před uvedením do provozu je nutná revize spalinové cesty.',
  'Zákazník upozorněn na nutnost odstranit hořlavé předměty z okolí komína.',
  'Doporučeno zkrátit interval čištění (vlhké palivo, velké množství sazí).',
  'Zákazník odmítl vyčištění kouřovodu.',
];
export const HIDDEN_PARTS_TEXT = 'Vzhledem k celkové dokončenosti objektu není možné provést kontrolu provedení prostupů spalinové cesty vodorovnými a svislými stavebními konstrukcemi, které jsou stavebně uzavřené a vizuálně nepřístupné; tyto části nejsou předmětem této zprávy.';

// Klíče skupin voleb, ke kterým jde přidat vlastní hodnotu (ukládá se v Nastavení → vlastni)
export const CUSTOM_GROUPS = {
  objType: 'Typ objektu', roof: 'Střecha', kind: 'Druh spotřebiče', placement: 'Umístění', fuelType: 'Druh paliva', flueMaterial: 'Kouřovod – materiál',
  body: 'Komínové těleso', bodyMaterial: 'Materiál tělesa', liner: 'Vložka', otherFlues: 'Ostatní průduchy', founded: 'Založení', termination: 'Ukončení komínu',
  air: 'Přívod vzduchu', cleanFrom: 'Čištění', access: 'Přístup', ashDoor: 'Vybírací otvor', notes: 'Poznámky na zprávu',
};
