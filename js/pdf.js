// Tvorba PDF: Zpráva o provedení čištění a kontroly spalinové cesty a Příjmový pokladní doklad
import { PDFDocument, rgb, fontkit } from '../vendor/pdf.mjs';
import { label, CONCLUSIONS, elbowsText } from './catalog.js';
import { defectsText, recsText } from './visit.js';
import { paymentTotal, METHODS } from './payment.js';
import { FUEL_LABEL } from './lhuty.js';
import { displayName } from './customers.js';
import { parseIso, fmtDate } from './ui.js';

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

function parties(ctx, s, customer, object) {
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
    ...(object ? [['Adresa objektu', ctx.f.r, 7.5, C.muted], [[a.street, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')]] : []),
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
  const y2 = col(M + colW + 16, 'OBJEDNATEL', right);
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

export async function buildVisitPdf(d, customer, s) {
  const object = customer.objects.find((o) => o.id === d.objectId) || customer.objects[0];
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
  return `${d.kind === 'doklad' ? 'Doklad' : 'Zprava'}-${safe(d.no)}-${safe(customerName)}.pdf`;
}
