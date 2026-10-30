// Podpisové pole pro Apple Pencil i prst – tloušťka čáry podle přítlaku
export function signaturePad(canvas, { color = '#1F2A55', onChange } = {}) {
  const ctx = canvas.getContext('2d');
  let strokes = [];
  let current = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  const widthFor = (p) => 1.2 + (p.pressure || 0.5) * 3.2;

  function drawSegment(a, b) {
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (widthFor(a) + widthFor(b)) / 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function redraw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    for (const s of strokes) for (let i = 1; i < s.length; i++) drawSegment(s[i - 1], s[i]);
  }

  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    // prst nemá přítlak (0 nebo 0.5) – použít střední hodnotu
    const pressure = e.pointerType === 'pen' ? Math.max(0.1, e.pressure) : 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, pressure };
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    current = [point(e)];
    strokes.push(current);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const p = point(ev);
      drawSegment(current[current.length - 1], p);
      current.push(p);
    }
  });
  const end = () => { if (current) { current = null; onChange?.(); } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.style.touchAction = 'none';

  resize();
  window.addEventListener('resize', resize);

  return {
    clear() { strokes = []; redraw(); onChange?.(); },
    isEmpty: () => !strokes.some((s) => s.length > 1),
    // PNG s průhledným pozadím, oříznuté na podpis
    toDataURL() {
      if (!strokes.length) return null;
      const pts = strokes.flat();
      const pad = 8;
      const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
      const minY = Math.min(...pts.map((p) => p.y)) - pad, maxY = Math.max(...pts.map((p) => p.y)) + pad;
      const scale = 3;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round((maxX - minX) * scale));
      out.height = Math.max(1, Math.round((maxY - minY) * scale));
      const o = out.getContext('2d');
      o.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
      o.strokeStyle = color; o.lineCap = 'round'; o.lineJoin = 'round';
      for (const s of strokes) for (let i = 1; i < s.length; i++) {
        o.lineWidth = (widthFor(s[i - 1]) + widthFor(s[i])) / 2;
        o.beginPath(); o.moveTo(s[i - 1].x, s[i - 1].y); o.lineTo(s[i].x, s[i].y); o.stroke();
      }
      return out.toDataURL('image/png');
    },
  };
}

// Fotka razítka → průhledné pozadí, oříznutí, modrá barva zachována
export async function stampFromPhoto(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const maxW = 900;
  const scale = Math.min(1, maxW / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, c.width, c.height);
  const data = x.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const light = (r + g + b) / 3;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    // světlé a nebarevné = papír → průhledné
    const alpha = light > 200 && sat < 40 ? 0 : Math.min(255, Math.max(0, (235 - light) * 3 + sat * 2));
    d[i + 3] = alpha;
    if (alpha > 60) {
      const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width);
      if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
  }
  x.putImageData(data, 0, 0);
  if (maxX <= minX || maxY <= minY) return c.toDataURL('image/png');
  const pad = 6;
  const out = document.createElement('canvas');
  out.width = maxX - minX + pad * 2; out.height = maxY - minY + pad * 2;
  out.getContext('2d').drawImage(c, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
