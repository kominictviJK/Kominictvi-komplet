// SMS fronta: připravené zprávy, každá se otevře ve Zprávách a odešle jedním ťuknutím
import { html } from './ui.js';
import { smsUrl } from './texts.js';
import { fmtPhone } from './ui.js';

// items: [{ name, phone, body, onSent? }]
export function smsQueue({ title, items, note = '' }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const sent = new Set();
    const draw = () => {
      root.innerHTML = String(html`
        <div class="modal-back">
          <div class="modal wide" role="dialog" aria-modal="true" aria-label="${title}">
            <div class="card-title"><h2>${title}</h2><span class="sub">${sent.size} / ${items.length} odesláno</span></div>
            ${note ? html`<p class="sub" style="margin:0">${note}</p>` : ''}
            <div class="smslist">
              ${items.map((it, i) => html`
                <div class="smsitem ${sent.has(i) ? 'sent' : ''}">
                  <div class="card-title" style="margin-bottom:6px"><b>${it.name}</b><span class="sub">${it.phone ? fmtPhone(it.phone) : 'bez telefonu'}</span></div>
                  <textarea class="input" data-i="${i}" rows="4">${it.body}</textarea>
                  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
                    ${sent.has(i) ? html`<span class="tag ok">odesláno</span>` : ''}
                    ${it.phone ? html`<a class="btn small ${sent.has(i) ? '' : 'primary'}" data-send="${i}" href="${smsUrl(it.phone, it.body)}">${sent.has(i) ? 'Otevřít znovu' : 'Otevřít SMS'}</a>` : html`<span class="tag bad">chybí telefon</span>`}
                  </div>
                </div>`)}
            </div>
            <div class="actions"><button class="btn primary" data-close>Hotovo</button></div>
          </div>
        </div>`);
      root.querySelectorAll('textarea[data-i]').forEach((t) => t.addEventListener('input', () => {
        const i = Number(t.dataset.i);
        items[i].body = t.value;
        root.querySelector(`[data-send="${i}"]`)?.setAttribute('href', smsUrl(items[i].phone, t.value));
      }));
      root.querySelectorAll('[data-send]').forEach((a) => a.addEventListener('click', () => {
        const i = Number(a.dataset.send);
        // značka „odesláno“ až po návratu do aplikace
        setTimeout(async () => { if (!sent.has(i)) { sent.add(i); await items[i].onSent?.(); draw(); } }, 600);
      }));
      root.querySelector('[data-close]').addEventListener('click', () => { root.innerHTML = ''; resolve([...sent]); });
    };
    draw();
  });
}
