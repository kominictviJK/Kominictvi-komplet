// Historie – archiv všech dokumentů, kontrola číselné řady, storno a oprava, export
import { all, put, get } from '../db.js';
import { displayName, norm } from '../customers.js';
import { paymentTotal, METHODS } from '../payment.js';
import { createDraft, saveDraft, visitDurations } from '../visit.js';
import { invoiceState } from '../finance.js';
import { html, toast, modal, parseIso, fmtDate, fmtMoney, monthName } from '../ui.js';

const state = { type: 'vse', month: null, q: '' };
const TYPES = [['vse', 'Vše'], ['zprava', 'Zprávy'], ['protokol', 'Protokoly'], ['doklad', 'Doklady'], ['faktura', 'Faktury']];
const KIND = { zprava: 'Zpráva', protokol: 'Protokol', doklad: 'Doklad', faktura: 'Faktura' };

export async function render(el, { go }) {
  const [docs, invs, customers] = await Promise.all([all('documents'), all('invoices'), all('customers')]);
  const cust = new Map(customers.map((c) => [c.id, c]));
  const now = new Date();
  if (!state.month) state.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rows = [
    ...docs.filter((d) => d.status === 'final').map((d) => ({ kind: d.kind, id: d.id, no: d.no, date: d.date, customerId: d.customerId, amount: paymentTotal(d.payment.items), pay: d.storno ? 'storno' : METHODS[d.payment.method], storno: d.storno, sent: d.sent?.length ? 'odesláno' : '—', sub: d.title, doc: d })),
    ...invs.map((i) => ({ kind: 'faktura', id: i.id, no: i.no, date: i.date, customerId: i.customerId, amount: i.total, pay: invoiceState(i).label, storno: i.status === 'storno', sent: i.sentAt ? 'odesláno' : '—', sub: `${i.documentIds?.length || 0} dokumentů`, inv: i })),
  ];
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse();
  if (!months.includes(state.month)) months.unshift(state.month);
  const filtered = rows
    .filter((r) => (state.type === 'vse' || r.kind === state.type) && r.date.startsWith(state.month))
    .filter((r) => !state.q || norm(`${r.no} ${displayName(cust.get(r.customerId) || {})} ${cust.get(r.customerId)?.objects?.[0]?.address?.city || ''} ${r.doc?.vs || r.inv?.vs || ''}`).includes(norm(state.q)))
    .sort((a, b) => (b.date + b.no).localeCompare(a.date + a.no));

  // kontrola číselné řady (návštěvy v měsíci)
  const [y, m] = state.month.split('-').map(Number);
  const nums = docs.filter((d) => d.status === 'final' && d.no && d.no.endsWith(`/${m}/${y}`)).map((d) => Number(d.no.split('/')[0])).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i <= (nums.at(-1) || 0); i++) if (!nums.includes(i)) gaps.push(i);
  const drafts = docs.filter((d) => d.status === 'draft' && d.no && d.no.endsWith(`/${m}/${y}`)).map((d) => d.no);
  const storno = docs.filter((d) => d.storno && d.date.startsWith(state.month)).length;
  const durations = visitDurations(docs);
  const total = filtered.filter((r) => !r.storno && r.kind !== 'faktura').reduce((s, r) => s + r.amount, 0);

  el.innerHTML = String(html`
    <div class="page-head">
      <h1>Historie</h1>
      <label class="search" style="flex-grow:1"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="hq" type="search" value="${state.q}" placeholder="Číslo, jméno, obec, VS…"></label>
      <button class="btn soft" data-act="export">Export za měsíc</button>
    </div>
    <div class="chips" style="margin-bottom:10px">
      ${TYPES.map(([k, l]) => html`<button class="chip ${state.type === k ? 'on' : ''}" data-type="${k}">${l}</button>`)}
      <select class="input" id="hm" style="width:auto;height:40px;min-height:40px">${months.map((mo) => html`<option value="${mo}" ${mo === state.month ? 'selected' : ''}>${monthName(Number(mo.slice(5)) - 1)} ${mo.slice(0, 4)}</option>`)}</select>
    </div>
    <div class="note-box ${gaps.length && !drafts.length ? '' : 'ok-box'}" style="margin-bottom:12px">
      ${nums.length ? (gaps.length
        ? html`Číselná řada: chybí č. ${gaps.join(', ')}/${m}/${y}${drafts.length ? ` (rozpracováno: ${drafts.join(', ')})` : ' – zkontroluj rozpracované návštěvy'}.`
        : html`✓ Číselná řada v pořádku: 1–${nums.at(-1)}/${m}/${y} bez mezer${storno ? ` · ${storno} storno` : ''}.`) : 'Tento měsíc zatím žádné dokumenty.'}
      <span class="grow"></span><b>${filtered.length} dokumentů · ${fmtMoney(total)}</b>
    </div>
    ${durations.length ? html`<p class="sub" style="margin:-4px 2px 12px">Průměrná délka návštěvy: ${durations.map((x) => `${x.label} ${x.avg} min (${x.count}×)`).join(' · ')}</p>` : ''}
    <div class="list">
      ${filtered.length ? filtered.map((r) => {
        const c = cust.get(r.customerId);
        return html`<button class="row hrow ${r.storno ? 'storno' : ''}" data-open="${r.kind}|${r.id}">
          <span class="hdate">${parseIso(r.date).getDate()}. ${parseIso(r.date).getMonth() + 1}.</span>
          <span class="hno">${r.no}</span>
          <span class="main"><span class="title" style="font-size:16px">${c ? displayName(c) : '—'}</span><span class="meta"><span class="tag">${KIND[r.kind]}</span> ${r.sub || ''}</span></span>
          <span class="tag ${r.storno ? '' : r.pay?.includes('po splatnosti') ? 'bad' : r.pay?.includes('splatná') ? 'warn' : 'ok'}">${r.pay}</span>
          <span class="hamount">${fmtMoney(r.amount)}</span>
          <span class="sub">${r.sent}</span>
        </button>`;
      }) : html`<div class="empty">Žádné dokumenty v tomto výběru.</div>`}
    </div>`);

  const rerender = () => render(el, { go });
  el.querySelector('#hq').addEventListener('change', (e) => { state.q = e.target.value; rerender(); });
  el.querySelector('#hm').addEventListener('change', (e) => { state.month = e.target.value; rerender(); });
  el.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { state.type = b.dataset.type; rerender(); }));
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => {
    const [kind, id] = b.dataset.open.split('|');
    if (kind === 'faktura') { go(`finance/faktury/${id}`); return; }
    const d = await get('documents', id);
    const act = await modal({
      title: `${KIND[d.kind]} ${d.no}`,
      body: String(html`<p>${displayName(cust.get(d.customerId) || {})} · ${fmtDate(parseIso(d.date))} · ${fmtMoney(paymentTotal(d.payment.items))} · ${METHODS[d.payment.method]}</p>${d.storno ? html`<p class="sub">Stornováno: ${d.storno.reason}</p>` : ''}`),
      actions: [{ label: 'Otevřít a odeslat', value: 'open', kind: 'primary' }, ...(d.storno ? [] : [{ label: 'Opravit (storno + nový)', value: 'fix' }, { label: 'Stornovat', value: 'storno', kind: 'danger' }]), { label: 'Zavřít', value: null }],
    });
    if (act === 'open') go(`navsteva/${d.id}`);
    if (act === 'storno' || act === 'fix') {
      const reason = await modal({ title: act === 'fix' ? 'Důvod opravy' : 'Důvod storna', body: '<input class="input" id="st-r" placeholder="např. špatná částka">', actions: [{ label: 'Zpět', value: null }, { label: 'Potvrdit', kind: 'danger', value: (r) => r.querySelector('#st-r').value.trim() || 'bez udání důvodu' }] });
      if (!reason) return;
      await put('documents', { ...d, storno: { reason, at: new Date().toISOString() } });
      if (act === 'fix') {
        const n = await createDraft({ customerId: d.customerId, objectId: d.objectId, kind: d.kind });
        Object.assign(n, { chimneys: structuredClone(d.chimneys), protocol: d.protocol ? structuredClone(d.protocol) : undefined, protocolChimneyId: d.protocolChimneyId, purpose: d.purpose, payment: { ...structuredClone(d.payment), paid: false }, note: d.note, corrects: d.no, step: d.kind === 'doklad' ? 'platba' : 'formular' });
        await saveDraft(n);
        toast(`${d.no} stornováno – oprav a vystav znovu`);
        go(`navsteva/${n.id}`);
        return;
      }
      toast('Stornováno');
      rerender();
    }
  }));
  el.querySelector('[data-act="export"]').addEventListener('click', async () => {
    const lines = [['Datum', 'Číslo', 'Typ', 'Zákazník', 'Obec', 'Částka', 'Platba', 'VS', 'Storno'].join(';')];
    for (const r of filtered.slice().reverse()) {
      const c = cust.get(r.customerId);
      lines.push([r.date, r.no, KIND[r.kind], c ? displayName(c) : '', c?.objects?.[0]?.address?.city || '', String(r.amount).replace('.', ','), r.pay, r.doc?.vs || r.inv?.vs || '', r.storno ? 'ano' : ''].map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';'));
    }
    const file = new File(['﻿' + lines.join('\r\n')], `Kominictvi-doklady-${state.month}.csv`, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: `Doklady ${state.month}` }); } catch { /* zrušeno */ } } else window.open(URL.createObjectURL(file), '_blank');
  });
}
