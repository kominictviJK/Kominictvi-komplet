// Cenová nabídka – položky Práce / Materiál / Doprava, přirážka „jen pro tebe“, fotky, PDF a odeslání
import { get, put, uid } from '../db.js';
import { settings } from '../settings.js';
import { displayName, salutation } from '../customers.js';
import { createOffer, numberOffer, offerTotals, customerUnitPrice } from '../finance.js';
import { createInquiry } from '../planning.js';
import { buildOfferPdf } from '../pdf.js';
import { podpis, sendOut } from '../share.js';
import { pickCustomer, photoData } from './finance.js';
import { hasAi, readReceipt } from '../ai.js';
import { html, toast, modal, parseIso, fmtDate, fmtMoney } from '../ui.js';

const GROUPS = [['prace', 'Práce'], ['material', 'Materiál'], ['doprava', 'Doprava']];

export async function render(el, { args, go }) {
  if (args[0] === 'nova') {
    const c = await pickCustomer('Nabídka pro');
    if (!c) { go('finance/faktury'); return; }
    const o = await createOffer({ customerId: c.id, objectId: c.objects[0]?.id });
    go(`nabidka/${o.id}`);
    return;
  }
  const o = await get('offers', args[0]);
  if (!o) { el.innerHTML = String(html`<div class="card empty">Nabídka nenalezena.</div>`); return; }
  const c = await get('customers', o.customerId);
  draw(el, o, c, go);
}

function draw(el, o, c, go) {
  const s = settings();
  const t = offerTotals(o);
  const save = () => put('offers', { ...o, pdf: null, updatedAt: new Date().toISOString() });
  el.innerHTML = String(html`
    <div class="page-head">
      <a class="btn small" href="#finance-faktury">‹ Finance</a>
      <h1>Nabídka ${o.no || '(koncept)'}</h1>
      <span class="sub">${displayName(c)}</span>
      <span class="grow"></span>
      <button class="btn soft" data-act="preview">Náhled PDF</button>
      <button class="btn primary" data-act="send">Odeslat</button>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start">
      <div>
        <div class="card">
          <label class="field"><span>Předmět nabídky</span><input class="input" id="o-subject" value="${o.subject}" placeholder="např. Vložkování komínu nerezovou vložkou Ø 150 mm"></label>
          <label class="field" style="margin-top:10px"><span>Popis (co nabídka zahrnuje)</span><textarea id="o-desc" rows="3" placeholder="Na základě prohlídky inspekční kamerou navrhuji…">${o.description}</textarea></label>
        </div>
        ${GROUPS.map(([g, label]) => html`
          <div class="card">
            <div class="card-title"><h3>${label}</h3><span class="sub" data-sum="${g}">${fmtMoney(g === 'material' ? t.material : g === 'doprava' ? t.doprava : t.prace)}${g === 'material' && t.materialNakup ? ` (nákup ${fmtMoney(t.materialNakup)})` : ''}</span></div>
            ${o.items.map((it, i) => (it.group !== g ? '' : html`
              <div class="pitem">
                <div class="inline"><input class="input" data-it="${i}.label" value="${it.label}" style="flex:1 1 auto"><button class="btn small" data-del="${i}" aria-label="Odebrat">✕</button></div>
                <div class="inline" style="margin-top:6px">
                  <input class="input" data-it="${i}.qty" value="${it.qty}" inputmode="decimal" style="width:80px"><input class="input" data-it="${i}.unit" value="${it.unit}" style="width:90px"><span class="sub">×</span>
                  <input class="input" data-it="${i}.price" value="${it.price}" inputmode="decimal" style="width:120px"><span class="sub" data-cu="${i}">Kč${g === 'material' ? ` nákup → zákazník ${fmtMoney(customerUnitPrice(o, it))}/j.` : ''}</span>
                </div>
              </div>`))}
            <div class="chips" style="margin-top:8px">
              ${g === 'prace' ? html`<button class="chip" data-add="prace|Práce celkem (paušál)|1|paušál|0">+ paušál za práci</button><button class="chip" data-add="prace|Frézování komínového průduchu|1|m|${s.cenik.frezovaniZaMetr}">+ frézování (m)</button><button class="chip" data-add="prace|Jiná práce|1|ks|0">+ jiná práce</button>` : ''}
              ${g === 'material' ? html`<button class="chip" data-add="material|Materiál|1|ks|0">+ položka materiálu</button><label class="chip">+ načíst fakturu za materiál (foto)<input type="file" accept="image/*" capture="environment" id="mat-photo" hidden></label>` : ''}
              ${g === 'doprava' ? html`<button class="chip" data-add="doprava|Doprava Šternberk a zpět|0|km|${s.cenik.dopravaZaKm}">+ doprava (km × ${s.cenik.dopravaZaKm} Kč)</button>` : ''}
            </div>
            ${g === 'material' && o.materialInvoice ? html`<p class="sub" style="margin-bottom:0">Faktura za materiál je přiložená (vyčtení položek AI přijde v etapě 7). Zapsat ji i do nákladů můžeš ve Financích → Náklady.</p>` : ''}
          </div>`)}
        <div class="card">
          <div class="card-title"><h3>Fotodokumentace</h3><span class="sub">až 3 fotky do PDF</span></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">${o.photos.map((p, i) => html`<span class="ph"><img src="${p}" alt="Foto ${i + 1}"><button class="btn small" data-delph="${i}" aria-label="Odebrat fotku">✕</button></span>`)}
            ${o.photos.length < 3 ? html`<label class="btn soft">+ Přidat fotku<input type="file" accept="image/*" id="o-photo" hidden></label>` : ''}</div>
        </div>
      </div>
      <div>
        <div class="card kpi dark"><span class="label">Celková cena pro zákazníka</span><span class="big" data-total>${fmtMoney(t.total)}</span><span class="sub">${s.firma.dph} · platnost do ${fmtDate(parseIso(o.validUntil))}</span></div>
        <div class="card pocket">
          <h3>Jen pro tebe</h3>
          <label class="field"><span>Přirážka na materiál (%)</span><input class="input" id="o-markup" value="${o.markupPct}" inputmode="decimal"></label>
          <div class="kv"><span>Práce</span><b data-p="prace">${fmtMoney(t.prace)}</b></div>
          <div class="kv"><span>Doprava</span><b data-p="doprava">${fmtMoney(t.doprava)}</b></div>
          <div class="kv"><span>Přirážka na materiálu</span><b data-p="prirazka">${fmtMoney(t.prirazka)}</b></div>
          <div class="kv"><span><b>V kapse</b></span><b data-p="vKapse" style="font-size:20px;color:var(--ok)">${fmtMoney(t.vKapse)}</b></div>
          <p class="sub" style="font-size:12px;margin-bottom:0">Přirážka se v nabídce pro zákazníka nezobrazuje – materiál má rovnou vyšší jednotkovou cenu.</p>
        </div>
        <div class="card">
          <h3 style="margin-bottom:8px">Stav nabídky</h3>
          <div class="chips">${[['draft', 'koncept'], ['sent', 'odesláno'], ['accepted', 'přijato'], ['rejected', 'odmítnuto']].map(([k, l]) => html`<button class="chip ${o.status === k ? 'on' : ''}" data-status="${k}">${l}</button>`)}</div>
          ${o.status === 'accepted' ? html`<p class="sub">Zakázka je v Poptávkách → Ostatní práce, odtud ji naplánuješ.</p>` : ''}
          <label class="field" style="margin-top:10px"><span>Platnost do</span><input class="input" type="date" id="o-valid" value="${o.validUntil}"></label>
        </div>
      </div>
    </div>`);
  const redraw = () => { const y = el.scrollTop; draw(el, o, c, go); el.scrollTop = y; };
  const setIt = (path, v) => { const [i, k] = path.split('.'); o.items[Number(i)][k] = ['qty', 'price'].includes(k) ? (Number(String(v).replace(',', '.')) || 0) : v; };
  // součty se přepočítají bez překreslení (aby se neztratil kurzor v dalším políčku)
  const refresh = () => {
    const x = offerTotals(o);
    el.querySelector('[data-total]').textContent = fmtMoney(x.total);
    for (const k of ['prace', 'doprava', 'prirazka', 'vKapse']) el.querySelector(`[data-p="${k}"]`).textContent = fmtMoney(x[k]);
    el.querySelector('[data-sum="prace"]').textContent = fmtMoney(x.prace);
    el.querySelector('[data-sum="doprava"]').textContent = fmtMoney(x.doprava);
    el.querySelector('[data-sum="material"]').textContent = `${fmtMoney(x.material)}${x.materialNakup ? ` (nákup ${fmtMoney(x.materialNakup)})` : ''}`;
    o.items.forEach((it, i) => { const sp = el.querySelector(`[data-cu="${i}"]`); if (sp && it.group === 'material') sp.textContent = `Kč nákup → zákazník ${fmtMoney(customerUnitPrice(o, it))}/j.`; });
  };
  el.querySelectorAll('[data-it]').forEach((inp) => {
    inp.addEventListener('input', () => { setIt(inp.dataset.it, inp.value); save(); refresh(); });
  });
  el.querySelector('#o-subject').addEventListener('input', (e) => { o.subject = e.target.value; save(); });
  el.querySelector('#o-desc').addEventListener('input', (e) => { o.description = e.target.value; save(); });
  el.querySelector('#o-markup').addEventListener('input', (e) => { o.markupPct = Number(e.target.value.replace(',', '.')) || 0; save(); refresh(); });
  el.querySelector('#o-valid').addEventListener('change', (e) => { o.validUntil = e.target.value; save(); });
  el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => {
    const [group, label, qty, unit, price] = b.dataset.add.split('|');
    o.items.push({ id: uid('i_'), group, label, qty: Number(qty), unit, price: Number(price) });
    await save(); redraw();
  }));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { o.items.splice(Number(b.dataset.del), 1); await save(); redraw(); }));
  el.querySelectorAll('[data-delph]').forEach((b) => b.addEventListener('click', async () => { o.photos.splice(Number(b.dataset.delph), 1); await save(); redraw(); }));
  el.querySelector('#o-photo')?.addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (!f) return; o.photos.push(await photoData(f)); await save(); redraw(); });
  el.querySelector('#mat-photo')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    o.materialInvoice = await photoData(f); await save();
    if (!hasAi()) { toast('Faktura za materiál přiložena'); redraw(); return; }
    toast('Čtu fakturu za materiál…');
    try {
      const r = await readReceipt(o.materialInvoice);
      const items = (r.items || []).filter((i) => i.label && Number(i.price) > 0);
      items.forEach((i) => o.items.push({ id: uid('i_'), group: 'material', label: i.label, qty: Number(i.qty) || 1, unit: i.unit || 'ks', price: Math.round(Number(i.price) * 100) / 100 }));
      await save();
      toast(items.length ? `Načteno ${items.length} položek materiálu (nákupní ceny, přirážka se přičte sama)` : 'Položky se nepodařilo přečíst – doplň ručně');
    } catch (err) { toast(err.message); }
    redraw();
  });
  el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    const prev = o.status;
    o.status = b.dataset.status;
    if (o.status === 'accepted' && prev !== 'accepted') {
      await createInquiry({ customerId: o.customerId, objectId: o.objectId, kind: 'ostatni', stage: 'open', note: `${o.subject || 'Zakázka'} – nabídka ${o.no || ''} přijata (${fmtMoney(offerTotals(o).total)})`, offerId: o.id });
      toast('Zakázka přidána do Poptávek');
    }
    await save(); redraw();
  }));
  const makePdf = async () => {
    await numberOffer(o);
    const pdf = await buildOfferPdf(o, c, settings());
    o.pdf = pdf;
    await put('offers', o);
    return pdf;
  };
  el.querySelector('[data-act="preview"]').addEventListener('click', async () => {
    const pdf = await makePdf();
    await modal({ title: `Nabídka ${o.no}`, body: `<iframe class="pdfview" src="${URL.createObjectURL(pdf)}" title="Náhled nabídky"></iframe>`, actions: [{ label: 'Zavřít', value: null }] });
    redraw();
  });
  el.querySelector('[data-act="send"]').addEventListener('click', async () => {
    const pdf = await makePdf();
    const t2 = offerTotals(o);
    const text = `${salutation(c)} na základě prohlídky Vám v příloze posílám cenovou nabídku č. ${o.no}${o.subject ? ` na ${o.subject.charAt(0).toLowerCase()}${o.subject.slice(1)}` : ''}. Celková cena činí ${fmtMoney(t2.total)} a nabídka platí do ${fmtDate(parseIso(o.validUntil))}. Pokud budete mít jakékoli dotazy, rád je zodpovím. Pro potvrzení stačí odpovědět na tuto zprávu nebo zavolat. ${podpis()}`;
    const file = new File([pdf], `Nabidka-${o.no.replace('/', '-')}.pdf`, { type: 'application/pdf' });
    if (await sendOut({ files: [file], text, title: `Cenová nabídka č. ${o.no}`, customer: c })) { o.status = o.status === 'draft' ? 'sent' : o.status; o.sentAt = new Date().toISOString(); await put('offers', o); }
    redraw();
  });
}
