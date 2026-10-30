// Platby: IBAN z českého čísla účtu a QR Platba (formát SPD)
import qrcode from '../vendor/qrcode.mjs';

// „19-2000145399/0800“ nebo „2000145399/0800“ → CZ IBAN
export function czIban(account) {
  const m = String(account || '').replace(/\s/g, '').match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) return null;
  const [, prefix = '', number, bank] = m;
  const bban = bank + prefix.padStart(6, '0') + number.padStart(10, '0');
  const numeric = bban + '123500'; // C=12, Z=35, 00
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, '0');
  return `CZ${check}${bban}`;
}

export function spdString({ account, amount, vs, message }) {
  const iban = czIban(account);
  if (!iban) return null;
  const clean = (s) => String(s || '').replace(/\*/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 60);
  const parts = ['SPD', '1.0', `ACC:${iban}`, `AM:${Number(amount).toFixed(2)}`, 'CC:CZK'];
  if (vs) parts.push(`X-VS:${vs}`);
  if (message) parts.push(`MSG:${clean(message)}`);
  return parts.join('*');
}

// SVG s QR kódem
export function qrSvg(text, size = 220) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + 8);
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${((c + 4) * cell).toFixed(2)} ${((r + 4) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR Platba"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export const paymentTotal = (items = []) => items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);

export const METHODS = { hotove: 'Hotově', qr: 'QR kódem', faktura: 'Fakturou' };
