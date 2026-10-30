// Mapy.com REST API: mapové dlaždice, hledání adres (PSČ, okres, poloha) a výpočet trasy
import { settings, saveSettings } from './settings.js';

const API = 'https://api.mapy.com/v1';
export const key = () => settings().propojeni?.mapyKey || '';
export const hasKey = () => !!key();

export function tileUrl(mapset = 'basic') {
  return `${API}/maptiles/${mapset}/256/{z}/{x}/{y}?apikey=${encodeURIComponent(key())}`;
}

async function call(path, params) {
  if (!hasKey()) throw new Error('Chybí API klíč Mapy.cz (Nastavení → Propojení)');
  if (!navigator.onLine) throw new Error('Bez internetu');
  const q = new URLSearchParams({ ...params, apikey: key() });
  const res = await fetch(`${API}/${path}?${q}`);
  if (res.status === 401 || res.status === 403) throw new Error('API klíč Mapy.cz nefunguje – zkontroluj ho v Nastavení');
  if (!res.ok) throw new Error(`Mapy.cz neodpověděly (${res.status})`);
  return res.json();
}

// Adresa → poloha, PSČ, obec, okres
export async function geocode(address) {
  const data = await call('geocode', { query: address, lang: 'cs', limit: '1', type: 'regional.address' })
    .then((d) => (d.items?.length ? d : call('geocode', { query: address, lang: 'cs', limit: '1' })));
  const it = data.items?.[0];
  if (!it?.position) return null;
  const rs = it.regionalStructure || [];
  const pick = (type) => rs.find((r) => (r.type || r.Type) === type);
  const name = (r) => r?.name || r?.Name || '';
  const region = rs.filter((r) => (r.type || r.Type) === 'regional.region').map(name);
  const district = (region.find((n) => /^okres /i.test(n)) || region[0] || '').replace(/^okres\s+/i, '');
  return {
    lat: it.position.lat, lng: it.position.lon,
    zip: (it.zip || '').replace(/^(\d{3})(\d{2})$/, '$1 $2'),
    city: name(pick('regional.municipality')),
    district,
    label: it.label || it.name,
  };
}

// Trasa autem: minuty a kilometry
export async function route(from, to) {
  const data = await call('routing/route', { start: `${from.lng},${from.lat}`, end: `${to.lng},${to.lat}`, routeType: 'car_fast', format: 'geojson' });
  return { minutes: Math.round((data.duration || 0) / 60), km: Math.round((data.length || 0) / 100) / 10 };
}

// Poloha domova (start a konec trasy) – zjistí se jednou z adresy v Nastavení
export async function homePosition() {
  const s = settings();
  if (s.lhuty.domovGps?.addr === s.lhuty.domov) return s.lhuty.domovGps;
  if (!hasKey()) return s.lhuty.domovGps || null;
  try {
    const g = await geocode(s.lhuty.domov);
    if (!g) return null;
    const pos = { lat: g.lat, lng: g.lng, addr: s.lhuty.domov };
    await saveSettings({ lhuty: { domovGps: pos } });
    return pos;
  } catch { return s.lhuty.domovGps || null; }
}

export function currentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 });
  });
}

// Doplnit polohu, PSČ a okres objektu, pokud chybí
export async function completeAddress(obj) {
  const a = obj.address;
  if (!a.street && !a.city) return false;
  const g = await geocode([a.street, a.zip, a.city].filter(Boolean).join(', '));
  if (!g) return false;
  a.lat = g.lat; a.lng = g.lng;
  if (!a.zip && g.zip) a.zip = g.zip;
  if (!a.district && g.district) a.district = g.district;
  if (!a.city && g.city) a.city = g.city;
  return true;
}

export const mapsRouteLink = (to, from) => `https://mapy.com/fnc/v1/route?mapset=basic&routeType=car_fast${from ? `&start=${from.lng},${from.lat}` : ''}&end=${to.lng},${to.lat}`;
