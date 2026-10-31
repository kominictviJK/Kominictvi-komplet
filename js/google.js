// Spojení s pomocníkem Google (Apps Script pod účtem KominictviJK)
import { settings, saveSettings } from './settings.js';

export const helperUrl = () => settings().propojeni?.googleUrl || '';
export const helperToken = () => settings().propojeni?.googleToken || '';
export const hasHelper = () => !!(helperUrl() && helperToken());

export async function ensureToken() {
  if (helperToken()) return helperToken();
  const b = crypto.getRandomValues(new Uint8Array(18));
  const t = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  await saveSettings({ propojeni: { googleToken: t } });
  return t;
}

export async function helperCode() {
  const token = await ensureToken();
  const res = await fetch('apps-script/Code.gs', { cache: 'no-cache' });
  return (await res.text()).replace('__TOKEN__', token);
}

export async function callHelper(action, data = {}, { timeout = 60000 } = {}) {
  if (!hasHelper()) throw new Error('Pomocník Google není nastavený (Nastavení → Propojení)');
  if (!navigator.onLine) throw new Error('Bez internetu');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    // text/plain = bez „preflight“ dotazu, Apps Script to tak přijme
    const res = await fetch(helperUrl(), { method: 'POST', body: JSON.stringify({ token: helperToken(), action, data }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal, redirect: 'follow' });
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch { throw new Error('Pomocník neodpověděl správně – zkontroluj adresu a nasazení („Kdokoli“)'); }
    if (!j.ok) throw new Error(j.error || 'Chyba pomocníka');
    return j.data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Pomocník neodpověděl včas');
    throw e;
  } finally { clearTimeout(timer); }
}

export const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
export const base64ToBlob = (b64, type) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });

// E-mail s přílohami přímo z KominictviJK@gmail.com
export async function sendEmail({ to, subject, body, files = [] }) {
  const attachments = [];
  for (const f of files) attachments.push({ name: f.name, type: f.type, base64: await blobToBase64(f) });
  return callHelper('sendEmail', { to, subject, body, attachments, fromName: settings().firma.znacka });
}
