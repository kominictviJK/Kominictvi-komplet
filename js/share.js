// Odeslání dokumentu: nabídka Sdílet iPadu (WhatsApp, Mail, Tisk…)
import { settings } from './settings.js';
import { salutation, displayName } from './customers.js';
import { pdfFileName } from './pdf.js';
import { fmtDate, parseIso, toast, modal, html } from './ui.js';
import { hasHelper, sendEmail } from './google.js';
import { nextCheck } from './lhuty.js';

export function podpis() {
  const f = settings().firma;
  return `${f.znacka}, tel. ${f.telefon}`;
}

// Text k zaslané zprávě (text č. 8 z knihy aplikace)
export function reportMessage(doc, customer) {
  if (doc.kind === 'protokol') {
    return `Dobrý den, v příloze posílám protokol k revizi spalinové cesty č. ${doc.no} – ${displayName(customer)}, ${customer.objects.find((o) => o.id === doc.objectId)?.address?.street || ''}. Fotodokumentaci posílám zvlášť. ${podpis()}`;
  }
  if (doc.kind === 'doklad') {
    return `${salutation(customer)} v příloze posílám příjmový doklad č. ${doc.no} ze dne ${fmtDate(parseIso(doc.date))}. Děkuji za důvěru, ${podpis()}`;
  }
  const obj = customer.objects.find((o) => o.id === doc.objectId) || customer.objects[0];
  const nexts = (obj?.chimneys || []).map(nextCheck).filter(Boolean).sort((a, b) => a - b);
  const when = nexts[0] ? `v ${MONTH_LOC[nexts[0].getMonth()]} ${nexts[0].getFullYear()}` : '';
  return `${salutation(customer)} v příloze posílám zprávu o provedení kontroly a čištění spalinové cesty č. ${doc.no}. Zprávu si prosím uschovejte, může ji po Vás chtít například pojišťovna.${when ? ` Příští kontrola Vás čeká ${when}, včas se Vám ozvu.` : ''} Děkuji za důvěru, ${podpis()}`;
}

export function reportSubject(doc) {
  if (doc.kind === 'protokol') return `Protokol k revizi spalinové cesty č. ${doc.no}`;
  return doc.kind === 'doklad' ? `Příjmový doklad č. ${doc.no}` : `Zpráva o kontrole a čištění komínu č. ${doc.no}`;
}

export function pdfFile(doc, customer) {
  return new File([doc.pdf], pdfFileName(doc, displayName(customer)), { type: 'application/pdf' });
}

// how: 'whatsapp' | 'email' | 'tisk' – všechno jde přes nabídku Sdílet; text se přiloží, kde to aplikace umí
export async function shareDocument(doc, customer, how = 'whatsapp') {
  const file = pdfFile(doc, customer);
  if (how === 'email' && hasHelper() && customer.email) {
    try { return await emailDirect({ to: customer.email, subject: reportSubject(doc), text: reportMessage(doc, customer), files: [file] }); } catch (e) { toast(`${e.message} – otevírám Sdílet`); }
  }
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

// E-mail rovnou z KominictviJK@gmail.com přes pomocníka Google
export async function emailDirect({ to, subject, text, files }) {
  const ok = await modal({
    title: 'Poslat e-mailem',
    body: String(html`<p>Komu: <b>${to}</b><br>Předmět: ${subject}</p><p class="sub">Odejde z ${settings().firma.email} s přílohou ${files.map((f) => f.name).join(', ')}.</p>`),
    actions: [{ label: 'Zrušit', value: false }, { label: 'Odeslat', value: true, kind: 'primary' }],
  });
  if (!ok) return false;
  toast('Odesílám…');
  await sendEmail({ to, subject, body: text, files });
  toast(`Odesláno na ${to}`);
  return true;
}

// Faktura, nabídka…: e-mailem (když má zákazník e-mail a je nastavený pomocník), jinak nabídka Sdílet
export async function sendOut({ files, text, title, customer }) {
  if (hasHelper() && customer?.email) {
    const how = await modal({ title, body: '<p class="sub">Jak poslat?</p>', actions: [{ label: 'Zrušit', value: null }, { label: 'Sdílet (WhatsApp, tisk…)', value: 'share' }, { label: `E-mailem na ${customer.email}`, value: 'email', kind: 'primary' }] });
    if (!how) return false;
    if (how === 'email') { try { return await emailDirect({ to: customer.email, subject: title, text, files }); } catch (e) { toast(e.message); return false; } }
  }
  const data = { files, text, title };
  if (navigator.canShare?.(data)) { try { await navigator.share(data); return true; } catch { return false; } }
  window.open(URL.createObjectURL(files[0]), '_blank');
  return false;
}

// Měsíce v 6. pádu („v říjnu 2027“)
export const MONTH_LOC = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
