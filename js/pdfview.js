// Náhled PDF po stránkách (iPad v rámečku ukáže jen 1. stranu, proto vykreslujeme sami přes pdf.js)
let lib = null;
async function pdfjs() {
  if (lib) return lib;
  lib = await import('../vendor/pdfjs.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs.worker.mjs', import.meta.url).href;
  return lib;
}

export async function renderPdf(blob, box, { full = false } = {}) {
  box.innerHTML = `<div class="pdfpages${full ? ' full' : ''}"><p class="sub">Připravuji náhled…</p></div>`;
  const wrap = box.firstElementChild;
  try {
    const { getDocument } = await pdfjs();
    const doc = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    wrap.innerHTML = '';
    const width = Math.min((wrap.clientWidth || 800) - 8, full ? 1100 : 900);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      canvas.style.width = `${width}px`;
      canvas.className = 'pdfpage';
      const fig = document.createElement('figure');
      fig.appendChild(canvas);
      if (doc.numPages > 1) { const cap = document.createElement('figcaption'); cap.textContent = `strana ${i} z ${doc.numPages}`; fig.appendChild(cap); }
      wrap.appendChild(fig);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    console.error(e);
    wrap.innerHTML = `<iframe class="pdfview" src="${URL.createObjectURL(blob)}" title="Náhled PDF"></iframe>`;
  }
}

// Náhled přes celou obrazovku: zavře se křížkem, tahem dolů (když je nahoře) nebo ťuknutím dvěma prsty
export function openPdfViewer(blob, title = 'Náhled') {
  const ov = document.createElement('div');
  ov.className = 'pdf-overlay';
  ov.innerHTML = `<div class="pdf-bar"><b></b><span class="sub">tah dolů nebo ťuknutí dvěma prsty zavře</span><button type="button" class="pdf-close" aria-label="Zavřít náhled">✕</button></div><div class="pdf-body"></div>`;
  ov.querySelector('b').textContent = title;
  document.body.appendChild(ov);
  const body = ov.querySelector('.pdf-body');
  const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 180); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.querySelector('.pdf-close').addEventListener('click', close);
  // gesta
  let startY = null, pulled = 0, twoFinger = false, moved = false;
  body.addEventListener('touchstart', (e) => {
    twoFinger = e.touches.length === 2; moved = false;
    startY = e.touches.length === 1 && body.scrollTop <= 0 ? e.touches[0].clientY : null; pulled = 0;
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    moved = true;
    if (startY === null) return;
    pulled = e.touches[0].clientY - startY;
    if (pulled > 0) body.style.transform = `translateY(${Math.min(pulled, 200) / 2}px)`;
  }, { passive: true });
  body.addEventListener('touchend', (e) => {
    if (twoFinger && !moved && e.touches.length === 0) { close(); return; }
    body.style.transform = '';
    if (pulled > 120) close();
    startY = null; pulled = 0;
  });
  renderPdf(blob, body, { full: true });
  return close;
}
