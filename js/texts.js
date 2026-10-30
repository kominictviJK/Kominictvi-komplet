// Texty SMS a e-mailů (schválené znění z knihy aplikace) – upravitelné v Nastavení → Texty pro zákazníky
import { settings } from './settings.js';
import { salutation } from './customers.js';
import { fmtPhone } from './ui.js';

export const TEXTS = [
  { id: 'pozvanka', label: 'Pozvánka na kontrolu', text: '{osloveni} blíží se termín pravidelné kontroly a čištění Vašeho komínu (naposledy {posledni}). V obci {obec} budu {den}. Vyhovoval by Vám tento den? Stačí odpovědět ANO a napsat, zda se Vám hodí spíš dopoledne, nebo odpoledne. Děkuji, {podpis}' },
  { id: 'denobec', label: 'Den v obci', text: 'Dobrý den, {den} budu v obci {obec} provádět kontroly a čištění komínů. Pokud máte zájem, ozvěte se mi SMS nebo telefonicky a domluvíme přesný čas. {podpis}' },
  { id: 'srovnani', label: 'Srovnání termínu', text: '{osloveni} kontrola Vašeho komínu vychází na {lhuta}, ale {den} budu ve Vaší obci. Pokud chcete, mohu ji provést už v tento den. Budete ji mít vyřízenou dřív a příště se Vám ozvu ve stejném termínu. Stačí odpovědět ANO. {podpis}' },
  { id: 'potvrzeni', label: 'Potvrzení termínu', text: '{osloveni} potvrzuji termín kontroly a čištění komínu: {den} {cas}, {adresa}. Den předem Vám ještě pošlu připomínku. {podpis}' },
  { id: 'tyden', label: 'Připomínka týden předem', text: '{osloveni} připomínám termín kontroly a čištění komínu {den} {cas}. Pokud Vám termín nevyhovuje, dejte mi prosím vědět. {podpis}' },
  { id: 'vecer', label: 'Připomínka večer předem', text: '{osloveni} zítra ({den}) {cas} se u Vás zastavím kvůli kontrole a čištění komínu.{netopit} Děkuji, {podpis}' },
  { id: 'nezastizen', label: 'Nezastižen', text: '{osloveni} dnes jsem se u Vás zastavil v domluveném termínu kvůli kontrole komínu, ale nepodařilo se mi Vás zastihnout. Ozvěte se mi prosím, rád s Vámi domluvím nový termín. {podpis}' },
  { id: 'jedu', label: 'Jedu k vám', text: '{osloveni} jsem na cestě, budu u Vás asi za {minut} minut. {podpis}' },
  { id: 'zrusit', label: 'Zrušení dne', text: '{osloveni} omlouvám se, z vážných důvodů musím dnešní termín zrušit. Ozvu se Vám s novým termínem. {podpis}' },
  { id: 'presun', label: 'Přesun termínu', text: '{osloveni} musím bohužel přesunout náš termín kontroly komínu. Nově Vám mohu nabídnout {den} {cas}. Vyhovuje Vám to? {podpis}' },
];

export const NETOPIT = ' Prosím, alespoň 2 hodiny předem již netopte.';

export function template(id) {
  const custom = settings().texty?.[id];
  return custom || TEXTS.find((t) => t.id === id)?.text || '';
}

const DAYS = ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'];
export const dayPhrase = (d) => `${DAYS[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
export const blockPhrase = (block, time) => (block ? `mezi ${block.replace('–', '–')} h` : time ? `v ${time}` : '');

export function fill(id, vars = {}, customer = null) {
  const f = settings().firma;
  const all = {
    osloveni: customer ? salutation(customer) : 'Dobrý den,',
    podpis: `${f.znacka}, tel. ${fmtPhone(f.telefon)}`,
    netopit: '',
    ...vars,
  };
  if (customer && vars.netopit === undefined) {
    const solid = (customer.objects || []).some((o) => o.chimneys.some((k) => k.fuel === 'tuha'));
    all.netopit = solid ? NETOPIT : '';
  }
  return template(id).replace(/\{(\w+)\}/g, (_, k) => all[k] ?? '').replace(/\s+([.,])/g, '$1').replace(/\.\./g, '.').replace(/ {2,}/g, ' ').trim();
}

// Odkaz na SMS v iPhonu/iPadu (Zprávy). iOS používá „&body=“.
export function smsUrl(phone, body) {
  const num = String(phone || '').replace(/[^\d+]/g, '');
  const n = num.startsWith('+') || num.length !== 9 ? num : `+420${num}`;
  return `sms:${n}&body=${encodeURIComponent(body)}`;
}
