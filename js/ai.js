// AI (Claude API) – čtení účtenek, štítků spotřebičů, faktur za materiál a textů poptávek
import { settings } from './settings.js';
import { put, all, uid } from './db.js';

export const aiKey = () => settings().propojeni?.aiKey || '';
export const hasAi = () => !!aiKey();
const MODEL = () => settings().propojeni?.aiModel || 'claude-haiku-4-5-20251001';

// Útrata: zaznamenává se počet tokenů → Kč (orientačně)
const PRICE = { in: 1 / 1e6, out: 5 / 1e6 }; // USD za token (Haiku 4.5)
const USD_CZK = 23;

async function logUsage(u) {
  if (!u) return;
  const czk = ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out) * USD_CZK;
  const month = new Date().toISOString().slice(0, 7);
  const rec = (await all('settings')).find((x) => x.key === `ai:${month}`);
  await put('settings', { key: `ai:${month}`, value: { czk: (rec?.value.czk || 0) + czk, calls: (rec?.value.calls || 0) + 1 } });
}

export async function aiSpent(month = new Date().toISOString().slice(0, 7)) {
  const rec = (await all('settings')).find((x) => x.key === `ai:${month}`);
  return rec?.value || { czk: 0, calls: 0 };
}

async function ask(content, { max = 800 } = {}) {
  if (!hasAi()) throw new Error('AI není nastavená (Nastavení → Propojení → AI)');
  if (!navigator.onLine) throw new Error('Bez internetu – vyplň ručně');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-api-key': aiKey(), 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL(), max_tokens: max, messages: [{ role: 'user', content }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Klíč AI nefunguje – zkontroluj ho v Nastavení');
    if (res.status === 400 && /credit/i.test(j.error?.message || '')) throw new Error('Na účtu AI došel kredit – dobij ho na platform.claude.com');
    throw new Error(`AI neodpověděla (${res.status}) ${j.error?.message || ''}`);
  }
  await logUsage(j.usage);
  const text = (j.content || []).map((c) => c.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI nevrátila data');
  return JSON.parse(m[0]);
}

const imagePart = (dataUrl) => {
  const [head, data] = dataUrl.split(',');
  const media = head.match(/data:(.*?);/)[1];
  if (media === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: media, data } };
  return { type: 'image', source: { type: 'base64', media_type: media, data } };
};

// Účtenka / faktura za nákup → částka, datum, obchod, kategorie, položky
export function readReceipt(dataUrl) {
  return ask([imagePart(dataUrl), { type: 'text', text: `Jsi pomocník kominíka (OSVČ, neplátce DPH). Přečti účtenku nebo fakturu a vrať POUZE JSON:
{"amount": celková částka v Kč jako číslo, "date": "RRRR-MM-DD", "shop": "název obchodu", "category": jedna z ["tankovani","auto","material","naradi","reklama","telefon","pojisteni","ostatni"], "items": [{"label": "", "qty": číslo, "unit": "ks|m|…", "price": cena za jednotku s DPH}], "note": "krátký popis nákupu"}
Tankování (benzín, nafta) = tankovani. Komínové vložky, dvířka, malta, cihly = material. Nářadí a pomůcky = naradi.` }], { max: 1200 });
}

// Štítek spotřebiče → druh, značka, typ, výkon, palivo
export function readLabel(dataUrl) {
  return ask([imagePart(dataUrl), { type: 'text', text: `Na fotce je typový štítek kotle, kamen nebo jiného spotřebiče. Vrať POUZE JSON:
{"kind": jedna z ["kotel","krbová vložka","kachlová kamna","krbová kamna","lokální kamna","sporák","ohřívač vody","jiný"], "brand": "výrobce a typ", "kw": jmenovitý výkon v kW jako číslo nebo null, "fuel": jedna z ["tuha","plyn","kapalna"] nebo null, "condensing": true/false, "flueDiameter": průměr odtahu v mm nebo null}` }], { max: 400 });
}

// Text nebo screenshot poptávky (SMS, WhatsApp, e-mail) → kontakt a co chce
export function readInquiry({ text = '', image = null }) {
  const parts = [];
  if (image) parts.push(imagePart(image));
  parts.push({ type: 'text', text: `Jsi pomocník kominíka. Z této zprávy od zákazníka (SMS, WhatsApp nebo e-mail) vytáhni údaje. Vrať POUZE JSON:
{"isInquiry": true pokud zákazník chce kominickou službu (kontrola, čištění, revize, frézování, vložka, oprava komína…), jinak false, "firstName": "", "lastName": "", "phone": "", "email": "", "street": "", "city": "", "kind": jedna z ["kontrola","revize","frezovani","ostatni"], "prefer": "kdy se mu to hodí (dopoledne, odpoledne, od 14:00…) nebo prázdné", "desiredDate": "RRRR-MM-DD nebo prázdné", "fuel": "tuha|plyn|", "note": "stručně co chce", "isMayorConfirmation": true pokud jde o potvrzení termínu kominíka od obce/starosty, "villageDate": "RRRR-MM-DD termínu dne v obci nebo prázdné", "village": "název obce"}
Dnešní datum: ${new Date().toISOString().slice(0, 10)}.
${text ? `Zpráva:\n${text}` : ''}` });
  return ask(parts, { max: 600 });
}

// Označení fotky z kontroly (fotodokumentace)
export const PHOTO_TAGS = ['štítek', 'kouřovod', 'závada', 'ústí komína', 'revizní dvířka', 'komínové těleso', 'spotřebič', 'půda', 'střecha', 'jiné'];
export function tagPhoto(dataUrl) {
  return ask([imagePart(dataUrl), { type: 'text', text: `Fotka z kominické kontroly. Vyber jeden štítek z ${JSON.stringify(PHOTO_TAGS)} a stručně (max 8 slov, česky) popiš, co je vidět – u závady jakou. Vrať POUZE JSON {"tag": "", "note": ""}` }], { max: 120 });
}

export async function testAi() {
  return ask([{ type: 'text', text: 'Odpověz POUZE JSON {"ok": true}' }], { max: 20 });
}

export { uid };
