// Zálohy: šifrovaná kopie všech dat (zákazníci, dokumenty s PDF, finance, nastavení)
import { all, clear, putMany, STORES, get, put } from './db.js';
import { settings, loadSettings } from './settings.js';
import { callHelper, hasHelper, blobToBase64, base64ToBlob } from './google.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Blob (PDF) → {__blob: base64, type}
async function pack(v) {
  if (v instanceof Blob) return { __blob: await blobToBase64(v), type: v.type };
  if (Array.isArray(v)) return Promise.all(v.map(pack));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await pack(x); return o; }
  return v;
}
function unpack(v) {
  if (v && typeof v === 'object' && v.__blob) return base64ToBlob(v.__blob, v.type);
  if (Array.isArray(v)) return v.map(unpack);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = unpack(x); return o; }
  return v;
}

export async function exportData() {
  const out = { app: 'kominictvi-komplet', v: 1, createdAt: new Date().toISOString(), stores: {} };
  for (const name of Object.keys(STORES)) if (name !== 'queue') out.stores[name] = await pack(await all(name));
  return out;
}

async function keyFrom(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(pass, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({ format: 'kominictvi-zaloha', v: 1, salt: b64(salt), iv: b64(iv), data: b64(data) });
}

export async function decrypt(text, pass) {
  const f = JSON.parse(text);
  if (f.format !== 'kominictvi-zaloha') throw new Error('Tohle není záloha aplikace');
  const key = await keyFrom(pass, unb64(f.salt));
  try {
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, key, unb64(f.data));
    return JSON.parse(dec.decode(data));
  } catch { throw new Error('Špatné heslo zálohy'); }
}

export async function restore(obj) {
  if (obj.app !== 'kominictvi-komplet') throw new Error('Neznámý formát zálohy');
  for (const [name, items] of Object.entries(obj.stores)) {
    if (!STORES[name]) continue;
    await clear(name);
    await putMany(name, unpack(items));
  }
  await loadSettings();
}

export const backupName = () => `Kominictvi-zaloha-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.kominictvi`;
export const backupPass = () => settings().bezpecnost?.zalohaHeslo || '';

export async function lastBackup() { return (await get('settings', 'lastBackup'))?.value || null; }
async function markBackup(where) { await put('settings', { key: 'lastBackup', value: { at: new Date().toISOString(), where } }); }

export async function backupToDrive() {
  const pass = backupPass();
  if (!pass) throw new Error('Nejdřív nastav heslo záloh');
  const content = await encrypt(await exportData(), pass);
  const r = await callHelper('backupSave', { name: backupName(), content }, { timeout: 180000 });
  await markBackup('Google Disk');
  return r;
}

export async function backupToFile() {
  const pass = backupPass();
  if (!pass) throw new Error('Nejdřív nastav heslo záloh');
  const content = await encrypt(await exportData(), pass);
  const file = new File([content], backupName(), { type: 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Záloha Kominictví' });
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
  await markBackup('soubor');
}

// Automatická záloha na Google Disk – nejvýš jednou za 20 hodin, na pozadí
export async function autoBackup() {
  if (!hasHelper() || !backupPass() || !navigator.onLine || settings().rezim.zkusebni) return false;
  const last = await lastBackup();
  if (last && Date.now() - new Date(last.at).getTime() < 20 * 3600 * 1000) return false;
  try { await backupToDrive(); return true; } catch { return false; }
}
