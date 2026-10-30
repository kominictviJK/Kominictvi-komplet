// Odeslání dokumentu: nabídka Sdílet iPadu (WhatsApp, Mail, Tisk…)
import { settings } from './settings.js';
import { salutation, displayName } from './customers.js';
import { pdfFileName } from './pdf.js';
import { fmtDate, parseIso, toast } from './ui.js';
import { nextCheck } from './lhuty.js';

export function podpis() {
  const f = settings().firma;
  return `${f.znacka}, tel. ${f.telefon}`;
}

// Text k zaslané zprávě (text č. 8 z knihy aplikace)
export function reportMessage(doc, customer) {
  if (doc.kind === 'doklad') {
    return `${salutation(customer)} v příloze posílám příjmový doklad č. ${doc.no} ze dne ${fmtDate(parseIso(doc.date))}. Děkuji za důvěru, ${podpis()}`;
  }
  const obj = customer.objects.find((o) => o.id === doc.objectId) || customer.objects[0];
  const nexts = (obj?.chimneys || []).map(nextCheck).filter(Boolean).sort((a, b) => a - b);
  const when = nexts[0] ? `v ${MONTH_LOC[nexts[0].getMonth()]} ${nexts[0].getFullYear()}` : '';
  return `${salutation(customer)} v příloze posílám zprávu o provedení kontroly a čištění spalinové cesty č. ${doc.no}. Zprávu si prosím uschovejte, může ji po Vás chtít například pojišťovna.${when ? ` Příští kontrola Vás čeká ${when}, včas se Vám ozvu.` : ''} Děkuji za důvěru, ${podpis()}`;
}

export function reportSubject(doc) {
  return doc.kind === 'doklad' ? `Příjmový doklad č. ${doc.no}` : `Zpráva o kontrole a čištění komínu č. ${doc.no}`;
}

export function pdfFile(doc, customer) {
  return new File([doc.pdf], pdfFileName(doc, displayName(customer)), { type: 'application/pdf' });
}

// how: 'whatsapp' | 'email' | 'tisk' – všechno jde přes nabídku Sdílet; text se přiloží, kde to aplikace umí
export async function shareDocument(doc, customer, how = 'whatsapp') {
  const file = pdfFile(doc, customer);
  const data = { files: [file] };
  if (how !== 'tisk') { data.text = reportMessage(doc, customer); data.title = reportSubject(doc); }
  if (navigator.canShare?.(data)) {
    try { await navigator.share(data); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  // záloha (např. počítač): otevřít PDF v nové kartě
  const url = URL.createObjectURL(doc.pdf);
  window.open(url, '_blank');
  if (how !== 'tisk') {
    try { await navigator.clipboard.writeText(reportMessage(doc, customer)); toast('PDF otevřeno, text zprávy je ve schránce'); } catch { toast('PDF otevřeno v nové kartě'); }
  }
  return true;
}

// Měsíce v 6. pádu („v říjnu 2027“)
export const MONTH_LOC = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
