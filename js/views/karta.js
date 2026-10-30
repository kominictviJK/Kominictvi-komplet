// Karta zákazníka – kontakty, poznámka, objekty a komíny s lhůtami, sousedé, historie
import { all, byIndex } from '../db.js';
import { getCustomer, saveCustomer, archiveCustomer, deleteCustomer, displayName, neighbours, salutation, TYPES, DELIVERY } from '../customers.js';
import { dueState, nextCheck, DUE_TAG, FUEL_LABEL } from '../lhuty.js';
import { html, icon, fmtPhone, fmtDate, parseIso, toast, modal } from '../ui.js';

export async function render(el, { args, go }) {
  const c = await getCustomer(args[0]);
  if (!c) { el.innerHTML = String(html`<div class="card empty">Zákazník nenalezen. <a href="#zakaznici">Zpět na zákazníky</a></div>`); return; }
  const [everyone, docs] = await Promise.all([all('customers'), byIndex('documents', 'customerId', c.id)]);
  const today = new Date();

  el.innerHTML = String(html`
    <div class="page-head">
      <a class="btn small" href="#zakaznici">‹ Zákazníci</a>
      <h1>${displayName(c)}</h1>
      ${c.type !== 'osoba' ? html`<span class="tag">${TYPES[c.type]}</span>` : ''}
      ${c.isNew ? html`<span class="tag new">NOVÝ</span>` : html`<span class="tag">stálý</span>`}
      ${c.archived ? html`<span class="tag bad">archiv</span>` : ''}
      ${(c.tags || []).map((t) => html`<span class="tag">${t}</span>`)}
      <span class="grow"></span>
      <a class="btn" href="#zakaznik-upravit-${c.id}">Upravit</a>
      <button class="btn primary" data-act="visit">${icon('plus')} Nová návštěva</button>
    </div>

    <div class="grid c2" style="align-items:start">
      <div class="card">
        <div class="card-title"><h3>Kontakt</h3><span class="sub">${DELIVERY[c.delivery] ? `zprávy posílat: ${DELIVERY[c.delivery]}` : ''}</span></div>
        ${(c.phones || []).filter(Boolean).map((p) => html`<div class="kv"><span>Telefon</span><a class="phone" href="tel:${p.replace(/\s/g, '')}">${fmtPhone(p)}</a></div>`)}
        ${c.email ? html`<div class="kv"><span>E-mail</span><b>${c.email}</b></div>` : ''}
        ${c.ico ? html`<div class="kv"><span>IČO</span><b>${c.ico}</b></div>` : ''}
        ${c.source ? html`<div class="kv"><span>Zdroj</span><b>${c.source}</b></div>` : ''}
        <div class="kv"><span>Oslovení v SMS</span><span class="sub">${salutation(c)}</span></div>
      </div>
      <div class="card">
        <div class="card-title"><h3>Poznámka</h3><span class="sub">jen pro tebe, na dokumenty se netiskne</span></div>
        <div class="field"><textarea id="note" placeholder="Např. pes na dvoře, volat předem, klíče u sousedky…">${c.note || ''}</textarea></div>
      </div>
    </div>

    <h2 style="margin:20px 0 10px">Objekty a komíny</h2>
    ${(c.objects || []).map((o) => objectCard(c, o, everyone, today))}

    <div class="card" style="margin-top:12px">
      <div class="card-title"><h3>Historie</h3><span class="sub">zprávy, protokoly, doklady, faktury</span></div>
      ${docs.length ? docs.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).map((d) => html`<a class="kv" href="#navsteva-${d.id}" style="text-decoration:none;color:inherit"><span>${fmtDate(parseIso(d.date))}</span><b style="flex-grow:1">${d.status === 'final' ? `${d.kind === 'doklad' ? 'Doklad' : 'Zpráva'} ${d.no}` : 'Rozpracovaná návštěva'}</b><span class="sub">${d.title || ''}</span>${d.status === 'final' ? '' : html`<span class="tag warn">dokončit</span>`}<span class="chev">›</span></a>`)
        : html`<p class="sub" style="margin:0">Zatím žádné dokumenty. Po první návštěvě se tu objeví zprávy a doklady.</p>`}
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn soft" data-act="archive">${c.archived ? 'Vrátit z archivu' : 'Archivovat'}</button>
      <button class="btn danger" data-act="delete">Smazat</button>
    </div>
  `);

  const note = el.querySelector('#note');
  note.addEventListener('change', async () => { c.note = note.value.trim(); await saveCustomer(c); toast('Poznámka uložena'); });
  el.querySelector('[data-act="visit"]').addEventListener('click', async () => {
    let objectId = c.objects[0]?.id;
    if (c.objects.length > 1) {
      objectId = await modal({ title: 'Který objekt?', body: '<p>Vyber adresu, kde je návštěva.</p>', actions: [...c.objects.map((o) => ({ label: o.address.street || o.address.city, value: o.id })), { label: 'Zrušit', value: null }] });
      if (!objectId) return;
    }
    go(`navsteva/zakaznik/${c.id}/${objectId}`);
  });
  el.querySelector('[data-act="archive"]').addEventListener('click', async () => {
    await archiveCustomer(c.id, !c.archived);
    toast(c.archived ? 'Vráceno z archivu' : 'Archivováno');
    render(el, { args, go });
  });
  el.querySelector('[data-act="delete"]').addEventListener('click', async () => {
    const ok = await modal({ title: `Smazat ${displayName(c)}?`, body: '<p>Zákazník půjde do koše. Do 30 dní ho obnovíš v Nastavení → Data a bezpečnost. Pokud ho jen nechceš vídat v seznamu, použij raději Archivovat.</p>', actions: [{ label: 'Zrušit', value: false }, { label: 'Smazat', value: true, kind: 'danger' }] });
    if (!ok) return;
    await deleteCustomer(c.id);
    toast('Přesunuto do koše');
    go('zakaznici');
  });
}

function objectCard(c, o, everyone, today) {
  const a = o.address || {};
  const query = [a.street, a.zip, a.city].filter(Boolean).join(', ');
  const mapUrl = a.lat && a.lng ? `https://mapy.com/fnc/v1/showmap?center=${a.lng},${a.lat}&zoom=17&marker=true` : `https://mapy.com/fnc/v1/search?query=${encodeURIComponent(query)}`;
  const nb = neighbours(c, o, everyone);
  return html`
    <div class="card">
      <div class="card-title">
        <span><h3 style="display:inline">${a.street || 'Bez adresy'}</h3> <span class="sub">${[a.zip, a.city].filter(Boolean).join(' ')}${a.district ? ` · okres ${a.district}` : ''}</span></span>
        <a class="btn small soft" href="${mapUrl}" target="_blank" rel="noopener">${icon('map')} Na mapě</a>
      </div>
      ${o.chimneys.map((k) => {
        const due = dueState(k, today);
        const n = nextCheck(k);
        return html`
          <div class="kv" style="align-items:flex-start">
            <span><b style="color:var(--ink)">${k.label}</b><br>${FUEL_LABEL[k.fuel]}${k.condensing ? ' · kondenzační' : ''}</span>
            <span style="flex-grow:1;display:flex;flex-direction:column;gap:3px">
              ${k.appliances.map((ap) => html`<span>${ap.kind}${ap.brand ? ` ${ap.brand}` : ''}${ap.kw ? `, ${ap.kw} kW` : ''}${ap.floor ? ` · ${ap.floor}` : ''}</span>`)}
              <span class="sub" style="font-size:14px">Poslední kontrola: ${k.lastCheck ? fmtDate(parseIso(k.lastCheck)) : 'neznámá'}${n ? ` · další: ${fmtDate(n)}` : ''}</span>
            </span>
            <span class="tag ${DUE_TAG[due.state]}">${due.label}</span>
          </div>`;
      })}
      ${nb.length ? html`<div class="kv"><span>Sousedé na ulici</span><span style="display:flex;flex-wrap:wrap;gap:6px">${nb.map((x) => html`<a class="tag" href="#karta-${x.customer.id}" style="text-decoration:none">${displayName(x.customer)} · ${x.object.address.street}</a>`)}</span></div>` : ''}
    </div>`;
}
