// Tvorba PDF: Zpráva o provedení čištění a kontroly spalinové cesty a Příjmový pokladní doklad
import { PDFDocument, rgb, fontkit } from '../vendor/pdf.mjs';
import { label, CONCLUSIONS, elbowsText } from './catalog.js';
import { defectsText, recsText } from './visit.js';
import { paymentTotal, METHODS } from './payment.js';
import { FUEL_LABEL } from './lhuty.js';
import { displayName } from './customers.js';
import { parseIso, fmtDate } from './ui.js';
import { protocolRows, protocolDefects } from './protocol.js';

const W = 595.28, H = 841.89, M = 40;
const C = {
  ink: rgb(0.122, 0.102, 0.082), muted: rgb(0.42, 0.373, 0.322), bronze: rgb(0.541, 0.373, 0.09),
  bronze2: rgb(0.663, 0.478, 0.122), line: rgb(0.902, 0.851, 0.749), soft: rgb(0.969, 0.949, 0.91),
  dark: rgb(0.122, 0.102, 0.082), white: rgb(1, 1, 1), stamp: rgb(0.243, 0.361, 0.604),
};

let assetCache = null;
async function assets() {
  if (assetCache) return assetCache;
  const load = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`Chybí soubor ${p}`); return r.arrayBuffer(); });
  const [r, s, b, h, logo] = await Promise.all([
    load('fonts/SourceSans3-Regular.ttf'), load('fonts/SourceSans3-SemiBold.ttf'), load('fonts/SourceSans3-Bold.ttf'),
    load('fonts/Oswald-SemiBold.ttf'), load('icons/logo.png'),
  ]);
  assetCache = { r, s, b, h, logo };
  return assetCache;
}

const dataUrlBytes = (u) => Uint8Array.from(atob(u.split(',')[1]), (ch) => ch.charCodeAt(0));
// znaky, které písmo nemá
const clean = (t) => String(t ?? '').replace(/⌀/g, 'Ø').replace(/[✂✓✔]/g, '').replace(/ /g, ' ');

class Ctx {
  constructor(doc, f, header) { this.doc = doc; this.f = f; this.header = header; this.pages = []; this.dry = false; }
  page() { this.p = this.doc.addPage([W, H]); this.pages.push(this.p); this.y = M; this.header?.(this, this.pages.length > 1); }
  text(t, x, y, { font = this.f.r, size = 10, color = C.ink } = {}) {
    if (!this.dry) this.p.drawText(clean(t), { x, y: H - y - size * 0.8, size, font, color });
  }
  width(t, font = this.f.r, size = 10) { return font.widthOfTextAtSize(clean(t), size); }
  wrap(t, maxW, font = this.f.r, size = 10) {
    const out = [];
    for (const para of clean(t).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  }
  para(t, x, maxW, opts = {}) {
    const size = opts.size || 10, lh = opts.lh || size * 1.3;
    for (const l of this.wrap(t, maxW, opts.font || this.f.r, size)) { this.text(l, x, this.y, opts); this.y += lh; }
  }
  rect(x, y, w, h, o = {}) { if (!this.dry) this.p.drawRectangle({ x, y: H - y - h, width: w, height: h, ...o }); }
  line(x1, y, x2, o = {}) { if (!this.dry) this.p.drawLine({ start: { x: x1, y: H - y }, end: { x: x2, y: H - y }, thickness: 0.8, color: C.line, ...o }); }
  ellipse(x, y, xs, ys, o = {}) { if (!this.dry) this.p.drawEllipse({ x, y: H - y, xScale: xs, yScale: ys, ...o }); }
  image(img, x, y, w, h) { if (!this.dry) this.p.drawImage(img, { x, y: H - y - h, width: w, height: h }); }
  // vykreslí blok, a když se nevejde, začne novou stranu
  block(fn, reserve = 60) {
    const y0 = this.y; this.dry = true; fn(); const h = this.y - y0; this.y = y0; this.dry = false;
    if (this.y + h > H - M - reserve) this.page();
    fn();
  }
  sectionTitle(t) {
    this.text(t, M, this.y, { font: this.f.h, size: 9.5, color: C.bronze });
    this.y += 11.5; this.line(M, this.y, W - M); this.y += 4;
  }
}

async function setup(title) {
  const a = await assets();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title); doc.setAuthor('Kominictví Klimesch'); doc.setCreator('Kominictví Komplet');
  const f = {
    r: await doc.embedFont(a.r), s: await doc.embedFont(a.s), b: await doc.embedFont(a.b), h: await doc.embedFont(a.h),
  };
  const logo = await doc.embedPng(a.logo);
  return { doc, f, logo };
}

function drawHeader(ctx, { logo, title, sub, no, date, cont }) {
  const top = ctx.y;
  ctx.rect(M, top, 46, 51, { color: C.dark });
  const lw = 40, lh = lw * logo.height / logo.width;
  ctx.image(logo, M + 3, top + (51 - Math.min(lh, 47)) / 2, Math.min(lw, 47 * logo.width / logo.height), Math.min(lh, 47));
  const tx = M + 58;
  const lines = title.split('\n');
  lines.forEach((l, i) => ctx.text(l, tx, top + 2 + i * 17, { font: ctx.f.h, size: 14.5 }));
  ctx.text(cont ? `${sub} · pokračování` : sub, tx, top + 6 + lines.length * 17, { size: 8.5, color: C.muted });
  const bw = 132, bx = W - M - bw;
  if (!ctx.dry) ctx.p.drawRectangle({ x: bx, y: H - top - 51, width: bw, height: 51, borderColor: C.bronze2, borderWidth: 1.4 });
  ctx.text(no.label, bx + 9, top + 6, { font: ctx.f.b, size: 7, color: C.bronze });
  ctx.text(no.value, bx + 9, top + 15, { font: ctx.f.h, size: 13.5 });
  ctx.text('DATUM', bx + 9, top + 33, { font: ctx.f.b, size: 7, color: C.bronze });
  ctx.text(date, bx + 9, top + 41, { font: ctx.f.b, size: 9.5 });
  ctx.y = top + 56;
  ctx.line(M, ctx.y, W - M, { thickness: 2, color: C.bronze2 });
  ctx.y += 8;
}

function parties(ctx, s, customer, object, rightTitle = 'OBJEDNATEL') {
  const colW = (W - 2 * M - 16) / 2;
  const firma = s.firma;
  const left = [
    [firma.jmeno, ctx.f.b, 10.5], [firma.opravneni, ctx.f.r, 7.5, C.muted], [firma.adresa], [`IČO: ${firma.ico}`],
    [`tel. ${firma.telefon} · ${firma.email}`],
  ];
  const a = object?.address || {};
  const right = [
    [displayName(customer), ctx.f.b, 10.5],
    ...(customer.ico ? [[`IČO: ${customer.ico}`]] : []),
    ...(customer.phones?.length ? [[`tel. ${customer.phones.join(', ')}`]] : []),
    ...(customer.email && rightTitle === 'ZADAVATEL' ? [[`e-mail: ${customer.email}`]] : []),
    ...(object ? [['Adresa objektu', ctx.f.r, 7.5, C.muted], [[a.street, [a.zip, a.city].filter(Boolean).join(' '), rightTitle === 'ZADAVATEL' && a.district ? `okres ${a.district}` : ''].filter(Boolean).join(', ')]] : []),
  ];
  const top = ctx.y;
  const col = (x, title, rows) => {
    ctx.y = top;
    ctx.text(title, x, ctx.y, { font: ctx.f.h, size: 9.5, color: C.bronze }); ctx.y += 13;
    ctx.line(x, ctx.y, x + colW); ctx.y += 4;
    for (const [t, font = ctx.f.r, size = 9, color = C.ink] of rows) ctx.para(t, x, colW, { font, size, color, lh: size * 1.32 });
    return ctx.y;
  };
  const y1 = col(M, 'OPRÁVNĚNÁ OSOBA', left);
  const y2 = col(M + colW + 16, rightTitle, right);
  ctx.y = Math.max(y1, y2) + 8;
}

function specRows(k) {
  const rows = [['Palivo', `${FUEL_LABEL[k.fuel] || ''}${k.condensing ? ' · kondenzační kotel' : ''} · ústřední topení ${k.ut ? 'ano' : 'ne'}`]];
  k.appliances.forEach((a, i) => {
    const n = k.appliances.length > 1 ? ` ${i + 1}` : '';
    const kind = a.kind === 'jiný' ? a.kindOther : a.kind;
    const place = [...(a.placement || []).filter((p) => p !== 'jiné'), a.placement?.includes('jiné') ? a.placementOther : ''].filter(Boolean).join(', ');
    rows.push([`Spotřebič${n}`, [kind, a.brand, a.kw ? `${a.kw} kW` : '', a.floor].filter(Boolean).join(' · ')]);
    if (place) rows.push([`Umístění${n}`, place]);
    const fl = a.flue || {};
    const mat = fl.material === 'jiný' ? fl.materialOther : fl.material;
    const flue = [mat, fl.diameter ? `Ø ${fl.diameter} mm` : '', fl.length ? `${String(fl.length).replace('.', ',')} m` : '', elbowsText(fl.elbows)].filter(Boolean).join(' · ');
    if (flue) rows.push([`Kouřovod${n}`, flue]);
  });
  if (k.body?.length) rows.push(['Komínové těleso', k.body.join(', ')]);
  const lin = k.liner || {};
  const linMat = lin.material === 'jiná' ? lin.materialOther : lin.material;
  if (linMat) rows.push(['Vložka', [linMat, lin.diameter ? `Ø ${lin.diameter} mm` : ''].filter(Boolean).join(' · ')]);
  rows.push(['Revizní zpráva č.', k.revisionMissing || !k.revisionNo ? 'nedoloženo' : k.revisionNo]);
  if (k.height) rows.push(['Účinná výška', `${String(k.height).replace('.', ',')} m`]);
  return rows;
}

function chimneyBlock(ctx, k, idx, total, stampImgs) {
  const mark = total > 1 ? `${idx + 1}) ` : '';
  ctx.sectionTitle(`${mark}SPECIFIKACE SPALINOVÉ CESTY, U KTERÉ BYLA PROVEDENA KONTROLA A ČIŠTĚNÍ`);
  const rows = specRows(k);
  const colW = (W - 2 * M - 16) / 2;
  const labelW = 84;
  // dvousloupcová mřížka
  for (let i = 0; i < rows.length; i += 2) {
    const top = ctx.y; let bottom = top;
    [rows[i], rows[i + 1]].forEach((r, j) => {
      if (!r) return;
      const x = M + j * (colW + 16);
      ctx.y = top;
      ctx.text(r[0], x, ctx.y, { size: 8.5, color: C.muted });
      ctx.para(r[1], x + labelW, colW - labelW, { font: ctx.f.s, size: 9, lh: 11.5 });
      bottom = Math.max(bottom, ctx.y);
    });
    ctx.y = bottom + 1;
    ctx.line(M, ctx.y, M + colW, { thickness: 0.4 }); ctx.line(M + colW + 16, ctx.y, W - M, { thickness: 0.4 });
    ctx.y += 2.5;
  }
  ctx.y += 4;

  ctx.sectionTitle(`${mark}ZJIŠTĚNÉ NEDOSTATKY`);
  const kv = (l, v) => { const top = ctx.y; ctx.text(l, M, top, { size: 8.5, color: C.muted }); ctx.para(v, M + 130, W - 2 * M - 130, { font: ctx.f.s, size: 9, lh: 11.5 }); ctx.y = Math.max(ctx.y, top + 11.5) + 1; };
  const fixed = [k.fixed.noDefects ? 'bez viditelných závad' : '', k.fixed.text.trim(), k.fixed.camera ? 'provedena prohlídka inspekční kamerou' : ''].filter(Boolean).join(' · ');
  kv('Odstraněné na místě', fixed || '—');
  const defects = defectsText(k);
  kv('Neodstraněné na místě', defects.length ? defects.join(' · ') : 'nebyly zjištěny');
  if (defects.length) kv('Termín odstranění', k.deadline.mode === 'neprodlene' ? 'neprodleně' : k.deadline.mode === 'datum' && k.deadline.date ? `do ${fmtDate(parseIso(k.deadline.date))}` : 'nebyl stanoven');
  ctx.y += 4;

  const recs = recsText(k);
  if (recs.length) {
    ctx.sectionTitle(`${mark}DALŠÍ DOPORUČENÍ Z HLEDISKA PROTIPOŽÁRNÍ BEZPEČNOSTI A SNÍŽENÍ RIZIKA OTRAVY DLE ČSN 73 4201`);
    ctx.para(recs.join(' · '), M, W - 2 * M, { font: ctx.f.s, size: 9, lh: 11.5 });
    ctx.y += 4;
  }

  // závěr s razítkem a podpisem vpravo
  const top = ctx.y, h = 58;
  ctx.rect(M, top, W - 2 * M, h, { color: C.soft });
  ctx.text(`${mark}ZÁVĚR – SPALINOVÁ CESTA Z HLEDISKA BEZPEČNÉHO PROVOZU`, M + 12, top + 9, { font: ctx.f.h, size: 9.5, color: C.bronze });
  const concl = label(CONCLUSIONS, k.conclusion);
  const cw = ctx.width(concl, ctx.f.h, 13) + 20;
  if (!ctx.dry) ctx.p.drawRectangle({ x: M + 12, y: H - top - 50, width: cw, height: 22, borderColor: C.ink, borderWidth: 1.4 });
  ctx.text(concl, M + 22, top + 32, { font: ctx.f.h, size: 13 });
  stampAndSign(ctx, W - M - 150, top + 1, stampImgs, 'razítko a podpis oprávněné osoby');
  ctx.y = top + h + 6;
}

function stampAndSign(ctx, x, y, { stamp, sign }, caption) {
  if (stamp) {
    const w = 120, h = Math.min(56, w * stamp.height / stamp.width);
    ctx.image(stamp, x + 15, y + 2, h * stamp.width / stamp.height, h);
  } else {
    ctx.ellipse(x + 75, y + 30, 55, 25, { borderColor: C.stamp, borderWidth: 1.3 });
    ctx.text('KOMINICTVÍ', x + 75 - ctx.width('KOMINICTVÍ', ctx.f.b, 7) / 2, y + 17, { font: ctx.f.b, size: 7, color: C.stamp });
    ctx.text('JAN KLIMESCH', x + 75 - ctx.width('JAN KLIMESCH', ctx.f.b, 7) / 2, y + 26, { font: ctx.f.b, size: 7, color: C.stamp });
    ctx.text('(razítko doplníš v Nastavení)', x + 75 - ctx.width('(razítko doplníš v Nastavení)', ctx.f.r, 6) / 2, y + 36, { size: 6, color: C.stamp });
  }
  if (sign) {
    const h = 32, w = h * sign.width / sign.height;
    ctx.image(sign, x + 75 - Math.min(w, 130) / 2, y + 16, Math.min(w, 130), Math.min(w, 130) * sign.height / sign.width);
  }
  ctx.text(caption, x + 75 - ctx.width(caption, ctx.f.r, 7) / 2, y + 49, { size: 7, color: C.muted });
}

function receipt(ctx, d, customer, s, payerSign, stampImgs, standalone) {
  const items = d.payment.items;
  const total = paymentTotal(items);
  if (!standalone) {
    ctx.y += 4;
    if (!ctx.dry) ctx.p.drawLine({ start: { x: M, y: H - ctx.y }, end: { x: W - M, y: H - ctx.y }, thickness: 0.9, color: C.bronze2, dashArray: [4, 3] });
    ctx.text('odstřihnout', W - M - ctx.width('odstřihnout', ctx.f.r, 6.5), ctx.y + 2, { size: 6.5, color: C.muted });
    ctx.y += 9;
    ctx.text('PŘÍJMOVÝ POKLADNÍ DOKLAD', M, ctx.y, { font: ctx.f.h, size: 12.5 });
    const right = `č. ${d.no}  ze dne ${fmtDate(parseIso(d.date))}`;
    ctx.text(right, W - M - ctx.width(right, ctx.f.b, 9.5), ctx.y + 3, { font: ctx.f.b, size: 9.5 });
    ctx.y += 17;
  }
  if (d.kind === 'doklad' && d.purpose) { ctx.text('Účel platby', M, ctx.y, { size: 8.5, color: C.muted }); ctx.para(d.purpose, M + 90, W - 2 * M - 90, { font: ctx.f.s, size: 9.5 }); ctx.y += 2; }
  // položky
  for (const it of items) {
    const sum = (Number(it.qty) || 0) * (Number(it.price) || 0);
    const qty = `${String(it.qty).replace('.', ',')} ${it.unit || 'ks'} × ${Number(it.price).toLocaleString('cs-CZ')} Kč`;
    const amount = `${sum.toLocaleString('cs-CZ')} Kč`;
    ctx.text(it.label, M, ctx.y, { size: 9.5 });
    ctx.text(qty, W - M - 170, ctx.y, { size: 9, color: C.muted });
    ctx.text(amount, W - M - ctx.width(amount, ctx.f.b, 9.5), ctx.y, { font: ctx.f.b, size: 9.5 });
    ctx.y += 12;
  }
  ctx.line(M, ctx.y, W - M); ctx.y += 4;
  const paid = d.payment.method === 'faktura' ? 'fakturou – faktura bude zaslána zvlášť' : METHODS[d.payment.method] || '';
  ctx.text(`Přijato od: ${displayName(customer)}`, M, ctx.y, { size: 9.5 });
  const tot = `Celkem ${total.toLocaleString('cs-CZ')} Kč`;
  ctx.text(tot, W - M - ctx.width(tot, ctx.f.h, 13), ctx.y - 2, { font: ctx.f.h, size: 13, color: C.bronze });
  ctx.y += 13;
  ctx.text(`Způsob platby: ${paid}`, M, ctx.y, { size: 9.5 });
  ctx.text(s.firma.dph, W - M - ctx.width(s.firma.dph, ctx.f.r, 8), ctx.y + 1, { size: 8, color: C.muted });
  ctx.y += 12;
  const top = ctx.y;
  if (d.payment.method !== 'faktura') {
    if (payerSign) { const h = 34, w = Math.min(150, h * payerSign.width / payerSign.height); ctx.image(payerSign, M + 20, top, w, w * payerSign.height / payerSign.width); }
    ctx.line(M, top + 40, M + 190, { color: C.muted });
    ctx.text('podpis plátce', M + 95 - ctx.width('podpis plátce', ctx.f.r, 7) / 2, top + 43, { size: 7, color: C.muted });
  }
  stampAndSign(ctx, W - M - 150, top - 8, stampImgs, `přijal: ${s.firma.jmeno.split('–')[0].trim()}`);
  ctx.y = top + 52;
}

function footers(ctx, s, no) {
  const n = ctx.pages.length;
  ctx.pages.forEach((p, i) => {
    const y = 26;
    p.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.6, color: C.line });
    p.drawText(clean(`${s.firma.znacka} · tel. ${s.firma.telefon} · ${s.firma.email}${s.firma.web ? ` · ${s.firma.web}` : ''}`), { x: M, y, size: 7.5, font: ctx.f.r, color: C.muted });
    const right = n > 1 ? `${no} · list ${i + 1} z ${n}` : no;
    p.drawText(clean(right), { x: W - M - ctx.f.r.widthOfTextAtSize(clean(right), 7.5), y, size: 7.5, font: ctx.f.r, color: C.muted });
  });
}

async function images(doc, d, s) {
  const emb = async (u) => (u ? doc.embedPng(dataUrlBytes(u)) : null);
  return { stamp: await emb(s.firma.razitko), sign: await emb(s.firma.podpis), payer: await emb(d.signature) };
}

function protocolBody(ctx, d, imgs) {
  const p = d.protocol;
  const chimney = null;
  ctx.sectionTitle('ÚDAJE O SPALINOVÉ CESTĚ A SPOTŘEBIČI');
  if (p.checkReportNo) { ctx.text('Číslo kontrolní zprávy', M, ctx.y, { size: 8.5, color: C.muted }); ctx.text(p.checkReportNo, M + 190, ctx.y, { font: ctx.f.s, size: 9.5 }); ctx.y += 14; }
  for (const [l, v] of protocolRows(p, chimney)) {
    const top = ctx.y;
    ctx.para(l, M, 180, { size: 8.5, color: C.muted, lh: 11 });
    const yl = ctx.y; ctx.y = top;
    ctx.para(v, M + 190, W - 2 * M - 190, { font: ctx.f.s, size: 9.5, lh: 12 });
    ctx.y = Math.max(ctx.y, yl) + 1.5;
    ctx.line(M, ctx.y, W - M, { thickness: 0.4 }); ctx.y += 3;
  }
  ctx.y += 6;
  ctx.sectionTitle('ZJIŠTĚNÉ NEDOSTATKY');
  const defects = protocolDefects(p);
  const kv = (l, v) => { const top = ctx.y; ctx.text(l, M, top, { size: 8.5, color: C.muted }); ctx.para(v, M + 190, W - 2 * M - 190, { font: ctx.f.s, size: 9.5, lh: 12 }); ctx.y = Math.max(ctx.y, top + 12) + 2; };
  kv('Odstraněné na místě', p.fixedText || 'žádné');
  kv('Neodstraněné na místě', defects.length ? defects.join(' · ') : 'žádné');
  kv('Termín odstranění nedostatků', defects.length ? (p.deadline.mode === 'neprodlene' ? 'neprodleně' : p.deadline.mode === 'datum' && p.deadline.date ? `do ${fmtDate(parseIso(p.deadline.date))}` : 'nebyl stanoven') : 'nebyl stanoven');
  ctx.y += 10;
  // Zapsal (razítko + podpis) a podpis objednavatele
  const top = ctx.y;
  stampAndSign(ctx, M, top, imgs, 'zapsal: razítko a podpis');
  if (imgs.payer) { const h = 34, w = Math.min(150, h * imgs.payer.width / imgs.payer.height); ctx.image(imgs.payer, W - M - 170, top + 8, w, w * imgs.payer.height / imgs.payer.width); }
  ctx.line(W - M - 190, top + 48, W - M, { color: C.muted });
  ctx.text('podpis objednavatele', W - M - 95 - ctx.width('podpis objednavatele', ctx.f.r, 7) / 2, top + 51, { size: 7, color: C.muted });
  ctx.y = top + 64;
}

export async function buildVisitPdf(d, customer, s) {
  const object = customer.objects.find((o) => o.id === d.objectId) || customer.objects[0];
  if (d.kind === 'protokol') {
    const { doc, f, logo } = await setup(`Protokol ${d.no}`);
    const imgs = await images(doc, d, s);
    const header = (ctx, cont) => drawHeader(ctx, { logo, cont, title: 'PROTOKOL – REVIZE\nSPALINOVÉ CESTY', sub: 'podklad pro revizi spalinové cesty', no: { label: 'PROTOKOL Č.', value: d.no }, date: fmtDate(parseIso(d.date)) });
    const ctx = new Ctx(doc, f, header);
    ctx.page();
    parties(ctx, s, customer, object, 'ZADAVATEL');
    protocolBody(ctx, d, imgs);
    const y0 = ctx.y; ctx.dry = true; receipt(ctx, d, customer, s, imgs.payer, imgs, false); const h = ctx.y - y0; ctx.y = y0; ctx.dry = false;
    const bottom = H - M - 22;
    if (ctx.y + h > bottom) ctx.page();
    ctx.y = Math.max(ctx.y, bottom - h);
    receipt(ctx, d, customer, s, imgs.payer, imgs, false);
    footers(ctx, s, d.no);
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }
  const isReport = d.kind !== 'doklad';
  const title = isReport ? `Zpráva ${d.no}` : `Doklad ${d.no}`;
  const { doc, f, logo } = await setup(title);
  const imgs = await images(doc, d, s);
  const header = (ctx, cont) => drawHeader(ctx, {
    logo, cont,
    title: isReport ? 'ZPRÁVA O PROVEDENÍ ČIŠTĚNÍ\nA KONTROLY SPALINOVÉ CESTY' : 'PŘÍJMOVÝ\nPOKLADNÍ DOKLAD',
    sub: isReport ? 'dle vyhlášky č. 34/2016 Sb., příloha č. 3' : s.firma.dph,
    no: { label: isReport ? 'ZPRÁVA Č.' : 'DOKLAD Č.', value: d.no }, date: fmtDate(parseIso(d.date)),
  });
  const ctx = new Ctx(doc, f, header);
  ctx.page();
  parties(ctx, s, customer, isReport ? object : null);
  if (isReport) {
    d.chimneys.forEach((k, i) => ctx.block(() => chimneyBlock(ctx, k, i, d.chimneys.length, imgs), 20));
    ctx.text('Zpráva vydána v souladu s vyhláškou č. 34/2016 Sb., o čištění, kontrole a revizi spalinové cesty, příloha č. 3.', M, ctx.y, { size: 7.5, color: C.muted });
    ctx.y += 12;
    // platební část jen na poslední straně, ukotvená dole (pod ✂)
    const y0 = ctx.y; ctx.dry = true; receipt(ctx, d, customer, s, imgs.payer, imgs, false); const h = ctx.y - y0; ctx.y = y0; ctx.dry = false;
    const bottom = H - M - 22;
    if (ctx.y + h > bottom) ctx.page();
    ctx.y = Math.max(ctx.y, bottom - h);
    receipt(ctx, d, customer, s, imgs.payer, imgs, false);
  } else {
    ctx.sectionTitle('POLOŽKY');
    receipt(ctx, d, customer, s, imgs.payer, imgs, true);
  }
  footers(ctx, s, d.no);
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

export function pdfFileName(d, customerName) {
  const safe = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${{ doklad: 'Doklad', protokol: 'Protokol-revize' }[d.kind] || 'Zprava'}-${safe(d.no)}-${safe(customerName)}.pdf`;
}

// ---------- Faktura a cenová nabídka ----------
import qrcode from '../vendor/qrcode.mjs';
import { spdString } from './payment.js';
import { offerTotals, customerUnitPrice } from './finance.js';

function drawQr(ctx, text, x, y, size) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(); const cell = size / n;
  ctx.rect(x - 4, y - 4, size + 8, size + 8, { color: C.white });
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.rect(x + c * cell, y + r * cell, cell + 0.15, cell + 0.15, { color: C.ink });
}

function boxes(ctx, s, customer, rightTitle, extraRight = []) {
  const colW = (W - 2 * M - 14) / 2;
  const top = ctx.y;
  const left = [[s.firma.jmeno, ctx.f.b, 10.5], [s.firma.adresa], [`IČO: ${s.firma.ico} · ${s.firma.dph}`], [`tel. ${s.firma.telefon} · ${s.firma.email}`]];
  const a = customer.objects?.[0]?.address || {};
  const right = [[displayName(customer), ctx.f.b, 10.5], ...(a.street ? [[[a.street, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')]] : []), ...(customer.ico ? [[`IČO: ${customer.ico}`]] : []), ...(customer.email ? [[customer.email]] : []), ...extraRight];
  const draw = (x, title, rows, fill) => {
    ctx.y = top + 8;
    const h0 = ctx.y;
    ctx.text(title, x + 10, ctx.y, { font: ctx.f.b, size: 7.5, color: C.bronze }); ctx.y += 12;
    for (const [t, font = ctx.f.r, size = 9.5] of rows) ctx.para(t, x + 10, colW - 20, { font, size, lh: size * 1.32 });
    return ctx.y + 8 - h0 + 8;
  };
  ctx.dry = true; const h1 = draw(M, 'DODAVATEL', left); const h2 = draw(M + colW + 14, rightTitle, right); ctx.dry = false;
  const h = Math.max(h1, h2);
  ctx.rect(M, top, colW, h, { color: C.soft });
  if (!ctx.dry) ctx.p.drawRectangle({ x: M + colW + 14, y: H - top - h, width: colW, height: h, borderColor: C.line, borderWidth: 1.2 });
  draw(M, 'DODAVATEL', left); draw(M + colW + 14, rightTitle, right);
  ctx.y = top + h + 12;
}

function table(ctx, head, rows, groups) {
  const cols = [W - 2 * M - 270, 70, 90, 110];
  const xs = [M, M + cols[0], M + cols[0] + cols[1], M + cols[0] + cols[1] + cols[2]];
  ctx.rect(M, ctx.y, W - 2 * M, 18, { color: C.bronze2 });
  head.forEach((h, i) => {
    const x = i === 0 ? xs[0] + 8 : xs[i] + cols[i] - 8 - ctx.width(h, ctx.f.b, 7.5);
    ctx.text(h, x, ctx.y + 5, { font: ctx.f.b, size: 7.5, color: C.white });
  });
  ctx.y += 22;
  const drawRow = (r) => {
    const top = ctx.y;
    ctx.para(r[0], xs[0] + 8, cols[0] - 12, { size: 9.5, lh: 12 });
    if (r.sub) ctx.para(r.sub, xs[0] + 8, cols[0] - 12, { size: 8, color: C.muted, lh: 10 });
    [r[1], r[2], r[3]].forEach((t, j) => { const i = j + 1; ctx.text(t, xs[i] + cols[i] - 8 - ctx.width(t, i === 3 ? ctx.f.b : ctx.f.r, 9.5), top, { size: 9.5, font: i === 3 ? ctx.f.b : ctx.f.r, color: i === 3 ? C.ink : C.muted }); });
    ctx.y = Math.max(ctx.y, top + 12) + 3;
    ctx.line(M, ctx.y, W - M, { thickness: 0.5 }); ctx.y += 4;
  };
  if (groups) for (const g of groups) { if (!g.rows.length) continue; ctx.text(g.title, M + 8, ctx.y, { font: ctx.f.b, size: 7.5, color: C.bronze }); ctx.y += 12; g.rows.forEach(drawRow); }
  else rows.forEach(drawRow);
}

const kc = (n) => `${Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ')} Kč`;
const kcu = (n) => `${Number(n).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }).replace(/ /g, ' ')} Kč`;

export async function buildInvoicePdf(inv, customer, s, docs = []) {
  const { doc, f, logo } = await setup(`Faktura ${inv.no}`);
  const imgs = await images(doc, {}, s);
  const header = (ctx, cont) => drawHeader(ctx, { logo, cont, title: 'FAKTURA', sub: s.firma.dph, no: { label: 'FAKTURA Č.', value: inv.no }, date: fmtDate(parseIso(inv.date)) });
  const ctx = new Ctx(doc, f, header);
  ctx.page();
  boxes(ctx, s, customer, 'ODBĚRATEL');
  // údaje
  const facts = [['Datum vystavení', fmtDate(parseIso(inv.date))], ['Datum splatnosti', fmtDate(parseIso(inv.due))], ['Variabilní symbol', inv.vs], ['Forma úhrady', 'převodem'], ['K úhradě', kc(inv.total)]];
  const fw = (W - 2 * M) / 5;
  if (!ctx.dry) ctx.p.drawRectangle({ x: M, y: H - ctx.y - 34, width: W - 2 * M, height: 34, borderColor: C.line, borderWidth: 1.2 });
  ctx.rect(M + fw * 4, ctx.y, fw, 34, { color: C.soft });
  facts.forEach(([l, v], i) => { ctx.text(l.toUpperCase(), M + fw * i + 8, ctx.y + 6, { font: ctx.f.b, size: 6.5, color: C.bronze }); ctx.text(v, M + fw * i + 8, ctx.y + 17, { font: ctx.f.b, size: 10 }); });
  ctx.y += 46;
  table(ctx, ['OZNAČENÍ DODÁVKY', 'POČET', 'CENA / J.', 'CELKEM'], inv.items.map((i) => Object.assign([i.label, `${String(i.qty).replace('.', ',')} ${i.unit || 'ks'}`, kcu(i.price), kc((Number(i.qty) || 0) * (Number(i.price) || 0))], { sub: i.sub || '' })));
  ctx.y += 8;
  // QR a platba
  const top = ctx.y;
  const spd = spdString({ account: s.firma.ucet, amount: inv.total, vs: inv.vs, message: `Faktura ${inv.no}` });
  ctx.rect(M, top, 300, 108, { color: C.soft });
  if (spd) { drawQr(ctx, spd, M + 12, top + 12, 78); ctx.text('QR Platba', M + 30, top + 94, { font: ctx.f.b, size: 7.5, color: C.muted }); }
  const px = M + (spd ? 104 : 12);
  ctx.text('PLATEBNÍ ÚDAJE', px, top + 12, { font: ctx.f.b, size: 7.5, color: C.bronze });
  ctx.text(`Číslo účtu: ${s.firma.ucet || 'doplň v Nastavení → Firma a já'}`, px, top + 26, { size: 9.5, font: ctx.f.s });
  ctx.text(`Variabilní symbol: ${inv.vs}`, px, top + 40, { size: 9.5, font: ctx.f.s });
  ctx.text('Způsob platby: převodem', px, top + 54, { size: 9.5 });
  if (spd) { ctx.text('Naskenujte QR kód v bankovní aplikaci –', px, top + 72, { size: 8, color: C.muted }); ctx.text('částka, účet i VS se vyplní samy.', px, top + 82, { size: 8, color: C.muted }); }
  const tl = 'Celkem k úhradě';
  ctx.text(tl, W - M - ctx.width(tl, ctx.f.b, 10.5), top + 24, { font: ctx.f.b, size: 10.5 });
  ctx.text(kc(inv.total), W - M - ctx.width(kc(inv.total), ctx.f.h, 24), top + 40, { font: ctx.f.h, size: 24, color: C.bronze });
  const dl = `splatnost do ${fmtDate(parseIso(inv.due))}`;
  ctx.text(dl, W - M - ctx.width(dl, ctx.f.r, 8.5), top + 72, { size: 8.5, color: C.muted });
  ctx.y = top + 122;
  const nos = docs.map((d) => d.no);
  const allDoklad = docs.length && docs.every((d) => d.kind === 'doklad');
  const txt = inv.note || (nos.length ? `Fakturuji Vám za provedené ${allDoklad ? 'kominické práce' : 'kontroly a čištění spalinových cest'}. ${nos.length === 1 ? `${allDoklad ? 'Doklad' : 'Zpráva'} č. ${nos[0]} je přiložen${allDoklad ? '' : 'a'}` : `Dokumenty č. ${nos.join(', ')} jsou přiloženy`} k této faktuře. Dodavatel není plátcem DPH.` : 'Dodavatel není plátcem DPH.');
  ctx.para(txt, M, W - 2 * M, { size: 9.5, color: C.muted });
  const sy = H - M - 120;
  ctx.y = Math.max(ctx.y + 10, sy);
  ctx.text('Fyzická osoba zapsaná v živnostenském rejstříku.', M, ctx.y + 30, { size: 8.5, color: C.muted });
  ctx.text('Děkuji za důvěru a těším se na další spolupráci.', M, ctx.y + 42, { size: 8.5, color: C.muted });
  stampAndSign(ctx, W - M - 150, ctx.y, imgs, `vystavil: ${s.firma.jmeno.split('–')[0].trim()}`);
  footers(ctx, s, inv.no);
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

export async function buildOfferPdf(o, customer, s) {
  const { doc, f, logo } = await setup(`Cenová nabídka ${o.no}`);
  const imgs = await images(doc, {}, s);
  const header = (ctx, cont) => drawHeader(ctx, { logo, cont, title: 'CENOVÁ NABÍDKA', sub: s.firma.slogan, no: { label: 'NABÍDKA Č.', value: o.no }, date: fmtDate(parseIso(o.date)) });
  const ctx = new Ctx(doc, f, header);
  ctx.page();
  boxes(ctx, s, customer, 'PRO', [[`platnost do ${fmtDate(parseIso(o.validUntil))}`, ctx.f.b, 9.5]]);
  ctx.text('PŘEDMĚT NABÍDKY', M, ctx.y, { font: ctx.f.b, size: 7.5, color: C.bronze }); ctx.y += 11;
  ctx.para(o.subject || 'Kominické práce', M, W - 2 * M, { font: ctx.f.h, size: 15, lh: 19 });
  if (o.description) { ctx.y += 2; ctx.para(o.description, M, W - 2 * M, { size: 9.5, color: C.muted, lh: 12.5 }); }
  ctx.y += 10;
  const grp = (g, title) => ({ title, rows: o.items.filter((i) => i.group === g).map((i) => { const up = customerUnitPrice(o, i); return [i.label, `${String(i.qty).replace('.', ',')} ${i.unit || 'ks'}`, i.unit === 'paušál' ? 'paušál' : kcu(up), kc(Math.round((Number(i.qty) || 0) * up))]; }) });
  table(ctx, ['POLOŽKA', 'MNOŽSTVÍ', 'CENA / J.', 'CELKEM'], null, [grp('prace', 'PRÁCE'), grp('material', 'MATERIÁL'), grp('doprava', 'DOPRAVA')]);
  const t = offerTotals(o);
  ctx.y += 4;
  const tl = 'Celková cena';
  ctx.text(tl, W - M - 120 - ctx.width(tl, ctx.f.b, 10.5), ctx.y + 8, { font: ctx.f.b, size: 10.5 });
  ctx.text(kc(t.total), W - M - ctx.width(kc(t.total), ctx.f.h, 20), ctx.y, { font: ctx.f.h, size: 20, color: C.bronze });
  ctx.y += 26;
  const nd = `${s.firma.dph} · cena je konečná`;
  ctx.text(nd, W - M - ctx.width(nd, ctx.f.r, 8), ctx.y, { size: 8, color: C.muted });
  ctx.y += 16;
  if (o.photos?.length) {
    ctx.block(() => {
      ctx.text('FOTODOKUMENTACE', M, ctx.y, { font: ctx.f.b, size: 7.5, color: C.bronze }); ctx.y += 12;
      ctx.y += 100;
    }, 0);
    ctx.y -= 100;
    const pw = (W - 2 * M - 20) / 3;
    for (let i = 0; i < Math.min(3, o.photos.length); i++) {
      try {
        const bytes = dataUrlBytes(o.photos[i]);
        const img = o.photos[i].startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const h = Math.min(92, pw * img.height / img.width); const w = h * img.width / img.height;
        ctx.image(img, M + i * (pw + 10) + (pw - w) / 2, ctx.y, w, h);
      } catch { /* nepodporovaný formát fotky */ }
    }
    ctx.y += 104;
  }
  const sy = Math.max(ctx.y + 10, H - M - 100);
  ctx.y = sy;
  ctx.para(o.terms || 'Termín realizace po dohodě, zpravidla do 3 týdnů od přijetí nabídky. Nabídku stačí potvrdit telefonicky, SMS nebo e-mailem. Rád zodpovím jakékoli dotazy.', M, 300, { size: 8.5, color: C.muted, lh: 11.5 });
  stampAndSign(ctx, W - M - 150, sy - 8, imgs, s.firma.jmeno.split('–')[0].trim());
  footers(ctx, s, o.no);
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
