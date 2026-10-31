// Zámek aplikace přes Face ID (přístupový klíč iPadu) po 15 minutách nečinnosti
import { settings, saveSettings } from './settings.js';

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const lockSupported = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
export const lockEnabled = () => !!settings().bezpecnost?.credId;

export async function setupLock() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Kominictví Komplet', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'kominik', displayName: settings().firma.jmeno },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
    },
  });
  await saveSettings({ bezpecnost: { credId: b64u(cred.rawId) } });
}

export async function disableLock() { await saveSettings({ bezpecnost: { credId: null } }); }

async function verify() {
  await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64u(settings().bezpecnost.credId), transports: ['internal'] }],
      userVerification: 'required', timeout: 60000,
    },
  });
}

let hiddenAt = null;
let locked = false;

function showLock() {
  if (locked) return;
  locked = true;
  const el = document.createElement('div');
  el.className = 'lockscreen';
  el.innerHTML = '<img src="icons/logo.png" alt=""><h2>Aplikace je zamčená</h2><button class="btn primary big" id="unlock">Odemknout Face ID</button><p class="sub" id="lock-msg"></p>';
  document.body.appendChild(el);
  const go = async (auto = false) => {
    try { await verify(); el.remove(); locked = false; } catch { if (!auto) el.querySelector('#lock-msg').textContent = 'Nepodařilo se ověřit, zkus to znovu.'; }
  };
  el.querySelector('#unlock').addEventListener('click', () => go(false));
  setTimeout(() => go(true), 300);
}

export function initLock() {
  if (!lockEnabled() || !lockSupported()) return;
  showLock();
  const minutes = () => settings().bezpecnost?.zamekMinuty || 15;
  let lastActive = Date.now();
  ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, () => { lastActive = Date.now(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > minutes() * 60000) showLock();
  });
  setInterval(() => { if (!document.hidden && Date.now() - lastActive > minutes() * 60000) showLock(); }, 30000);
}
