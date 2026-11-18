// Náhled PDF po stránkách (iPad v rámečku ukáže jen 1. stranu, proto vykreslujeme sami přes pdf.js)
let lib = null;
async function pdfjs() {
  if (lib) return lib;
  lib = await import('../vendor/pdfjs.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs.worker.mjs', import.meta.url).href;
  return lib;
}

export async function renderPdf(blob, box) {
  box.innerHTML = '<div class="pdfpages"><p class="sub">Připravuji náhled…</p></div>';
  const wrap = box.firstElementChild;
  try {
    const { getDocument } = await pdfjs();
    const doc = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    wrap.innerHTML = '';
    const width = Math.min(wrap.clientWidth || 800, 900);
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
