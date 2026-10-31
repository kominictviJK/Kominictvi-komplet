// Finance – Přehled · Faktury a nabídky · Náklady
import { all, get, put } from '../db.js';
import { settings } from '../settings.js';
import { displayName, listCustomers, matches } from '../customers.js';
import { paymentTotal } from '../payment.js';
import {
  revenueByMonth, PAUSAL_LIMITS, invoiceState, reminderDue, documentsToInvoice, createInvoice, sumItems,
  offerTotals, createOffer, CATEGORIES, catLabel, saveExpense, applyRecurring, saveRecurring, guessCategory,
} from '../finance.js';
import { buildInvoicePdf } from '../pdf.js';
import { smsQueue } from '../smsqueue.js';
import { podpis, sendOut } from '../share.js';
import { html, icon, toast, modal, isoDate, parseIso, fmtDate, fmtMoney, monthName, monthShort } from '../ui.js';
import { uid, del } from '../db.js';
import { hasAi, readReceipt } from '../ai.js';
import { pending } from '../sync.js';

const state = { tab: 'prehled', month: null, cat: 'vse' };

export async function render(el, { args, go }) {
  state.tab = args[0] || 'prehled';
  const now = new Date();
  if (!state.month) state.month = isoDate(now).slice(0, 7);
  await applyRecurring(now);
  el.innerHTML = String(html`
    <div class="page-head">
      <h1>Finance</h1>
      <div class="seg">${[['prehled', 'Přehled'], ['faktury', 'Faktury a nabídky'], ['naklady', 'Náklady']].map(([k, l]) => html`<button class="${state.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`)}</div>
      <span class="grow"></span>
      <button class="btn soft" data-act="expense-photo">${icon('plus')} Náklad</button>
    </div>
    <div id="ftab"></div>`);
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => go(`finance/${b.dataset.tab}`)));
  el.querySelector('[data-act="expense-photo"]').addEventListener('click', () => expenseForm(null, () => render(el, { args: ['naklady'], go })));
  const box = el.querySelector('#ftab');
  const rerender = () => render(el, { args: [state.tab, ...args.slice(1)], go });
  if (state.tab === 'faktury') await tabInvoices(box, args[1], go, rerender);
  else if (state.tab === 'naklady') await tabExpenses(box, rerender);
  else await tabOverview(box, go);
}

// ---------- Přehled ----------
async function tabOverview(box, go) {
  const now = new Date();
  const y = now.getFullYear(), mi = now.getMonth();
  const months = await revenueByMonth(y);
  const prev = mi > 0 ? months[mi - 1] : (await revenueByMonth(y - 1))[11];
  const cur = months[mi];
  const yearIncome = months.reduce((s, m) => s + m.income, 0);
  const yearProfit = months.reduce((s, m) => s + m.income - m.cost, 0);
  const s = settings();
  const limit = PAUSAL_LIMITS[s.finance.pausalPasmo] || PAUSAL_LIMITS[1];
  const pct = Math.min(100, Math.round(yearIncome / limit * 100));
  const invs = await all('invoices');
  const unpaid = invs.filter((i) => i.status === 'open');
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.cost)));
  const fuelList = (await all('expenses')).filter((e) => e.category === 'tankovani' && e.date.startsWith(isoDate(now).slice(0, 7))).sort((a, b) => b.date.localeCompare(a.date));
  const rec = s.finance.pravidelne || [];
  const diff = prev.income ? Math.round((cur.income - prev.income) / prev.income * 100) : null;
  box.innerHTML = String(html`
    <div class="grid c3">
      <div class="card kpi"><span class="label">Tržby · ${monthName(mi)}</span><span class="big">${fmtMoney(cur.income)}</span><span class="sub">${diff === null ? 'minulý měsíc bez tržeb' : `${diff >= 0 ? '+' : ''}${diff} % proti minulému měsíci`}</span></div>
      <div class="card kpi"><span class="label">Náklady · ${monthName(mi)}</span><span class="big">${fmtMoney(cur.cost)}</span><span class="sub">tankování ${fmtMoney(cur.fuel)} · materiál ${fmtMoney(cur.material)}</span></div>
      <div class="card kpi dark"><span class="label">Zisk · ${monthName(mi)}</span><span class="big">${fmtMoney(cur.income - cur.cost)}</span><span class="sub">letos celkem ${fmtMoney(yearProfit)}</span></div>
    </div>
    <div class="grid split" style="grid-template-columns:minmax(0,1fr) 320px;margin-top:12px">
      <div class="card">
        <div class="card-title"><h3>Rok ${y} po měsících</h3><span class="legend" style="margin:0"><span><i class="bar" style="background:#A97A1F"></i>tržby</span><span><i class="bar" style="background:#2F6FC0"></i>náklady</span></span></div>
        <div class="chart">${months.map((m, i) => html`<div class="cm ${i === mi ? 'cur' : ''}" title="${monthName(i)}: tržby ${fmtMoney(m.income)}, náklady ${fmtMoney(m.cost)}"><span class="cb in" style="height:${Math.round(m.income / max * 100)}%"></span><span class="cb out" style="height:${Math.round(m.cost / max * 100)}%"></span><small>${monthShort(i)}</small></div>`)}</div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:8px">Jak lidé platili · ${monthName(mi)}</h3>
        ${[['Hotově', cur.cash], ['QR kódem', cur.qr], ['Faktury', cur.invoice]].map(([l, v]) => html`<div class="kv"><span>${l}</span><b>${fmtMoney(v)}</b></div>`)}
        <a class="note-box ${unpaid.length ? '' : 'ok-box'}" href="#finance-faktury" style="text-decoration:none;margin-top:10px">${unpaid.length ? html`<b>${unpaid.length} ${unpaid.length === 1 ? 'faktura neuhrazena' : 'faktury neuhrazené'}</b><span class="grow"></span>${fmtMoney(unpaid.reduce((s2, i) => s2 + i.total, 0))} →` : '✓ Všechny faktury uhrazené'}</a>
      </div>
    </div>
    <div class="grid c3" style="margin-top:12px">
      <div class="card">
        <h3>Limit paušální daně</h3>
        <div class="pbar"><span style="width:${pct}%;background:${pct >= 80 ? 'var(--bad)' : 'var(--bronze)'}"></span></div>
        <p class="sub" style="margin:6px 0 0"><b style="color:var(--ink)">${pct} %</b> z ${fmtMoney(limit)} (${s.finance.pausalPasmo}. pásmo) · letos ${fmtMoney(yearIncome)}</p>
        ${pct >= 80 ? html`<p class="sub" style="color:var(--bad);font-weight:700">Blížíš se limitu pásma!</p>` : html`<p class="sub" style="font-size:12px">Pásmo nastavíš v Nastavení → Finance. Limity si ověř u finančního úřadu nebo účetní.</p>`}
      </div>
      <div class="card">
        <div class="card-title"><h3>Auto · tankování</h3><b>${fmtMoney(cur.fuel)}</b></div>
        ${fuelList.length ? fuelList.slice(0, 4).map((e) => html`<div class="kv"><span>${parseIso(e.date).getDate()}. ${parseIso(e.date).getMonth() + 1}.</span><span class="grow">${e.note || 'tankování'}</span><b>${fmtMoney(e.amount)}</b></div>`) : html`<p class="sub">Tento měsíc zatím nic.</p>`}
      </div>
      <div class="card">
        <div class="card-title"><h3>Pravidelné platby</h3><a href="#finance-naklady" class="sub">upravit</a></div>
        ${rec.length ? rec.map((r) => html`<div class="kv"><span>${r.name}<br><small class="sub">${r.every === 'rok' ? 'ročně' : 'měsíčně'} · ${r.day}.</small></span><b>${fmtMoney(r.amount)}</b></div>`) : html`<p class="sub">Žádné. Přidáš je v Nákladech.</p>`}
      </div>
    </div>`);
}

// ---------- Faktury a nabídky ----------
async function tabInvoices(box, openId, go, rerender) {
  const [invs, offers, customers, toInvoice] = await Promise.all([all('invoices'), all('offers'), all('customers'), documentsToInvoice()]);
  const cust = new Map(customers.map((c) => [c.id, c]));
  invs.sort((a, b) => b.no.localeCompare(a.no));
  offers.sort((a, b) => (b.createdAt).localeCompare(a.createdAt));
  const byCustomer = new Map();
  for (const d of toInvoice) { if (!byCustomer.has(d.customerId)) byCustomer.set(d.customerId, []); byCustomer.get(d.customerId).push(d); }
  const OSTATE = { draft: ['koncept', ''], sent: ['odesláno', 'warn'], accepted: ['přijato', 'ok'], rejected: ['odmítnuto', 'bad'] };
  box.innerHTML = String(html`
    ${byCustomer.size ? html`<div class="card warnbox" style="margin-bottom:12px">
      <h3>K vyfakturování</h3>
      ${[...byCustomer].map(([cid, ds]) => html`<div class="kv"><span>${displayName(cust.get(cid) || {})}</span><span class="grow">${ds.map((d) => d.no).join(', ')} · ${fmtMoney(ds.reduce((s, d) => s + paymentTotal(d.payment.items), 0))}</span><button class="btn small primary" data-bill="${cid}">Vystavit fakturu</button></div>`)}
    </div>` : ''}
    <div class="grid c2" style="align-items:start">
      <div>
        <div class="card-title" style="margin:0 2px 8px"><h3>Faktury</h3><button class="btn small soft" data-act="new-inv">+ Faktura</button></div>
        <div class="list">${invs.length ? invs.map((i) => { const st = invoiceState(i); const r = reminderDue(i); return html`<button class="row" data-inv="${i.id}" style="width:100%;border:none;background:none;text-align:left">
          <span class="main"><span class="title" style="font-size:16px">${i.no} · ${displayName(cust.get(i.customerId) || {})}</span><span class="meta">${fmtDate(parseIso(i.date))}${r ? html` · <span class="tag bad">poslat upomínku ${r}</span>` : ''}</span></span>
          <span class="tag ${st.tag}">${st.label}</span><b>${fmtMoney(i.total)}</b></button>`; }) : html`<div class="empty">Zatím žádné faktury.</div>`}</div>
      </div>
      <div>
        <div class="card-title" style="margin:0 2px 8px"><h3>Cenové nabídky</h3><a class="btn small primary" href="#nabidka-nova">+ Nabídka</a></div>
        <div class="list">${offers.length ? offers.map((o) => html`<a class="row" href="#nabidka-${o.id}">
          <span class="main"><span class="title" style="font-size:16px">${o.no || 'koncept'} · ${displayName(cust.get(o.customerId) || {})}</span><span class="meta">${o.subject || 'bez předmětu'}</span></span>
          <span class="tag ${OSTATE[o.status][1]}">${OSTATE[o.status][0]}</span><b>${fmtMoney(offerTotals(o).total)}</b><span class="chev">›</span></a>`) : html`<div class="empty">Zatím žádné nabídky.</div>`}</div>
      </div>
    </div>`);
  box.querySelectorAll('[data-bill]').forEach((b) => b.addEventListener('click', async () => {
    const ds = byCustomer.get(b.dataset.bill);
    const c = cust.get(b.dataset.bill);
    const items = ds.flatMap((d) => d.payment.items.map((it) => ({ label: it.label, sub: `${{ doklad: 'doklad', protokol: 'protokol' }[d.kind] || 'zpráva'} č. ${d.no}`, qty: it.qty, unit: it.unit, price: it.price })));
    const inv = await createInvoice({ customerId: c.id, items, documentIds: ds.map((d) => d.id) });
    inv.pdf = await buildInvoicePdf(inv, c, settings(), ds);
    await put('invoices', inv);
    toast(`Faktura ${inv.no} vystavena`);
    invoiceDetail(inv.id, rerender);
  }));
  box.querySelectorAll('[data-inv]').forEach((b) => b.addEventListener('click', () => invoiceDetail(b.dataset.inv, rerender)));
  box.querySelector('[data-act="new-inv"]').addEventListener('click', () => manualInvoice(rerender));
  if (openId) invoiceDetail(openId, rerender);
}

async function invoiceDetail(id, rerender) {
  const inv = await get('invoices', id);
  if (!inv) return;
  const c = await get('customers', inv.customerId);
  const docs = (await all('documents')).filter((d) => inv.documentIds?.includes(d.id));
  const st = invoiceState(inv);
  const r = reminderDue(inv);
  const act = await modal({
    title: `Faktura ${inv.no}`,
    body: String(html`<p><b>${displayName(c)}</b> · ${fmtMoney(inv.total)} · VS ${inv.vs}<br><span class="sub">vystaveno ${fmtDate(parseIso(inv.date))} · splatnost ${fmtDate(parseIso(inv.due))} · <span class="tag ${st.tag}">${st.label}</span></span></p>
      ${(inv.reminders || []).map((x) => html`<p class="sub">Upomínka ${x.level} poslána ${fmtDate(new Date(x.at))}</p>`)}`),
    actions: [
      { label: 'Poslat e-mailem / sdílet', value: 'send', kind: 'primary' },
      ...(inv.status === 'open' ? [{ label: 'Zaplaceno', value: 'paid' }] : []),
      ...(r ? [{ label: `Upomínka ${r}`, value: 'remind', kind: 'danger' }] : []),
      ...(inv.status === 'open' ? [{ label: 'Stornovat', value: 'storno' }] : []),
      { label: 'Zavřít', value: null },
    ],
  });
  if (act === 'send') {
    if (!inv.pdf) { inv.pdf = await buildInvoicePdf(inv, c, settings(), docs); await put('invoices', inv); }
    const files = [new File([inv.pdf], `Faktura-${inv.no.replace('/', '-')}.pdf`, { type: 'application/pdf' }), ...docs.filter((d) => d.pdf).map((d) => new File([d.pdf], `Zprava-${d.no.replace(/\//g, '-')}.pdf`, { type: 'application/pdf' }))];
    const s = settings();
    const text = `Dobrý den, v příloze zasílám fakturu č. ${inv.no} na částku ${fmtMoney(inv.total)} se splatností do ${fmtDate(parseIso(inv.due))}${docs.length ? ` a k ní ${docs.length === 1 ? `zprávu č. ${docs[0].no}` : `zprávy č. ${docs.map((d) => d.no).join(', ')}`}` : ''}. Platbu můžete provést převodem na účet ${s.firma.ucet || '…'}, VS ${inv.vs}, nebo jednoduše QR kódem na faktuře. S pozdravem ${podpis()}`;
    if (await sendOut({ files, text, title: `Faktura č. ${inv.no} – ${s.firma.znacka}`, customer: c })) await put('invoices', { ...inv, sentAt: new Date().toISOString() });
  }
  if (act === 'paid') { await put('invoices', { ...inv, status: 'paid', paidAt: new Date().toISOString() }); toast('Označeno jako zaplacené'); }
  if (act === 'storno') { await put('invoices', { ...inv, status: 'storno' }); for (const d of docs) await put('documents', { ...d, invoiceId: null, invoiceNo: null }); toast('Faktura stornována, zprávy jsou znovu k vyfakturování'); }
  if (act === 'remind') {
    const s = settings();
    const text = r === 1
      ? `Dobrý den, dovoluji si připomenout, že dnes je splatná faktura č. ${inv.no} na ${fmtMoney(inv.total)}. Pokud jste platbu již odeslali, považujte prosím tuto zprávu za bezpředmětnou. Děkuji, ${podpis()}`
      : `Dobrý den, podle mých záznamů dosud nebyla uhrazena faktura č. ${inv.no} na ${fmtMoney(inv.total)}, splatná ${fmtDate(parseIso(inv.due))}. Prosím o úhradu do 7 dnů na účet ${s.firma.ucet || '…'}, VS ${inv.vs}. Pokud došlo k nějaké nejasnosti, ozvěte se mi prosím. Děkuji, ${podpis()}`;
    const how = await modal({ title: `Upomínka ${r}`, body: String(html`<p class="sub">${text}</p>`), actions: [{ label: 'SMS', value: 'sms' }, { label: 'E-mail / sdílet', value: 'mail', kind: 'primary' }, { label: 'Zrušit', value: null }] });
    if (!how) return;
    if (how === 'sms') await smsQueue({ title: `Upomínka ${r}`, items: [{ name: displayName(c), phone: c.phones?.[0], body: text }] });
    else if (navigator.share) { try { await navigator.share({ text, title: `Upomínka – faktura ${inv.no}` }); } catch { return; } }
    await put('invoices', { ...inv, reminders: [...(inv.reminders || []), { level: r, at: new Date().toISOString() }] });
    toast(`Upomínka ${r} zaznamenána`);
  }
  rerender();
}

async function manualInvoice(rerender) {
  const c = await pickCustomer('Faktura pro');
  if (!c) return;
  const r = await modal({
    title: `Faktura – ${displayName(c)}`,
    body: String(html`<label class="field"><span>Položka</span><input class="input" id="mi-l" value="Kominické práce"></label>
      <div class="grid c2" style="margin-top:8px"><label class="field"><span>Počet</span><input class="input" id="mi-q" value="1" inputmode="decimal"></label><label class="field"><span>Cena / j. (Kč)</span><input class="input" id="mi-p" inputmode="numeric"></label></div>`),
    actions: [{ label: 'Zrušit', value: null }, { label: 'Vystavit', kind: 'primary', value: (root) => ({ label: root.querySelector('#mi-l').value, qty: Number(root.querySelector('#mi-q').value.replace(',', '.')) || 1, unit: 'ks', price: Number(root.querySelector('#mi-p').value.replace(',', '.')) || 0 }) }],
  });
  if (!r) return;
  const inv = await createInvoice({ customerId: c.id, items: [r] });
  inv.pdf = await buildInvoicePdf(inv, c, settings(), []);
  await put('invoices', inv);
  toast(`Faktura ${inv.no} vystavena`);
  invoiceDetail(inv.id, rerender);
}

export async function pickCustomer(title) {
  const customers = await listCustomers();
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    let q = '';
    const draw = () => {
      const found = (q.length >= 2 ? customers.filter((c) => matches(c, q)) : customers).slice(0, 8);
      root.innerHTML = String(html`<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <h2>${title}</h2>
        <label class="search">${icon('search')}<input id="pc-q" value="${q}" placeholder="Hledej zákazníka…" autocomplete="off"></label>
        ${found.map((c) => html`<button class="row pick" data-pick="${c.id}"><span class="main"><span class="title">${displayName(c)}</span><span class="meta">${c.objects[0]?.address.street}, ${c.objects[0]?.address.city}</span></span></button>`)}
        <div class="actions"><button class="btn" data-cancel>Zrušit</button></div></div></div>`);
      const i = root.querySelector('#pc-q'); i.focus(); i.setSelectionRange(q.length, q.length);
      i.addEventListener('input', () => { q = i.value; draw(); });
      root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { root.innerHTML = ''; resolve(customers.find((c) => c.id === b.dataset.pick)); }));
      root.querySelector('[data-cancel]').addEventListener('click', () => { root.innerHTML = ''; resolve(null); });
    };
    draw();
  });
}

// ---------- Náklady ----------
async function tabExpenses(box, rerender) {
  const [exps, offers, customers] = await Promise.all([all('expenses'), all('offers'), all('customers')]);
  const cust = new Map(customers.map((c) => [c.id, c]));
  const month = exps.filter((e) => e.date.startsWith(state.month)).sort((a, b) => b.date.localeCompare(a.date));
  const sum = (f) => month.filter(f).reduce((s, e) => s + e.amount, 0);
  const total = sum(() => true), fuel = sum((e) => e.category === 'tankovani'), mat = sum((e) => e.category === 'material');
  const matReturned = sum((e) => e.category === 'material' && e.returned);
  const shown = month.filter((e) => state.cat === 'vse' || e.category === state.cat);
  const months = [...new Set([state.month, ...exps.map((e) => e.date.slice(0, 7))])].sort().reverse();
  const rec = settings().finance.pravidelne || [];
  const queue = await pending('expense');
  box.innerHTML = String(html`
    ${queue.length ? html`<div class="card" style="border-left:4px solid var(--gold);margin-bottom:12px">
      <div class="card-title"><h3>Ke kontrole (${queue.length})</h3><span class="sub">nákupy z Gmailu a platby z účtu – stačí potvrdit</span></div>
      ${queue.slice(0, 8).map((q) => html`<div class="kv"><span>${fmtDate(parseIso(q.date))}</span><span style="flex-grow:1"><b>${q.title}</b><br><small class="sub">${q.source}${q.attachments?.length ? ' · příloha' : ''}${q.from ? ` · ${q.from.replace(/<.*>/, '').trim()}` : ''}</small></span>${q.amount ? html`<b>${fmtMoney(q.amount)}</b>` : ''}<button class="btn small primary" data-q="${q.id}">Zapsat</button><button class="btn small" data-qno="${q.id}">Není náklad</button></div>`)}
    </div>` : ''}
    <div class="grid c4">
      <div class="card kpi dark"><span class="label">Náklady celkem</span><span class="big">${fmtMoney(total)}</span><select class="input" id="em" style="height:40px;min-height:40px;padding:6px 10px;margin-top:4px;background:#3A322B;color:#fff;border:none">${months.map((m) => html`<option value="${m}" ${m === state.month ? 'selected' : ''}>${monthName(Number(m.slice(5)) - 1)} ${m.slice(0, 4)}</option>`)}</select></div>
      <div class="card kpi"><span class="label">Běžné náklady</span><span class="big">${fmtMoney(total - mat)}</span><span class="sub">bez materiálu na zakázky</span></div>
      <div class="card kpi"><span class="label">Tankování</span><span class="big">${fmtMoney(fuel)}</span><span class="sub">${month.filter((e) => e.category === 'tankovani').length}× v měsíci</span></div>
      <div class="card kpi"><span class="label">Materiál na zakázky</span><span class="big">${fmtMoney(mat)}</span><span class="sub">vráceno ${fmtMoney(matReturned)} · čeká ${fmtMoney(mat - matReturned)}</span></div>
    </div>
    <div class="chips" style="margin:12px 0">
      <button class="chip ${state.cat === 'vse' ? 'on' : ''}" data-cat="vse">Vše</button>
      ${CATEGORIES.map(([k, l]) => html`<button class="chip ${state.cat === k ? 'on' : ''}" data-cat="${k}">${l} <small>${fmtMoney(sum((e) => e.category === k))}</small></button>`)}
    </div>
    <div class="grid split" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start">
      <div class="list">${shown.length ? shown.map((e) => html`<button class="row" data-exp="${e.id}" style="width:100%;border:none;background:none;text-align:left">
        <span style="width:54px;font-weight:600;color:var(--ink-2)">${parseIso(e.date).getDate()}. ${parseIso(e.date).getMonth() + 1}.</span>
        <span class="main"><span class="title" style="font-size:16px">${e.note || catLabel(e.category)}</span><span class="meta">${catLabel(e.category)}${e.jobRef ? ` → ${e.jobRef.label}` : ''} ${e.photo ? html`<span class="tag">účtenka</span>` : html`<span class="tag">bez účtenky</span>`}${e.category === 'material' && e.jobRef ? (e.returned ? html` <span class="tag ok">vráceno ✓</span>` : html` <span class="tag warn">čeká na úhradu zakázky</span>`) : ''}${e.recurringKey ? html` <span class="tag">pravidelná</span>` : ''}</span></span>
        <b>${fmtMoney(e.amount)}</b></button>`) : html`<div class="empty">Žádné náklady v tomto měsíci.</div>`}</div>
      <div>
        <div class="card">
          <h3 style="margin-bottom:8px">Materiál na zakázkách</h3>
          ${offers.filter((o) => o.status !== 'rejected' && o.items.some((i) => i.group === 'material')).slice(0, 5).map((o) => { const t = offerTotals(o); return html`<div class="kv"><span>${displayName(cust.get(o.customerId) || {})}<br><small class="sub">${o.subject}</small></span><span class="sub">nákup ${fmtMoney(t.materialNakup)}<br><b style="color:var(--ok)">+${fmtMoney(t.prirazka)}</b></span></div>`; }) || ''}
          <p class="sub" style="font-size:12px;margin-bottom:0">Přirážka na materiál z nabídek – kolik ti materiál vydělá.</p>
        </div>
        <div class="card">
          <div class="card-title"><h3>Pravidelné platby</h3><button class="btn small soft" data-act="rec-add">+ Přidat</button></div>
          ${rec.map((r) => html`<div class="kv"><span>${r.name}<br><small class="sub">${r.every === 'rok' ? 'ročně' : 'měsíčně'}, ${r.day}. den</small></span><b>${fmtMoney(r.amount)}</b><button class="btn small" data-rec="${r.id}">Upravit</button></div>`)}
          ${rec.length ? '' : html`<p class="sub">Telefon, pojištění… se zapíšou samy v den platby.</p>`}
        </div>
      </div>
    </div>`);
  box.querySelector('#em').addEventListener('change', (e) => { state.month = e.target.value; rerender(); });
  box.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => expenseForm(null, rerender, queue.find((q) => q.id === b.dataset.q))));
  box.querySelectorAll('[data-qno]').forEach((b) => b.addEventListener('click', async () => { await del('queue', b.dataset.qno); toast('Vyřazeno'); rerender(); }));
  box.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { state.cat = b.dataset.cat; rerender(); }));
  box.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => expenseForm(exps.find((x) => x.id === b.dataset.exp), rerender)));
  box.querySelector('[data-act="rec-add"]').addEventListener('click', () => recurringForm(null, rerender));
  box.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => recurringForm(rec.find((r) => r.id === b.dataset.rec), rerender)));
}

async function photoData(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const sc = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}
export { photoData };

async function expenseForm(e, rerender, fromQueue = null) {
  const offers = (await all('offers')).filter((o) => o.status !== 'rejected');
  const customers = new Map((await all('customers')).map((c) => [c.id, c]));
  const x = e ? { ...e } : { date: isoDate(), amount: '', category: 'tankovani', note: '', photo: null, jobRef: null, returned: false };
  let aiMsg = hasAi() ? 'Po vyfocení se účtenka přečte sama.' : 'Automatické čtení účtenek zapneš v Nastavení → Propojení → AI.';
  const root = document.getElementById('modal-root');
  const fill = (r) => {
    if (r.amount) x.amount = String(r.amount);
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) x.date = r.date;
    if (CATEGORIES.some(([k]) => k === r.category)) x.category = r.category;
    x.note = [r.shop, r.note].filter(Boolean).join(' – ').slice(0, 120) || x.note;
    if (r.items?.length) x.items = r.items;
  };
  const readAi = async (dataUrl) => {
    if (!hasAi()) return;
    aiMsg = 'Čtu účtenku…'; draw();
    try { fill(await readReceipt(dataUrl)); aiMsg = '✓ Přečteno – zkontroluj částku a ulož.'; } catch (err) { aiMsg = `✕ ${err.message}`; }
    draw();
  };
  if (fromQueue) {
    x.date = fromQueue.date || x.date; x.note = fromQueue.title || ''; x.category = guessCategory(`${fromQueue.title} ${fromQueue.from || ''} ${fromQueue.text || ''}`);
    if (fromQueue.amount) x.amount = String(fromQueue.amount);
    const att = fromQueue.attachments?.[0];
    if (att) {
      const url = `data:${att.type};base64,${att.base64}`;
      if (att.type.startsWith('image/')) x.photo = url; else x.pdf = url;
      setTimeout(() => readAi(url), 0);
    }
  }
  const draw = () => {
    root.innerHTML = String(html`<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Náklad">
      <h2>${e ? 'Upravit náklad' : 'Nový náklad'}</h2>
      <div style="display:flex;gap:12px;align-items:center">
        ${x.photo ? html`<img src="${x.photo}" alt="Účtenka" style="width:80px;height:100px;object-fit:cover;border-radius:8px">` : ''}
        ${x.pdf && !x.photo ? html`<span class="tag">faktura PDF z e-mailu</span>` : ''}
        <label class="btn ${x.photo ? 'soft' : 'primary'}">${x.photo ? 'Vyfotit znovu' : 'Vyfotit účtenku'}<input type="file" accept="image/*" capture="environment" id="ex-photo" hidden></label>
        <span class="sub" id="ex-ai">${aiMsg}</span>
      </div>
      <div class="grid c2"><label class="field"><span>Částka (Kč)</span><input class="input" id="ex-a" value="${x.amount}" inputmode="decimal"></label><label class="field"><span>Datum</span><input class="input" type="date" id="ex-d" value="${x.date}"></label></div>
      <div class="field"><span>Kategorie</span><div class="chips">${CATEGORIES.map(([k, l]) => html`<button class="chip ${x.category === k ? 'on' : ''}" data-c="${k}">${l}</button>`)}</div></div>
      <label class="field"><span>Poznámka / obchod</span><input class="input" id="ex-n" value="${x.note}" placeholder="např. Benzina Šternberk"></label>
      ${x.category === 'material' ? html`<div class="field"><span>Na zakázku</span><div class="chips">${offers.map((o) => html`<button class="chip ${x.jobRef?.id === o.id ? 'on' : ''}" data-job="${o.id}">${displayName(customers.get(o.customerId) || {})} · ${o.subject || o.no || 'nabídka'}</button>`)}${offers.length ? '' : html`<span class="sub">Žádné otevřené nabídky.</span>`}</div></div>
        ${x.jobRef ? html`<button class="chip ${x.returned ? 'on' : ''}" data-ret>${x.returned ? '✓ Zákazník zaplatil (vráceno)' : 'Označit jako vráceno'}</button>` : ''}` : ''}
      <div class="actions">${e ? html`<button class="btn danger" data-del>Smazat</button>` : ''}<span class="grow"></span><button class="btn" data-cancel>Zrušit</button><button class="btn primary" data-save>Uložit</button></div>
    </div></div>`);
    const keep = () => { x.amount = root.querySelector('#ex-a').value; x.date = root.querySelector('#ex-d').value; x.note = root.querySelector('#ex-n').value; };
    root.querySelector('#ex-photo').addEventListener('change', async (ev) => { keep(); const f = ev.target.files?.[0]; if (f) { x.photo = await photoData(f); draw(); readAi(x.photo); } });
    root.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { keep(); x.category = b.dataset.c; draw(); }));
    root.querySelectorAll('[data-job]').forEach((b) => b.addEventListener('click', () => { keep(); const o = offers.find((y) => y.id === b.dataset.job); x.jobRef = x.jobRef?.id === o.id ? null : { type: 'offer', id: o.id, label: `${displayName(customers.get(o.customerId) || {})}, ${o.subject || 'zakázka'}` }; draw(); }));
    root.querySelector('[data-ret]')?.addEventListener('click', () => { keep(); x.returned = !x.returned; draw(); });
    root.querySelector('[data-cancel]').addEventListener('click', () => { root.innerHTML = ''; });
    root.querySelector('[data-del]')?.addEventListener('click', async () => { const { moveToTrash } = await import('../db.js'); await moveToTrash('expenses', e.id, `Náklad: ${e.note || catLabel(e.category)} ${fmtMoney(e.amount)}`); root.innerHTML = ''; toast('Smazáno (v koši)'); rerender(); });
    root.querySelector('[data-save]').addEventListener('click', async () => {
      keep();
      if (!(Number(String(x.amount).replace(',', '.')) > 0)) { toast('Zadej částku'); return; }
      await saveExpense(x);
      if (fromQueue) await del('queue', fromQueue.id);
      root.innerHTML = ''; toast('Náklad uložen'); rerender();
    });
  };
  draw();
}

async function recurringForm(r, rerender) {
  const list = [...(settings().finance.pravidelne || [])];
  const v = r || { id: uid('r_'), name: 'Telefon', amount: 500, every: 'mesic', day: 25, category: 'telefon', since: isoDate() };
  const res = await modal({
    title: r ? 'Upravit pravidelnou platbu' : 'Nová pravidelná platba',
    body: String(html`<label class="field"><span>Název</span><input class="input" id="rc-n" value="${v.name}"></label>
      <div class="grid c2" style="margin-top:8px"><label class="field"><span>Částka (Kč)</span><input class="input" id="rc-a" value="${v.amount}" inputmode="numeric"></label><label class="field"><span>Den v měsíci</span><input class="input" id="rc-d" value="${v.day}" inputmode="numeric"></label></div>
      <div class="field" style="margin-top:8px"><span>Jak často</span><div class="chips"><label class="chip"><input type="radio" name="rc-e" value="mesic" ${v.every !== 'rok' ? 'checked' : ''}> měsíčně</label><label class="chip"><input type="radio" name="rc-e" value="rok" ${v.every === 'rok' ? 'checked' : ''}> ročně</label></div></div>
      <div class="field" style="margin-top:8px"><span>Kategorie</span><select class="input" id="rc-c">${CATEGORIES.map(([k, l]) => html`<option value="${k}" ${v.category === k ? 'selected' : ''}>${l}</option>`)}</select></div>`),
    actions: [...(r ? [{ label: 'Smazat', value: 'del', kind: 'danger' }] : []), { label: 'Zrušit', value: null }, { label: 'Uložit', kind: 'primary', value: (root) => ({ ...v, name: root.querySelector('#rc-n').value, amount: Number(root.querySelector('#rc-a').value) || 0, day: Math.min(28, Math.max(1, Number(root.querySelector('#rc-d').value) || 1)), every: root.querySelector('input[name="rc-e"]:checked').value, category: root.querySelector('#rc-c').value }) }],
  });
  if (!res) return;
  const next = res === 'del' ? list.filter((x) => x.id !== v.id) : [...list.filter((x) => x.id !== v.id), res];
  await saveRecurring(next);
  toast('Uloženo');
  rerender();
}

export { sumItems, createOffer };
