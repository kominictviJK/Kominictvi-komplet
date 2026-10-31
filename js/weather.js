// Počasí pro ranní přehled – Open-Meteo (zdarma, bez klíče); uloží se na hodinu
import { get, put } from './db.js';

const CODES = [
  [[0], 'jasno'], [[1, 2], 'polojasno'], [[3], 'zataženo'], [[45, 48], 'mlha'],
  [[51, 53, 55, 56, 57], 'mrholení'], [[61, 63, 65, 66, 67, 80, 81, 82], 'déšť'],
  [[71, 73, 75, 77, 85, 86], 'sněžení'], [[95, 96, 99], 'bouřky'],
];
export const codeText = (c) => (CODES.find(([list]) => list.includes(c)) || [[], ''])[1];

export async function forecast(pos) {
  if (!pos?.lat) return null;
  const cached = (await get('settings', 'weather'))?.value;
  if (cached && Date.now() - cached.at < 3600 * 1000 && Math.abs(cached.lat - pos.lat) < 0.05) return cached.days;
  if (!navigator.onLine) return cached?.days || null;
  const q = new URLSearchParams({
    latitude: pos.lat.toFixed(3), longitude: pos.lng.toFixed(3), timezone: 'Europe/Prague', forecast_days: '3',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max',
  });
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    if (!r.ok) throw new Error();
    const d = (await r.json()).daily;
    const days = d.time.map((date, i) => ({
      date, code: d.weather_code[i], text: codeText(d.weather_code[i]),
      tmax: Math.round(d.temperature_2m_max[i]), tmin: Math.round(d.temperature_2m_min[i]),
      rainProb: d.precipitation_probability_max?.[i] ?? null, rain: d.precipitation_sum[i],
      wind: Math.round(d.wind_speed_10m_max[i]), gusts: Math.round(d.wind_gusts_10m_max[i]),
    }));
    await put('settings', { key: 'weather', value: { at: Date.now(), lat: pos.lat, days } });
    return days;
  } catch { return cached?.days || null; }
}

// Upozornění pro práci na střeše
export function warnings(day) {
  if (!day) return [];
  const w = [];
  if (day.gusts >= 60) w.push(`silný vítr (nárazy ${day.gusts} km/h) – na střechu jen s jištěním`);
  else if (day.gusts >= 45) w.push(`větrno (nárazy ${day.gusts} km/h)`);
  if ((day.rainProb ?? 0) >= 60 || day.rain >= 3) w.push(`déšť ${day.rainProb != null ? `${day.rainProb} %` : ''}`.trim() + (day.rain ? `, ${String(Math.round(day.rain * 10) / 10).replace('.', ',')} mm` : ''));
  if (day.tmin <= 0 && day.code !== 0) w.push('možné náledí na střeše');
  if ([71, 73, 75, 77, 85, 86].includes(day.code)) w.push('sníh');
  return w;
}
