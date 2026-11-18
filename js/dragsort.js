// Přetahování prstem v seznamu s časovými bloky (Dnes)
// Položky: [data-drag][data-id]; hlavičky bloků: .block-head[data-block]; prázdné bloky: .drop-zone
// Začátek: chycení za .grip hned, jinde podržení prstu (350 ms). Okraje seznamu posouvají stránku.
const HOLD_MS = 350;

export function enableDrag(list, onDrop) {
  let pending = null; // čekání na podržení
  let drag = null; // probíhající přetahování

  const scroller = (() => {
    let n = list.parentElement;
    while (n && n !== document.body) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') return n;
      n = n.parentElement;
    }
    return document.scrollingElement;
  })();

  const snapshot = () => {
    const out = [];
    let block = null;
    for (const ch of list.children) {
      if (ch.classList.contains('block-head')) block = ch.dataset.block;
      else if (ch.dataset.id) out.push({ id: ch.dataset.id, block });
      else if (drag && ch === drag.ph) out.push({ id: drag.item.dataset.id, block });
    }
    return out;
  };

  function start(item, x, y) {
    pending = null;
    const before = snapshot();
    list.classList.add('dragging');
    const r = item.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.className = 'drag-ph';
    ph.style.height = `${r.height}px`;
    item.before(ph);
    Object.assign(item.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, zIndex: 60, pointerEvents: 'none', margin: 0 });
    item.classList.add('lifted');
    drag = { item, ph, dy: y - r.top, y, before };
    navigator.vibrate?.(15);
    place(y);
    drag.raf = requestAnimationFrame(tick);
  }

  function place(y) {
    const { item, ph } = drag;
    item.style.top = `${y - drag.dy}px`;
    const els = [...list.children].filter((c) => c !== item && c !== ph && c.offsetParent !== null);
    let target = els.find((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2 > y; });
    if (target && target === els[0] && target.classList.contains('block-head')) target = target.nextElementSibling === ph ? ph.nextElementSibling : target.nextElementSibling;
    if (target === ph) return;
    if (target) { if (ph.nextElementSibling !== target) target.before(ph); } else if (list.lastElementChild !== ph) list.append(ph);
  }

  function tick() {
    if (!drag) return;
    const r = scroller.getBoundingClientRect?.() || { top: 0, bottom: innerHeight };
    const top = Math.max(r.top, 0); const bottom = Math.min(r.bottom, innerHeight);
    const edge = 70;
    let v = 0;
    if (drag.y < top + edge) v = -Math.ceil((top + edge - drag.y) / 6);
    else if (drag.y > bottom - edge) v = Math.ceil((drag.y - (bottom - edge)) / 6);
    if (v) { scroller.scrollTop += v; place(drag.y); }
    drag.raf = requestAnimationFrame(tick);
  }

  function finish() {
    if (!drag) return;
    const { item, ph, before, raf } = drag;
    cancelAnimationFrame(raf);
    const after = snapshot();
    ph.replaceWith(item);
    item.removeAttribute('style');
    item.classList.remove('lifted');
    list.classList.remove('dragging');
    drag = null;
    release();
    // kliknutí, které po puštění prstu dopadne na tlačítko, ignorovat
    const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 350);
    const same = before.length === after.length && before.every((b, i) => b.id === after[i].id && b.block === after[i].block);
    if (!same) onDrop({ order: after, moved: item.dataset.id });
  }

  const onMove = (e) => {
    if (drag) { drag.y = e.clientY; place(e.clientY); return; }
    if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 10) release();
  };
  const onUp = () => { const was = !!drag; release(); if (was) finish(); };
  function release() {
    if (pending) { clearTimeout(pending.timer); pending = null; }
    if (!drag) { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); }
  }
  function listen() {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  list.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('[data-drag]');
    if (!item || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('.grip')) { e.preventDefault(); listen(); start(item, e.clientX, e.clientY); return; }
    if (e.target.closest('button, a, input, textarea, select')) return;
    listen();
    pending = { item, x: e.clientX, y: e.clientY, timer: setTimeout(() => pending && start(item, pending.x, pending.y), HOLD_MS) };
  });
  // během přetahování se stránka nesmí posouvat prstem
  list.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  list.addEventListener('contextmenu', (e) => { if (drag || pending) e.preventDefault(); });
}
