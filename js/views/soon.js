// Obrazovky, které se teprve staví
import { html } from '../ui.js';

const WHAT = {
  poptavky: 'Trychtýř Oslovit → Čeká na odpověď → Poptávky a výjezdy, připomínky a SMS.',
  kalendar: 'Diář s prací, výjezdy, osobními událostmi, úkoly a propojením s Google kalendářem.',
  zakaznici: 'Seznam zákazníků, hledání, strom okres → obec → ulice a karta zákazníka.',
  mapa: 'Mapa Mapy.cz se špendlíky podle lhůty a paliva, oblasti a výběr prstem.',
  historie: 'Archiv všech dokumentů, kontrola číselné řady, storno a export.',
  finance: 'Přehled, faktury, nabídky a náklady.',
};

export async function render(el, { entry }) {
  el.innerHTML = String(html`
    <div class="soon">
      <span class="stage">Etapa ${entry.stage}</span>
      <h1>${entry.label}</h1>
      <p style="max-width:480px">${WHAT[entry.id] || ''}</p>
      <p>Tahle obrazovka přijde na řadu v etapě ${entry.stage}.</p>
    </div>`);
}
