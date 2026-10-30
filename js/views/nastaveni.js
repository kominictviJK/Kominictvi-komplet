// Nastavení – sekce vlevo, obsah vpravo; změny platí od teď (vydané dokumenty se nemění)
import { settings, saveSettings, guideSteps } from '../settings.js';
import { counterState } from '../numbering.js';
import { all, restoreFromTrash } from '../db.js';
import { resetTrialData } from '../seed.js';
import { html, raw, toast, modal, fmtDate } from '../ui.js';
import { APP_VERSION } from '../version.js';

const SECTIONS = [
  { id: 'firma', label: 'Firma a já', sub: (s) => 'údaje, logo, razítko, podpis, účet', warn: (s) => !s.firma.ucet || !s.firma.razitko },
  { id: 'cenik', label: 'Ceník', sub: (s) => `${s.cenik.kontrola.join(' / ')} · frézování ${s.cenik.frezovaniZaMetr}/m · ${s.cenik.dopravaZaKm} Kč/km` },
  { id: 'cislovani', label: 'Dokumenty a číslování', sub: () => 'šablony · číselné řady' },
  { id: 'katalog', label: 'Katalog závad', sub: () => '13 nedostatků · 12 doporučení', stage: 3 },
  { id: 'texty', label: 'Texty pro zákazníky', sub: () => 'SMS a e-maily', stage: 4 },
  { id: 'lhuty', label: 'Lhůty a plánování', sub: (s) => `${s.lhuty.tuhaMesice} / ${s.lhuty.kondenzacniMesice} měsíců · oslovit ${s.lhuty.oslovitMesicePredem} měs. předem` },
  { id: 'finance', label: 'Finance', sub: () => 'limit paušálu · kategorie · upomínky', stage: 6 },
  { id: 'propojeni', label: 'Propojení', sub: () => 'Google · Mapy.cz · AI · banka', warn: () => true, stage: 7 },
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
          <p class="sub" style="margin:0">Vyfotíš razítko na bílém papíře, aplikace odstraní pozadí.</p>
          <span class="tag warn" style="align-self:flex-start">přijde v etapě 3</span>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:10px">
          <h3>Podpis</h3>
          <p class="sub" style="margin:0">Podepíšeš se Pencilem, vloží se na všechny dokumenty.</p>
          <span class="tag warn" style="align-self:flex-start">přijde v etapě 3</span>
        </div>
      </div>` : ''}
  `);
  box.querySelectorAll('input[data-path]').forEach((inp) => inp.addEventListener('change', async () => {
    let value = inp.value.trim();
    if (inp.dataset.type === 'num') value = Number(value.replace(',', '.')) || 0;
    if (inp.dataset.type === 'list') value = value.split(/[,;\s]+/).map(Number).filter((n) => n > 0);
    await saveSettings(patchFor(inp.dataset.path, value));
    toast('Uloženo');
  }));
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
  box.innerHTML = String(html`
    <div class="page-head"><h2>Data a bezpečnost</h2></div>
    <div class="card">
      <div class="card-title"><h3>Režim aplikace</h3>${s.rezim.zkusebni ? html`<span class="tag warn">zkušební režim</span>` : html`<span class="tag ok">ostrý provoz</span>`}</div>
      <p class="sub" style="margin-top:0">${s.rezim.zkusebni
        ? 'Aplikace běží s vymyšlenými zákazníky. Můžeš zkoušet cokoli – nic se nikam neposílá naostro a čísla dokladů jsou zkušební.'
        : `Ostrý provoz od ${s.rezim.ostryOd ? fmtDate(new Date(s.rezim.ostryOd)) : '—'}.`}</p>
      ${s.rezim.zkusebni ? html`<div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn soft" data-act="reset">Obnovit zkušební data</button>
        <button class="btn" disabled title="Zpřístupní se po dokončení stavby">Přepnout na ostrý provoz</button>
      </div>` : ''}
    </div>
    <div class="card">
      <div class="card-title"><h3>Koš</h3><span class="sub">smazané položky jde 30 dní obnovit</span></div>
      ${trash.length ? trash.map((t) => html`<div class="kv"><span>${fmtDate(new Date(t.deletedAt))}</span><b style="flex-grow:1">${t.label || t.id}</b><button class="btn small" data-restore="${t.id}">Obnovit</button></div>`)
        : html`<p class="sub" style="margin:0">Koš je prázdný.</p>`}
    </div>
    <div class="card">
      <div class="card-title"><h3>Zálohy a Face ID</h3><span class="tag warn">etapa 7</span></div>
      <p class="sub" style="margin:0">Automatická záloha na Google Disk, ruční záloha na flashku a zámek Face ID po ${s.bezpecnost.zamekMinuty} minutách.</p>
    </div>
    <p class="sub">Verze aplikace ${APP_VERSION}</p>
  `);
  box.querySelector('[data-act="reset"]')?.addEventListener('click', async () => {
    const ok = await modal({ title: 'Obnovit zkušební data?', body: '<p>Smažou se všechny zkušební záznamy a nahrají se znovu ukázkoví zákazníci.</p>', actions: [{ label: 'Zrušit', value: false }, { label: 'Obnovit', value: true, kind: 'primary' }] });
    if (!ok) return;
    await resetTrialData();
    toast('Zkušební data obnovena');
    rerender();
  });
  box.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
    await restoreFromTrash(b.dataset.restore);
    toast('Obnoveno');
    rerender();
  }));
}
