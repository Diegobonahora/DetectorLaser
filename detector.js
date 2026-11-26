// Detección de punto láser rojo: análisis de manchas y seguimiento en el tiempo.
(function (root) {
  "use strict";

  function umbrales(s) {
    s = Math.max(1, Math.min(10, Number(s) || 5));
    return { rMin: Math.round(240 - s * 8), dif: Math.round(125 - s * 9) };
  }

  // img: {data, width, height} (como ImageData). Devuelve candidatos [{x, y, area, elong}]
  function analizar(img, sens, cfg) {
    const data = img.data, w = img.width, h = img.height, n = w * h;
    const u = umbrales(sens);
    const mask = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const mx = g > b ? g : b;
      if (r >= u.rMin && r - mx >= u.dif) mask[i] = 1;            // rojo intenso
      else if (r >= 235 && g >= 235 && b >= 235) mask[i] = 2;      // núcleo casi blanco
    }
    const vis = new Uint8Array(n), stack = new Int32Array(n), out = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (!mask[s0] || vis[s0]) continue;
      let sp = 0; stack[sp++] = s0; vis[s0] = 1;
      let area = 0, red = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      let x0 = w, x1 = -1, y0 = h, y1 = -1;
      while (sp > 0) {
        const i = stack[--sp], x = i % w, y = (i - x) / w;
        area++; if (mask[i] === 1) red++;
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy; if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx; if (nx < 0 || nx >= w) continue;
            const j = ny * w + nx;
            if (mask[j] && !vis[j]) { vis[j] = 1; stack[sp++] = j; }
          }
        }
      }
      if (area < cfg.areaMin || area > cfg.areaMax) continue;
      if (red < 2 || red / area < 0.25) continue;                  // debe ser mayormente rojo
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (area / (bw * bh) < cfg.rellenoMin) continue;
      const mx = sx / area, my = sy / area;
      const vxx = sxx / area - mx * mx + 1 / 12;
      const vyy = syy / area - my * my + 1 / 12;
      const vxy = sxy / area - mx * my;
      const disc = Math.sqrt(Math.max(0, (vxx - vyy) * (vxx - vyy) / 4 + vxy * vxy));
      const l1 = (vxx + vyy) / 2 + disc, l2 = (vxx + vyy) / 2 - disc;
      const elong = Math.sqrt(l1 / Math.max(l2, 1e-6));
      if (elong > cfg.elongMax) continue;
      out.push({ x: mx, y: my, area: area, elong: elong });
    }
    return out;
  }

  // Seguimiento: confirma un punto que se mantiene quieto y descarta objetos fijos.
  function Seguimiento(cfg) {
    this.cfg = cfg;
    this.tracks = [];
    this.inicio = null;
    this.descansoHasta = 0;
  }
  Seguimiento.prototype.reiniciar = function () { this.tracks = []; this.inicio = null; };
  Seguimiento.prototype.descansar = function (ahora) { this.descansoHasta = ahora + this.cfg.descansoMs; };
  Seguimiento.prototype.calentando = function (ahora) {
    return this.inicio !== null && ahora - this.inicio < this.cfg.calentamientoMs;
  };
  Seguimiento.prototype.paso = function (cands, ahora) {
    const c = this.cfg;
    if (this.inicio === null) this.inicio = ahora;
    const usados = new Set();
    for (const cand of cands) {
      let mejor = null, md = Infinity;
      for (const t of this.tracks) {
        if (usados.has(t)) continue;
        const d = Math.hypot(t.ax - cand.x, t.ay - cand.y);
        if (d <= c.radioSeguimiento && d < md) { md = d; mejor = t; }
      }
      if (mejor) {
        mejor.x = cand.x; mejor.y = cand.y; mejor.visto = ahora; usados.add(mejor);
      } else {
        const t = { ax: cand.x, ay: cand.y, x: cand.x, y: cand.y, desde: ahora, visto: ahora, capturado: false };
        this.tracks.push(t); usados.add(t);
      }
    }
    this.tracks = this.tracks.filter(t => ahora - t.visto <= c.perdidaMs);
    let confirmado = null;
    const visibles = [];
    const puedeCapturar = !this.calentando(ahora) && ahora >= this.descansoHasta;
    for (const t of this.tracks) {
      const edad = ahora - t.desde;
      const estatico = edad > c.fijoMs || (this.calentando(ahora) && edad >= c.confirmarMs);
      if (ahora - t.visto < c.perdidaMs) visibles.push({ x: t.x, y: t.y, estatico: estatico });
      if (!confirmado && puedeCapturar && !estatico && !t.capturado && edad >= c.confirmarMs) {
        t.capturado = true; confirmado = { x: t.x, y: t.y };
      }
    }
    return { visibles: visibles, confirmado: confirmado };
  };

  const API = { analizar: analizar, Seguimiento: Seguimiento, umbrales: umbrales };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Detector = API;
})(typeof self !== "undefined" ? self : this);
