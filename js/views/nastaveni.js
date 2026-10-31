// Nastavení – sekce vlevo, obsah vpravo; změny platí od teď (vydané dokumenty se nemění)
import { settings, saveSettings, guideSteps } from '../settings.js';
import { signaturePad, stampFromPhoto } from '../signature.js';
import { TEXTS } from '../texts.js';
import { geocode } from '../mapy.js';
import { counterState } from '../numbering.js';
import { all, get, put, restoreFromTrash } from '../db.js';
import { helperCode, ensureToken, callHelper, hasHelper } from '../google.js';
import { hasAi, testAi, aiSpent } from '../ai.js';
import { syncCalendar, scanGmail, fetchBank, parseStatement, applyTransactions } from '../sync.js';
import { backupToDrive, backupToFile, lastBackup, decrypt, restore, backupPass } from '../backup.js';
import { lockSupported, lockEnabled, setupLock, disableLock } from '../lock.js';
import { resetTrialData, goLive, ownTrialCustomers } from '../seed.js';
import { html, raw, toast, modal, fmtDate } from '../ui.js';
import { APP_VERSION } from '../version.js';
import { catalogList } from '../catalog.js';
import { uid } from '../db.js';

const SECTIONS = [
  { id: 'firma', label: 'Firma a já', sub: (s) => 'údaje, logo, razítko, podpis, účet', warn: (s) => !s.firma.ucet || !s.firma.razitko },
  { id: 'cenik', label: 'Ceník', sub: (s) => `${s.cenik.kontrola.join(' / ')} · frézování ${s.cenik.frezovaniZaMetr}/m · ${s.cenik.dopravaZaKm} Kč/km` },
  { id: 'cislovani', label: 'Dokumenty a číslování', sub: () => 'šablony · číselné řady' },
  { id: 'katalog', label: 'Katalog závad', sub: (s) => `${catalogList('defects', s.katalog).filter((x) => !x.hidden).length} nedostatků · ${catalogList('recs', s.katalog).filter((x) => !x.hidden).length} doporučení` },
  { id: 'texty', label: 'Texty pro zákazníky', sub: () => 'SMS a e-maily · 10 šablon' },
  { id: 'lhuty', label: 'Lhůty a plánování', sub: (s) => `${s.lhuty.tuhaMesice} / ${s.lhuty.kondenzacniMesice} měsíců · oslovit ${s.lhuty.oslovitMesicePredem} měs. předem` },
  { id: 'finance', label: 'Finance', sub: (s) => `paušál ${s.finance.pausalPasmo}. pásmo · upomínky ${s.finance.upominkaDny.join(' a +')} dní` },
  { id: 'propojeni', label: 'Propojení', sub: (s) => `Mapy.cz ${s.propojeni?.mapyKey ? '✓' : '–'} · Google ${s.propojeni?.googleUrl ? '✓' : '–'} · AI ${s.propojeni?.aiKey ? '✓' : '–'} · banka ${s.propojeni?.fioToken ? '✓' : 'výpis'}`, warn: (s) => !s.propojeni?.mapyKey || !s.propojeni?.googleUrl || !s.propojeni?.aiKey },
  { id: 'data', label: 'Data a bezpečnost', sub: (s) => (s.rezim.zkusebni ? 'zkušební režim · koš · zálohy' : 'koš · zálohy · Face ID'), ok: () => true },
];

const FIELDS = {
  firma: [
    ['firma.jmeno', 'Jméno a firma'], ['firma.znacka', 'Značka na dokumentech'], ['firma.adresa', 'Adresa'],
    ['firma.ico', 'IČO'], ['firma.dph', 'DPH'], ['firma.telefon', 'Telefon'], ['firma.email', 'E-mail'],
    ['firma.web', 'Web', 'doplníš, až bude'], ['firma.ucet', 'Číslo účtu', 'doplnit – podnikatelský účet od 1. 1. 2027'],
    ['firma.slogan', 'Slogan'], ['firma.opravneni', 'Oprávnění (na zprávě)'],
  ],
  cenik: [
    ['cenik.kontrola', 'Ceny kontroly (Kč)', '450, 500, 600', 'list'], ['cenik.revize', 'Revize (Kč)', '', 'num'],
    ['cenik.frezovaniZaMetr', 'Frézování za metr (Kč)', '', 'num'], ['cenik.kamera', 'Prohlídka kamerou (Kč)', '0 = zadám ručně', 'num'],
    ['cenik.dopravaZaKm', 'Doprava za km (Kč)', '', 'num'], ['cenik.prirazkaMaterial', 'Přirážka na materiál (%)', '', 'num'],
    ['cenik.splatnostDni', 'Splatnost faktur (dní)', '', 'num'],
  ],
  finance: [
    ['finance.pausalPasmo', 'Pásmo paušální daně (1–3)', '', 'num'],
    ['finance.upominkaDny', 'Upomínky (dny po splatnosti)', '0, 14', 'list0'],
  ],
  lhuty: [
    ['lhuty.tuhaMesice', 'Tuhá paliva – lhůta (měsíce)', '', 'num'], ['lhuty.plynMesice', 'Plyn – lhůta (měsíce)', '', 'num'],
    ['lhuty.kondenzacniMesice', 'Kondenzační kotle (měsíce)', '', 'num'], ['lhuty.oslovitMesicePredem', 'Oslovit předem (měsíce)', '', 'num'],
    ['lhuty.pripominkaVecerHodina', 'Večerní připomínka (hodina)', '', 'num'], ['lhuty.domov', 'Start a konec trasy'],
  ],
};

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function patchFor(path, value) {
  const keys = path.split('.');
  const out = {};
  let o = out;
  keys.forEach((k, i) => { if (i === keys.length - 1) o[k] = value; else o = o[k] = {}; });
  return out;
}

export async function render(el, { args, go }) {
  const s = settings();
  const current = SECTIONS.find((x) => x.id === args[0]) || SECTIONS[0];
  const steps = guideSteps(s);
  const doneCount = steps.filter((x) => x.done).length;

  el.innerHTML = String(html`
    <div class="settings">
      <div>
        <div class="page-head"><h1>Nastavení</h1></div>
        <div class="guide">
          <span style="display:flex;justify-content:space-between;font-size:14px;font-weight:700"><span>Průvodce nastavením</span><span style="color:var(--gold)">${doneCount} / ${steps.length}</span></span>
          <span class="bar"><span style="width:${Math.round(doneCount / steps.length * 100)}%"></span></span>
          <span style="font-size:12px;color:#D8CFC2">Zbývá: ${steps.filter((x) => !x.done).map((x) => x.label).join(' · ')}</span>
        </div>
        <nav aria-label="Sekce nastavení">
          ${SECTIONS.map((x) => html`
            <a href="#nastaveni-${x.id}" class="${x.id === current.id ? 'on' : ''}">
              <span style="min-width:0"><b>${x.label}</b><small>${x.sub(s)}</small></span>
              ${x.warn?.(s) ? html`<span class="dot warn"></span>` : x.ok?.(s) ? html`<span class="dot ok"></span>` : ''}
            </a>`)}
        </nav>
      </div>
      <div id="section"></div>
    </div>`);

  const box = el.querySelector('#section');
  if (FIELDS[current.id]) renderForm(box, current, s);
  else if (current.id === 'cislovani') await renderNumbering(box, s);
  else if (current.id === 'texty') renderTexts(box, s);
  else if (current.id === 'katalog') renderCatalog(box, s);
  else if (current.id === 'propojeni') await renderConnections(box, s);
  else if (current.id === 'data') await renderData(box, s, () => render(el, { args, go }));
  else box.innerHTML = String(html`<div class="page-head"><h2>${current.label}</h2></div><div class="card soon" style="min-height:240px"><span class="stage">Etapa ${current.stage}</span><p>Tahle sekce se doplní v etapě ${current.stage}.</p></div>`);
}

function renderForm(box, section, s) {
  box.innerHTML = String(html`
    <div class="page-head"><h2>${section.label}</h2><span class="grow"></span><span class="sub">Změny platí pro nové dokumenty · vydané zůstávají beze změny</span></div>
    <div class="card" style="padding:4px 18px">
      ${FIELDS[section.id].map(([path, label, ph, type]) => {
        const v = getPath(s, path);
        return html`<label class="kv"><span>${label}</span><input data-path="${path}" data-type="${type || 'text'}" value="${Array.isArray(v) ? v.join(', ') : v ?? ''}" placeholder="${ph || ''}" inputmode="${type === 'num' ? 'numeric' : 'text'}"></label>`;
      })}
    </div>
    ${section.id === 'firma' ? html`
      <div class="grid c3" style="margin-top:12px">
        <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:10px">
          <h3 style="align-self:flex-start">Logo</h3>
          <div class="logo-tile"><img src="icons/logo.png" alt="Logo JK Kominictví"></div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:10px">
          <h3>Razítko</h3>
          <div class="stamp-tile">${s.firma.razitko ? html`<img src="${s.firma.razitko}" alt="Razítko">` : html`<span class="sub">Vyfoť razítko otisknuté na bílém papíře – pozadí se odstraní samo.</span>`}</div>
          <label class="btn ${s.firma.razitko ? 'soft' : 'primary'}">${s.firma.razitko ? 'Vyfotit znovu' : 'Vyfotit razítko'}<input type="file" accept="image/*" capture="environment" id="stamp-file" hidden></label>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:10px">
          <h3>Podpis</h3>
          <div class="stamp-tile">${s.firma.podpis ? html`<img src="${s.firma.podpis}" alt="Podpis">` : html`<span class="sub">Podepíšeš se Pencilem, podpis se vloží na všechny dokumenty.</span>`}</div>
          <button class="btn ${s.firma.podpis ? 'soft' : 'primary'}" data-act="sign">${s.firma.podpis ? 'Podepsat znovu' : 'Podepsat Pencilem'}</button>
        </div>
      </div>` : ''}
  `);
  box.querySelectorAll('input[data-path]').forEach((inp) => inp.addEventListener('change', async () => {
    let value = inp.value.trim();
    if (inp.dataset.type === 'num') value = Number(value.replace(',', '.')) || 0;
    if (inp.dataset.type === 'list') value = value.split(/[,;\s]+/).map(Number).filter((n) => n > 0);
    if (inp.dataset.type === 'list0') value = value.split(/[,;\s]+/).filter((x) => x !== '').map(Number).filter((n) => n >= 0);
    await saveSettings(patchFor(inp.dataset.path, value));
    toast('Uloženo');
  }));
  box.querySelector('#stamp-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast('Zpracovávám razítko…');
    const png = await stampFromPhoto(file);
    await saveSettings({ firma: { razitko: png } });
    toast('Razítko uloženo');
    renderForm(box, section, settings());
  });
  box.querySelector('[data-act="sign"]')?.addEventListener('click', async () => {
    let pad = null;
    const root = document.getElementById('modal-root');
    const result = modal({
      title: 'Tvůj podpis',
      body: '<p class="sub" style="margin-top:0">Podepiš se Pencilem tak, jak se podepisuješ na zprávy.</p><canvas class="sigpad" id="own-sig"></canvas>',
      actions: [{ label: 'Smazat', value: 'clear' }, { label: 'Zrušit', value: null }, { label: 'Uložit podpis', value: () => pad?.toDataURL(), kind: 'primary' }],
    });
    await new Promise((r) => requestAnimationFrame(r));
    pad = signaturePad(root.querySelector('#own-sig'), { color: '#1F3A75' });
    const v = await result;
    if (v === 'clear') { box.querySelector('[data-act="sign"]').click(); return; }
    if (!v) return;
    await saveSettings({ firma: { podpis: v } });
    toast('Podpis uložen');
    renderForm(box, section, settings());
  });
}

async function renderNumbering(box, s) {
  const st = await counterState(new Date(), s.rezim.zkusebni);
  box.innerHTML = String(html`
    <div class="page-head"><h2>Dokumenty a číslování</h2></div>
    <div class="card" style="padding:4px 18px">
      <div class="kv"><span>Návštěvy (zpráva, protokol, doklad)</span><b>${st.visit}</b></div>
      <div class="kv"><span>Faktury</span><b>${st.invoice}</b></div>
      <div class="kv"><span>Nabídky</span><b>${st.offer}</b></div>
    </div>
    <div class="note-box" style="margin-top:12px">Číselné řady jsou zamčené – aplikace je vede sama, aby se nerozbily. ${s.rezim.zkusebni ? 'Ve zkušebním režimu se počítá zvlášť; ostrá řada začne od 1/1/2027.' : ''}</div>
    <div class="card" style="margin-top:12px">
      <h3>Formát</h3>
      <p class="sub">Zpráva <b>3/10/2026</b> → VS <b>202610003</b> · Faktura <b>2026/05</b> → VS <b>202605</b> · Nabídka <b>N2026/03</b></p>
    </div>`);
}

async function renderData(box, s, rerender) {
  const trash = (await all('trash')).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const last = await lastBackup();
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  box.innerHTML = String(html`
    <div class="page-head"><h2>Data a bezpečnost</h2></div>
    <div class="card">
      <div class="card-title"><h3>Režim aplikace</h3>${s.rezim.zkusebni ? html`<span class="tag warn">zkušební režim</span>` : html`<span class="tag ok">ostrý provoz</span>`}</div>
      <p class="sub" style="margin-top:0">${s.rezim.zkusebni
        ? 'Aplikace běží s vymyšlenými zákazníky. Můžeš zkoušet cokoli – nic se nikam neposílá naostro a čísla dokladů jsou zkušební.'
        : `Ostrý provoz od ${s.rezim.ostryOd ? fmtDate(new Date(s.rezim.ostryOd)) : '—'}.`}</p>
      ${s.rezim.zkusebni ? html`<div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn soft" data-act="reset">Obnovit zkušební data</button>
        <button class="btn primary" data-act="golive">Přepnout na ostrý provoz…</button>
      </div>` : ''}
    </div>
    <div class="card">
      <div class="card-title"><h3>Koš</h3><span class="sub">smazané položky jde 30 dní obnovit</span></div>
      ${trash.length ? trash.map((t) => html`<div class="kv"><span>${fmtDate(new Date(t.deletedAt))}</span><b style="flex-grow:1">${t.label || t.id}</b><button class="btn small" data-restore="${t.id}">Obnovit</button></div>`)
        : html`<p class="sub" style="margin:0">Koš je prázdný.</p>`}
    </div>
    <div class="card">
      <div class="card-title"><h3>Zálohy</h3>${last ? html`<span class="tag ok">poslední ${fmtDate(new Date(last.at))}</span>` : html`<span class="tag warn">zatím žádná</span>`}</div>
      <p class="sub" style="margin-top:0">Záloha obsahuje všechno – zákazníky, zprávy i s PDF, faktury, náklady a nastavení. Je zašifrovaná heslem, takže ji bez hesla nikdo nepřečte. ${hasHelper() ? 'Každý den se sama uloží na Google Disk (složka „Kominictví – zálohy“, posledních 30).' : 'Automatická denní záloha na Google Disk začne po nastavení pomocníka Google.'}${s.rezim.zkusebni ? ' Ve zkušebním režimu se automaticky nezálohuje.' : ''}</p>
      ${last ? html`<p class="sub">Poslední záloha: ${fmtDate(new Date(last.at))} v ${new Date(last.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · ${last.where}</p>` : ''}
      <label class="field"><span>Heslo záloh</span><input class="input" type="password" id="bk-pass" value="${s.bezpecnost.zalohaHeslo || ''}" placeholder="aspoň 8 znaků – zapiš si ho, bez něj zálohu neobnovíš" autocomplete="new-password"></label>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn soft" data-act="bk-pass">Uložit heslo</button>
        ${hasHelper() ? html`<button class="btn primary" data-act="bk-drive">Zálohovat teď na Disk</button>` : ''}
        <button class="btn soft" data-act="bk-file">Záloha do souboru / na flashku</button>
        <label class="btn">Obnovit ze souboru<input type="file" id="bk-restore" hidden></label>
        ${hasHelper() ? html`<button class="btn" data-act="bk-drive-list">Obnovit z Disku</button>` : ''}
      </div>
      <p class="sub" id="bk-status" style="margin-bottom:0"></p>
    </div>
    <div class="card">
      <div class="card-title"><h3>Zámek Face ID</h3>${lockEnabled() ? html`<span class="tag ok">zapnutý</span>` : html`<span class="tag">vypnutý</span>`}</div>
      <p class="sub" style="margin-top:0">Když iPad necháš ${s.bezpecnost.zamekMinuty} minut ležet nebo aplikaci zavřeš, při dalším otevření se zeptá na Face ID. Data zákazníků tak neuvidí nikdo jiný.</p>
      ${lockSupported() ? html`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${lockEnabled() ? html`<button class="btn" data-act="lock-off">Vypnout zámek</button>` : html`<button class="btn primary" data-act="lock-on">Zapnout Face ID</button>`}
        <label class="field" style="flex-direction:row;align-items:center;gap:8px;margin:0"><span>Zamknout po</span><select class="input" id="lock-min" style="width:auto">${[5, 15, 30, 60].map((m) => html`<option value="${m}" ${s.bezpecnost.zamekMinuty === m ? 'selected' : ''}>${m} min</option>`)}</select></label>
      </div>` : html`<p class="sub" style="margin:0">Zámek jde zapnout v aplikaci na iPadu (otevřené z plochy).</p>`}
      <p class="sub" id="lock-status" style="margin-bottom:0"></p>
    </div>
    <div class="card">
      <div class="card-title"><h3>Úložiště v iPadu</h3>${persisted ? html`<span class="tag ok">trvalé</span>` : html`<span class="tag">běžné</span>`}</div>
      <p class="sub" style="margin:0">${est ? `Aplikace zabírá ${fmtSize(est.usage)}${est.quota ? ` z dostupných ${fmtSize(est.quota)}` : ''}.` : 'Velikost se nepodařilo zjistit.'} ${persisted ? 'iPad data aplikace sám nesmaže.' : 'Přidej aplikaci na plochu, aby iPad data nemazal.'}</p>
    </div>
    <p class="sub">Verze aplikace ${APP_VERSION}</p>
  `);
  box.querySelector('[data-act="reset"]')?.addEventListener('click', async () => {
    const ok = await modal({ title: 'Obnovit zkušební data?', body: '<p>Smažou se zkušební návštěvy, dokumenty, faktury a nabídky a znovu se nahrají ukázkoví zákazníci. Zákazníci, které jsi zadal sám, zůstanou.</p>', actions: [{ label: 'Zrušit', value: false }, { label: 'Obnovit', value: true, kind: 'primary' }] });
    if (!ok) return;
    await resetTrialData();
    toast('Zkušební data obnovena');
    rerender();
  });
  box.querySelector('[data-act="golive"]')?.addEventListener('click', async () => {
    const st = settings(); const p = st.propojeni || {};
    const own = await ownTrialCustomers();
    const checks = [
      ['Číslo účtu', !!st.firma.ucet], ['Razítko', !!st.firma.razitko], ['Podpis', !!st.firma.podpis],
      ['Mapy.cz', !!p.mapyKey], ['Pomocník Google', !!p.googleUrl], ['AI', !!p.aiKey], ['Heslo záloh', !!st.bezpecnost.zalohaHeslo],
    ];
    const early = new Date() < new Date('2027-01-01T00:00:00');
    const ok = await modal({
      title: 'Přepnout na ostrý provoz',
      body: String(html`<p>Smažou se <b>všechny zkoušky</b>: ukázkoví zákazníci, zkušební návštěvy, zprávy, faktury, nabídky, náklady, plány a koš. Číslování začne od 1 – první zpráva v lednu bude <b>1/1/2027</b>.</p>
        ${own.length ? html`<label class="chip" style="margin:6px 0"><input type="checkbox" id="gl-keep" checked> Ponechat zákazníky, které jsem zadal sám (${own.length})</label><p class="sub" style="margin-top:4px">Pokud jsi na nich zkoušel zprávy, zkontroluj u nich v kartě datum poslední kontroly.</p>` : ''}
        <div class="kv-list">${checks.map(([l, done]) => html`<div class="kv"><span>${l}</span><span class="tag ${done ? 'ok' : 'warn'}">${done ? 'hotovo' : 'chybí – doplníš i později'}</span></div>`)}</div>
        ${early ? html`<p class="note-box" style="margin-top:10px">Je teprve ${fmtDate(new Date())}. Doporučuju přepnout až těsně před 1. 1. 2027 – dokumenty vystavené v prosinci by měly prosincová čísla.</p>` : ''}
        <label class="field" style="margin-top:10px"><span>Pro potvrzení napiš OSTRÝ</span><input class="input" id="gl-confirm" autocomplete="off" autocapitalize="characters"></label>`),
      actions: [{ label: 'Zrušit', value: null }, { label: 'Přepnout', kind: 'danger', value: (root) => ({ word: root.querySelector('#gl-confirm').value.trim().toUpperCase(), keep: root.querySelector('#gl-keep')?.checked ?? true }) }],
    });
    if (!ok) return;
    if (!['OSTRÝ', 'OSTRY'].includes(ok.word)) { toast('Nepřepnuto – potvrzovací slovo nesedí'); return; }
    await goLive({ keepOwn: ok.keep });
    await saveSettings({ rezim: { zkusebni: false, ostryOd: new Date().toISOString() } });
    toast('Ostrý provoz zapnut. Hodně štěstí!');
    location.hash = '#dnes';
    location.reload();
  });
  box.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
    await restoreFromTrash(b.dataset.restore);
    toast('Obnoveno');
    rerender();
  }));
  const st = box.querySelector('#bk-status');
  const run = async (label, fn) => { st.textContent = label; try { await fn(); } catch (e) { st.textContent = `✕ ${e.message}`; } };
  box.querySelector('[data-act="bk-pass"]').addEventListener('click', async () => {
    const v = box.querySelector('#bk-pass').value;
    if (v && v.length < 8) { st.textContent = '✕ Heslo musí mít aspoň 8 znaků.'; return; }
    await saveSettings({ bezpecnost: { zalohaHeslo: v } });
    st.textContent = v ? '✓ Heslo uloženo. Zapiš si ho někam mimo iPad.' : 'Heslo smazáno – zálohy se nebudou dělat.';
  });
  box.querySelector('[data-act="bk-drive"]')?.addEventListener('click', () => run('Zálohuji na Google Disk…', async () => { const r = await backupToDrive(); st.textContent = `✓ Uloženo na Disk (${Math.round(r.size / 1024)} kB).`; setTimeout(rerender, 1500); }));
  box.querySelector('[data-act="bk-file"]').addEventListener('click', () => run('Připravuji zálohu…', async () => { await backupToFile(); st.textContent = '✓ Záloha připravena – ulož ji do Souborů nebo na flashku.'; }));
  const restoreText = async (text) => {
    const pass = await askPass();
    if (!pass) { st.textContent = ''; return; }
    const data = await decrypt(text, pass);
    const ok = await modal({ title: 'Obnovit zálohu?', body: String(html`<p>Záloha z <b>${fmtDate(new Date(data.createdAt))}</b>: ${data.stores.customers?.length || 0} zákazníků, ${data.stores.documents?.length || 0} dokumentů, ${data.stores.invoices?.length || 0} faktur.</p><p><b>Všechna současná data v iPadu se nahradí obsahem zálohy.</b></p>`), actions: [{ label: 'Zrušit', value: false }, { label: 'Obnovit', value: true, kind: 'danger' }] });
    if (!ok) { st.textContent = ''; return; }
    await restore(data);
    toast('Záloha obnovena');
    location.reload();
  };
  box.querySelector('#bk-restore').addEventListener('change', (e) => run('Čtu zálohu…', async () => { const f = e.target.files?.[0]; if (f) await restoreText(await f.text()); }));
  box.querySelector('[data-act="bk-drive-list"]')?.addEventListener('click', () => run('Načítám zálohy z Disku…', async () => {
    const list = await callHelper('backupList');
    if (!list.length) { st.textContent = 'Na Disku zatím žádná záloha není.'; return; }
    st.textContent = '';
    const id = await modal({ title: 'Zálohy na Google Disku', body: '<p class="sub">Vyber, kterou zálohu obnovit.</p>', actions: [...list.slice(0, 8).map((f) => ({ label: `${fmtDate(new Date(f.date))} ${new Date(f.date).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`, value: f.id })), { label: 'Zrušit', value: null }] });
    if (!id) return;
    st.textContent = 'Stahuji zálohu…';
    const r = await callHelper('backupLoad', { id }, { timeout: 120000 });
    await restoreText(r.content);
  }));
  const ls = box.querySelector('#lock-status');
  box.querySelector('[data-act="lock-on"]')?.addEventListener('click', async () => {
    try { await setupLock(); toast('Face ID zapnuto'); rerender(); } catch (e) { ls.textContent = `✕ Nepodařilo se zapnout (${e.name === 'NotAllowedError' ? 'zrušeno' : e.message}).`; }
  });
  box.querySelector('[data-act="lock-off"]')?.addEventListener('click', async () => { await disableLock(); toast('Zámek vypnut'); rerender(); });
  box.querySelector('#lock-min')?.addEventListener('change', async (e) => { await saveSettings({ bezpecnost: { zamekMinuty: Number(e.target.value) } }); toast('Uloženo'); });
}

const fmtSize = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

async function askPass() {
  return modal({ title: 'Heslo zálohy', body: `<label class="field"><span>Heslo, kterým byla záloha zašifrovaná</span><input class="input" type="password" id="ap" value="${backupPass().replace(/"/g, '&quot;')}"></label>`, actions: [{ label: 'Zrušit', value: null }, { label: 'Pokračovat', kind: 'primary', value: (root) => root.querySelector('#ap').value }] });
}

function renderCatalog(box, s) {
  const lists = { defects: catalogList('defects', s.katalog), recs: catalogList('recs', s.katalog) };
  const custom = !!(s.katalog?.defects?.length || s.katalog?.recs?.length);
  const section = (which, title, ph) => html`
    <div class="card" style="margin-top:10px">
      <div class="card-title"><h3>${title}</h3><span class="sub">${lists[which].filter((x) => !x.hidden).length} zobrazeno</span></div>
      ${lists[which].map((x, i) => html`<div class="kv cat-row ${x.hidden ? 'hidden-item' : ''}">
        <input class="input" data-cl="${which}.${i}" value="${x.label}" style="flex-grow:1">
        <button class="btn small" data-up="${which}.${i}" ${i === 0 ? 'disabled' : ''} aria-label="Posunout výš">▲</button>
        <button class="btn small" data-down="${which}.${i}" ${i === lists[which].length - 1 ? 'disabled' : ''} aria-label="Posunout níž">▼</button>
        <button class="btn small ${x.hidden ? 'soft' : ''}" data-hide="${which}.${i}">${x.hidden ? 'Zobrazit' : 'Skrýt'}</button>
        ${x.key.startsWith('c_') ? html`<button class="btn small danger" data-rm="${which}.${i}" aria-label="Smazat">✕</button>` : ''}
      </div>`)}
      <div style="display:flex;gap:8px;margin-top:10px"><input class="input" id="new-${which}" placeholder="${ph}" style="flex-grow:1"><button class="btn soft" data-add="${which}">+ Přidat</button></div>
    </div>`;
  box.innerHTML = String(html`
    <div class="page-head"><h2>Katalog závad</h2>${custom ? html`<span class="grow"></span><button class="btn small" data-act="cat-reset">Vrátit původní</button>` : ''}</div>
    <div class="note-box">Položky, které ťukáš ve formuláři zprávy. Můžeš je přejmenovat, přeřadit, skrýt nebo přidat vlastní. Změna platí pro nové zprávy, vydané zprávy zůstávají beze změny.</div>
    ${section('defects', 'Neodstraněné nedostatky', 'nový nedostatek, např. Chybí komínová lávka')}
    ${section('recs', 'Doporučení', 'nové doporučení, např. Osadit komínovou stříšku')}`);
  const save = async () => {
    await saveSettings({ katalog: null });
    await saveSettings({ katalog: { defects: lists.defects, recs: lists.recs } });
    renderCatalog(box, settings());
  };
  const at = (v) => { const [w, i] = v.split('.'); return [lists[w], Number(i)]; };
  box.querySelectorAll('[data-cl]').forEach((inp) => inp.addEventListener('change', async () => { const [l, i] = at(inp.dataset.cl); const v = inp.value.trim(); if (!v) return; l[i].label = v; await save(); toast('Uloženo'); }));
  box.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const [l, i] = at(b.dataset.up); [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(); }));
  box.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => { const [l, i] = at(b.dataset.down); [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(); }));
  box.querySelectorAll('[data-hide]').forEach((b) => b.addEventListener('click', () => { const [l, i] = at(b.dataset.hide); l[i].hidden = !l[i].hidden; save(); }));
  box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { const [l, i] = at(b.dataset.rm); l.splice(i, 1); save(); }));
  box.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    const w = b.dataset.add; const v = box.querySelector(`#new-${w}`).value.trim();
    if (!v) { toast('Napiš název položky'); return; }
    lists[w].push({ key: uid('c_'), label: v, hidden: false }); save(); toast('Přidáno');
  }));
  box.querySelector('[data-act="cat-reset"]')?.addEventListener('click', async () => {
    const ok = await modal({ title: 'Vrátit původní katalog?', body: '<p>Vlastní položky a úpravy se smažou. Vydané zprávy zůstanou beze změny.</p>', actions: [{ label: 'Zrušit', value: false }, { label: 'Vrátit', value: true, kind: 'danger' }] });
    if (!ok) return;
    await saveSettings({ katalog: null }); renderCatalog(box, settings()); toast('Původní katalog vrácen');
  });
}

function renderTexts(box, s) {
  const custom = s.texty || {};
  box.innerHTML = String(html`
    <div class="page-head"><h2>Texty pro zákazníky</h2></div>
    <div class="note-box" style="margin-bottom:12px">Do textu se samo doplní: {osloveni} (Dobrý den, pane Nováku,) · {den} · {cas} · {obec} · {adresa} · {minut} · {posledni} · {lhuta} · {podpis}. U večerní připomínky se věta o netopení přidá jen zákazníkům s tuhými palivy.</div>
    ${TEXTS.map((t) => html`<div class="card" style="margin-top:10px">
      <div class="card-title"><h3>${t.label}</h3>${custom[t.id] ? html`<button class="btn small" data-reset="${t.id}">Vrátit původní</button>` : html`<span class="sub">původní znění</span>`}</div>
      <div class="field"><textarea id="tx-${t.id}" data-text="${t.id}" rows="3">${custom[t.id] || t.text}</textarea></div>
    </div>`)}`);
  box.querySelectorAll('[data-text]').forEach((ta) => ta.addEventListener('change', async () => {
    const def = TEXTS.find((t) => t.id === ta.dataset.text).text;
    const v = ta.value.trim();
    const texty = { ...(settings().texty || {}) };
    if (!v || v === def) delete texty[ta.dataset.text]; else texty[ta.dataset.text] = v;
    await saveSettings({ texty: null });
    await saveSettings({ texty });
    toast('Text uložen');
    renderTexts(box, settings());
  }));
  box.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    const texty = { ...(settings().texty || {}) };
    delete texty[b.dataset.reset];
    await saveSettings({ texty: null });
    await saveSettings({ texty });
    toast('Vráceno původní znění');
    renderTexts(box, settings());
  }));
}

async function renderConnections(box, s) {
  const p = s.propojeni || {};
  const spent = await aiSpent();
  const lastSync = (await get('settings', 'sync:last'))?.value;
  let code = '';
  helperCode().then((c) => { code = c; }).catch(() => {});
  box.innerHTML = String(html`
    <div class="page-head"><h2>Propojení</h2></div>
    <div class="card">
      <div class="card-title"><h3>Mapy.cz</h3>${p.mapyKey ? html`<span class="tag ok">klíč zadán</span>` : html`<span class="tag warn">chybí klíč</span>`}</div>
      <p class="sub" style="margin-top:0">Mapa, doplnění PSČ, okresu a polohy zákazníků, trasa dne a čas jízdy pro „Jedu k vám“. Zdarma do 250 000 kreditů měsíčně.</p>
      <label class="field"><span>API klíč</span><input class="input" id="mapy-key" value="${p.mapyKey || ''}" placeholder="vložíš z developer.mapy.com" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div style="display:flex;gap:10px;margin-top:10px"><button class="btn primary" data-act="mapy-save">Uložit a vyzkoušet</button></div>
      <p class="sub" id="mapy-status" style="margin-bottom:0"></p>
    </div>

    <div class="card">
      <div class="card-title"><h3>Google – Kalendář, Gmail, Disk</h3>${hasHelper() ? html`<span class="tag ok">spojeno</span>` : html`<span class="tag warn">nenastaveno</span>`}</div>
      <p class="sub" style="margin-top:0">Malý pomocník běží pod tvým účtem KominictviJK@gmail.com. Posílá e-maily se zprávou a fakturou, hledá v Gmailu poptávky a nákupy, zapisuje návštěvy do Google Kalendáře a každý den uloží zálohu na Disk. Nastavuje se jednou, asi 10 minut.</p>
      <ol class="steps-list">
        <li><button class="btn small soft" data-act="copy-code">Zkopírovat kód pomocníka</button> <span class="sub" id="copy-status"></span></li>
        <li>Otevři <b>script.google.com</b> přihlášený jako <b>KominictviJK@gmail.com</b> → <b>Nový projekt</b>. Smaž, co tam je, vlož kód a ulož (ikona diskety). Projekt pojmenuj „Kominictví pomocník“.</li>
        <li>V editoru (ikona <b>&lt; &gt;</b> vlevo) vyber nahoře v rozbalovacím seznamu funkci <b>povolitPristup</b> → <b>Spustit</b> → <b>Zkontrolovat oprávnění</b> → vyber účet → <b>Rozšířená nastavení</b> → <b>Přejít na Kominictví pomocník</b> → <b>Povolit</b>.</li>
        <li>Vpravo nahoře <b>Implementovat → Nová implementace</b> → ozubené kolo u „Vyberte typ“ → <b>Webová aplikace</b>. Spustit jako: <b>Já</b>, Kdo má přístup: <b>Kdokoli</b> → <b>Implementovat</b>.</li>
        <li>Zkopíruj <b>adresu webové aplikace</b> (končí na /exec) a vlož ji sem:</li>
      </ol>
      <label class="field"><span>Adresa pomocníka</span><input class="input" id="g-url" value="${p.googleUrl || ''}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn primary" data-act="g-save">Uložit a vyzkoušet</button>
        ${hasHelper() ? html`<button class="btn soft" data-act="g-sync">Synchronizovat teď</button>` : ''}
      </div>
      <p class="sub" id="g-status" style="margin-bottom:0">${lastSync ? `Naposledy synchronizováno ${fmtDate(new Date(lastSync))} v ${new Date(lastSync).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}. Synchronizace běží sama po otevření aplikace (nejvýš co 30 minut).` : ''}</p>
    </div>

    <div class="card">
      <div class="card-title"><h3>AI (Claude)</h3>${hasAi() ? html`<span class="tag ok">klíč zadán</span>` : html`<span class="tag warn">chybí klíč</span>`}</div>
      <p class="sub" style="margin-top:0">Přečte účtenku, štítek kotle, fakturu za materiál nebo screenshot poptávky a vyplní to za tebe. Platí se jen za použití – při běžném provozu desítky korun měsíčně.</p>
      <ol class="steps-list">
        <li>Na <b>platform.claude.com</b> se přihlas (stačí e-mail KominictviJK) a v <b>Billing</b> dobij kredit (stačí 5 $).</li>
        <li>V <b>API keys → Create key</b> vytvoř klíč „Kominictví iPad“, zkopíruj ho a vlož sem.</li>
      </ol>
      <label class="field"><span>API klíč</span><input class="input" type="password" id="ai-key" value="${p.aiKey || ''}" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div class="field" style="margin-top:8px"><span>Model</span><div class="chips">
        ${[['claude-haiku-4-5-20251001', 'Rychlý a levný (doporučeno)'], ['claude-sonnet-5-5', 'Přesnější, dražší']].map(([k, l]) => html`<label class="chip"><input type="radio" name="ai-m" value="${k}" ${(p.aiModel || 'claude-haiku-4-5-20251001') === k ? 'checked' : ''}> ${l}</label>`)}
      </div></div>
      <div style="display:flex;gap:10px;margin-top:10px"><button class="btn primary" data-act="ai-save">Uložit a vyzkoušet</button></div>
      <p class="sub" id="ai-status" style="margin-bottom:0">Tento měsíc: ${spent.calls} ${spent.calls === 1 ? 'dotaz' : spent.calls >= 2 && spent.calls <= 4 ? 'dotazy' : 'dotazů'} · přibližně ${spent.czk.toFixed(spent.czk < 10 ? 1 : 0).replace('.', ',')} Kč</p>
    </div>

    <div class="card">
      <div class="card-title"><h3>Banka</h3>${p.fioToken ? html`<span class="tag ok">napojeno</span>` : html`<span class="tag">ruční výpis</span>`}</div>
      <p class="sub" style="margin-top:0">Platby na účet se samy spárují s fakturami a QR platbami podle variabilního symbolu. Platby kartou z podnikatelského účtu se objeví ve Financích → Náklady „ke kontrole“.</p>
      <label class="field"><span>Token Fio banky (jen pokud budeš mít Fio)</span><input class="input" type="password" id="fio" value="${p.fioToken || ''}" placeholder="Fio internetbanking → Nastavení → API → Přidat token (jen čtení)" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn primary" data-act="fio-save">Uložit</button>
        ${p.fioToken && hasHelper() ? html`<button class="btn soft" data-act="fio-run">Načíst platby teď</button>` : ''}
        <label class="btn soft">Nahrát výpis z banky (CSV)<input type="file" accept=".csv,text/csv,text/plain" id="csv" hidden></label>
      </div>
      <p class="sub" id="bank-status" style="margin-bottom:0">Jiná banka než Fio: jednou za čas stáhni výpis v CSV a nahraj ho sem.</p>
    </div>`);

  const q = (sel) => box.querySelector(sel);
  q('[data-act="mapy-save"]').addEventListener('click', async () => {
    const k = q('#mapy-key').value.trim();
    await saveSettings({ propojeni: { mapyKey: k } });
    const st = q('#mapy-status');
    if (!k) { st.textContent = 'Klíč smazán.'; return; }
    st.textContent = 'Zkouším…';
    try {
      const g = await geocode(settings().lhuty.domov);
      st.textContent = g ? `✓ Funguje. ${settings().lhuty.domov} → PSČ ${g.zip || '?'}, okres ${g.district || '?'}.` : 'Klíč funguje, ale adresu domova se nepodařilo najít.';
      if (g) await saveSettings({ lhuty: { domovGps: { lat: g.lat, lng: g.lng, addr: settings().lhuty.domov } } });
    } catch (e) { st.textContent = `✕ ${e.message}`; }
  });
  q('[data-act="copy-code"]').addEventListener('click', async () => {
    const st = q('#copy-status');
    try {
      if (!code) code = await helperCode();
      await navigator.clipboard.writeText(code);
      st.textContent = '✓ Zkopírováno – teď ho vlož do script.google.com';
    } catch {
      const r = await modal({ title: 'Kód pomocníka', body: String(html`<p class="sub">Označ celý text (ťukni dovnitř → Vybrat vše) a zkopíruj.</p><textarea rows="12" style="width:100%;font-family:monospace;font-size:12px" readonly>${code}</textarea>`) });
      void r;
    }
  });
  q('[data-act="g-save"]').addEventListener('click', async () => {
    const url = q('#g-url').value.trim();
    const st = q('#g-status');
    await ensureToken();
    await saveSettings({ propojeni: { googleUrl: url } });
    if (!url) { st.textContent = 'Adresa smazána.'; return; }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url)) { st.textContent = '✕ Adresa má vypadat jako https://script.google.com/macros/s/…/exec'; return; }
    st.textContent = 'Zkouším spojení…';
    try {
      const r = await callHelper('ping', {}, { timeout: 30000 });
      st.textContent = `✓ Funguje. Pomocník běží pod účtem ${r.email || 'Google'}. Spouštím první synchronizaci…`;
      const sr = await runSync();
      st.textContent = `✓ Funguje (${r.email || 'Google'}). ${sr}`;
      setTimeout(() => renderConnections(box, settings()), 2500);
    } catch (e) { st.textContent = `✕ ${e.message}`; }
  });
  q('[data-act="g-sync"]')?.addEventListener('click', async () => {
    const st = q('#g-status');
    st.textContent = 'Synchronizuji…';
    try { st.textContent = `✓ ${await runSync()}`; } catch (e) { st.textContent = `✕ ${e.message}`; }
  });
  q('[data-act="ai-save"]').addEventListener('click', async () => {
    const k = q('#ai-key').value.trim();
    const st = q('#ai-status');
    await saveSettings({ propojeni: { aiKey: k, aiModel: box.querySelector('input[name="ai-m"]:checked').value } });
    if (!k) { st.textContent = 'Klíč smazán.'; return; }
    st.textContent = 'Zkouším…';
    try { await testAi(); st.textContent = '✓ Funguje. Účtenky, štítky i poptávky se teď budou číst samy.'; } catch (e) { st.textContent = `✕ ${e.message}`; }
  });
  q('[data-act="fio-save"]').addEventListener('click', async () => {
    await saveSettings({ propojeni: { fioToken: q('#fio').value.trim() } });
    toast('Uloženo');
    renderConnections(box, settings());
  });
  q('[data-act="fio-run"]')?.addEventListener('click', async () => {
    const st = q('#bank-status');
    st.textContent = 'Načítám platby…';
    try { const r = await fetchBank(); st.textContent = `✓ Spárováno plateb: ${r.paired} · nových nákladů ke kontrole: ${r.suggested}`; } catch (e) { st.textContent = `✕ ${e.message}`; }
  });
  q('#csv').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const st = q('#bank-status');
    try {
      const buf = await f.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('�')) text = new TextDecoder('windows-1250').decode(buf);
      const txs = parseStatement(text);
      if (!txs.length) { st.textContent = '✕ Ve výpisu jsem nenašel žádné platby. Zkus export ve formátu CSV.'; return; }
      const r = await applyTransactions(txs);
      st.textContent = `✓ Načteno ${txs.length} plateb · spárováno ${r.paired} · nových nákladů ke kontrole ${r.suggested}`;
    } catch (err) { st.textContent = `✕ ${err.message}`; }
  });
}

async function runSync() {
  const cal = await syncCalendar();
  const mails = await scanGmail();
  await put('settings', { key: 'sync:last', value: new Date().toISOString() });
  return `Kalendář: ${cal?.pushed ?? 0} záznamů zapsáno · Gmail: ${mails} ${mails === 1 ? 'nová položka' : mails >= 2 && mails <= 4 ? 'nové položky' : 'nových položek'} ke kontrole.`;
}
