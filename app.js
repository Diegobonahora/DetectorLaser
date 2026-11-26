"use strict";
(function () {
  const $ = s => document.querySelector(s);
  const video = $("#video"), overlay = $("#overlay"), octx = overlay.getContext("2d");
  const proc = document.createElement("canvas");
  const pctx = proc.getContext("2d", { willReadFrequently: true });

  let stream = null, track = null, seg = new Detector.Seguimiento(CONFIG);
  let ultimo = 0, db = null, fichaId = null, urls = [], avisoTimer = null, fotos = [];

  // ---------- Ajustes ----------
  function leerAjustes() { try { return JSON.parse(localStorage.getItem("laser-ajustes") || "{}"); } catch (e) { return {}; } }
  const ajustes = Object.assign({ sens: CONFIG.sensibilidadInicial, debug: false, expo: false, camId: "", zoom: 1 }, leerAjustes());
  function guardarAjustes() { try { localStorage.setItem("laser-ajustes", JSON.stringify(ajustes)); } catch (e) {} }

  // ---------- Base de datos (IndexedDB) ----------
  function abrirDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("detector-laser", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("fotos", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function dbOp(modo, fn) {
    return new Promise((res, rej) => {
      const tx = db.transaction("fotos", modo), st = tx.objectStore("fotos");
      const rq = fn(st);
      tx.oncomplete = () => res(rq ? rq.result : undefined);
      tx.onerror = () => rej(tx.error);
    });
  }
  const dbTodas = () => dbOp("readonly", s => s.getAll());
  const dbGuardar = f => dbOp("readwrite", s => s.put(f));
  const dbBorrar = id => dbOp("readwrite", s => s.delete(id));

  // ---------- Pestañas ----------
  document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach(x => x.classList.toggle("on", x === b));
    $("#camara").hidden = b.dataset.tab !== "camara";
    $("#galeria").hidden = b.dataset.tab !== "galeria";
    if (b.dataset.tab === "galeria") renderGaleria();
  }));

  // ---------- Cámara ----------
  const esGranAngular = t => /ultra|wide|0[.,]5|gran/i.test(t || "");

  async function listarCamaras() {
    const sel = $("#selCam");
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
    sel.innerHTML = '<option value="">Automática (evita gran angular)</option>';
    devs.forEach((d, i) => {
      const o = document.createElement("option");
      o.value = d.deviceId; o.textContent = d.label || ("Cámara " + (i + 1));
      sel.appendChild(o);
    });
    sel.value = devs.some(d => d.deviceId === ajustes.camId) ? ajustes.camId : "";
    return devs;
  }

  async function pedirStream() {
    const v = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (ajustes.camId) v.deviceId = { exact: ajustes.camId }; else v.facingMode = { ideal: "environment" };
    try { return await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); }
    catch (e) {
      if (ajustes.camId) { ajustes.camId = ""; guardarAjustes(); return pedirStream(); }
      throw e;
    }
  }

  async function iniciarCamara() {
    detener();
    $("#estado").textContent = "Pidiendo permiso de cámara…";
    try {
      stream = await pedirStream();
      let devs = await listarCamaras();
      track = stream.getVideoTracks()[0];
      // Sin cámara elegida: si el sistema abrió el gran angular, probar con otra trasera
      if (!ajustes.camId && esGranAngular(track.label)) {
        const alt = devs.find(d => /back|rear|trasera|environment/i.test(d.label) && !esGranAngular(d.label) && d.deviceId !== track.getSettings().deviceId);
        if (alt) {
          stream.getTracks().forEach(t => t.stop());
          ajustes.camId = alt.deviceId;
          stream = await pedirStream();
          track = stream.getVideoTracks()[0];
          await listarCamaras();
        }
      }
      video.srcObject = stream;
      await video.play();
      await new Promise(r => video.videoWidth ? r() : video.addEventListener("loadedmetadata", r, { once: true }));
      $("#visor").style.aspectRatio = video.videoWidth + " / " + video.videoHeight;
      proc.width = CONFIG.anchoProceso;
      proc.height = Math.round(CONFIG.anchoProceso * video.videoHeight / video.videoWidth);
      overlay.width = proc.width; overlay.height = proc.height;
      aplicarCapacidades();
      seg = new Detector.Seguimiento(CONFIG);
      $("#btnCam").hidden = true; $("#btnParar").hidden = false;
      requestAnimationFrame(bucle);
    } catch (e) {
      $("#estado").textContent = "No se pudo abrir la cámara: " + (e && e.name === "NotAllowedError" ? "permiso denegado." : (e && e.message || e));
      detener(true);
    }
  }

  function aplicarCapacidades() {
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    const zb = $("#zoomBox");
    if (caps.zoom) {
      const z = $("#zoom");
      z.min = caps.zoom.min; z.max = caps.zoom.max; z.step = caps.zoom.step || 0.1;
      const val = Math.min(Math.max(ajustes.zoom || 1, caps.zoom.min), caps.zoom.max);
      z.value = val; $("#zoomVal").textContent = Number(val).toFixed(1) + "x";
      zb.hidden = false;
      track.applyConstraints({ advanced: [{ zoom: val }] }).catch(() => {});
    } else zb.hidden = true;
    aplicarExposicion();
  }

  function aplicarExposicion() {
    if (!track || !track.getCapabilities) return;
    const caps = track.getCapabilities();
    if (!caps.exposureCompensation) return;
    const e = caps.exposureCompensation;
    const val = ajustes.expo ? e.min + (e.max - e.min) * 0.15 : Math.min(Math.max(0, e.min), e.max);
    track.applyConstraints({ advanced: [{ exposureCompensation: val }] }).catch(() => {});
  }

  function detener(silencioso) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; track = null; video.srcObject = null;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    $("#btnCam").hidden = false; $("#btnParar").hidden = true;
    if (!silencioso) $("#estado").textContent = "Cámara apagada";
  }

  // ---------- Bucle de detección ----------
  function bucle() {
    if (!stream) return;
    const ahora = performance.now();
    if (ahora - ultimo >= 1000 / CONFIG.fpsProceso && video.readyState >= 2) {
      ultimo = ahora;
      procesar(ahora);
    }
    requestAnimationFrame(bucle);
  }

  function procesar(ahora) {
    pctx.drawImage(video, 0, 0, proc.width, proc.height);
    const img = pctx.getImageData(0, 0, proc.width, proc.height);
    const cands = Detector.analizar(img, ajustes.sens, CONFIG);
    const r = seg.paso(cands, ahora);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (ajustes.debug) {
      octx.lineWidth = 2;
      r.visibles.forEach(t => {
        octx.strokeStyle = t.estatico ? "#f97316" : "#22c55e";
        octx.beginPath(); octx.arc(t.x, t.y, 7, 0, Math.PI * 2); octx.stroke();
      });
    }
    if (seg.calentando(ahora)) $("#estado").textContent = "Calibrando entorno… no apuntes el láser todavía";
    else if (ahora < seg.descansoHasta) $("#estado").textContent = "Foto guardada. Descansando…";
    else $("#estado").textContent = "Buscando láser… (candidatos: " + r.visibles.filter(t => !t.estatico).length + ")";
    if (r.confirmado) capturar(r.confirmado, ahora);
  }

  // ---------- Captura ----------
  function capturar(p, ahora) {
    seg.descansar(ahora);
    const vw = video.videoWidth, vh = video.videoHeight;
    const c = document.createElement("canvas"); c.width = vw; c.height = vh;
    const cx = c.getContext("2d");
    cx.drawImage(video, 0, 0, vw, vh);
    const x = p.x * vw / proc.width, y = p.y * vh / proc.height;
    const rad = Math.max(24, vw * CONFIG.radioCirculoPct), lw = Math.max(3, vw / 320);
    cx.beginPath(); cx.arc(x, y, rad, 0, Math.PI * 2);
    cx.lineWidth = lw * 2.4; cx.strokeStyle = "#000"; cx.stroke();
    cx.lineWidth = lw; cx.strokeStyle = "#22ff66"; cx.stroke();
    c.toBlob(async blob => {
      if (!blob) return;
      const f = { id: "f" + Date.now(), fecha: new Date().toISOString(), blob: blob, titulo: "", descripcion: "", lugar: "", etiquetas: [], editado: null };
      try { await dbGuardar(f); } catch (e) { $("#estado").textContent = "No se pudo guardar la foto: " + e; return; }
      if (navigator.vibrate) navigator.vibrate(120);
      mostrarAviso(f.id);
      actualizarCuenta();
    }, "image/jpeg", CONFIG.calidadJpeg);
  }

  function mostrarAviso(id) {
    const a = $("#aviso");
    a.textContent = "Foto guardada · tocá para agregar información";
    a.hidden = false; a.onclick = () => { a.hidden = true; abrirFoto(id); };
    clearTimeout(avisoTimer); avisoTimer = setTimeout(() => { a.hidden = true; }, 6000);
  }

  // ---------- Galería ----------
  async function actualizarCuenta() {
    try { fotos = await dbTodas(); $("#cuenta").textContent = fotos.length ? "(" + fotos.length + ")" : ""; } catch (e) {}
  }

  async function renderGaleria() {
    urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    fotos = await dbTodas();
    fotos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    $("#cuenta").textContent = fotos.length ? "(" + fotos.length + ")" : "";
    const q = $("#buscar").value.trim().toLowerCase();
    const lista = fotos.filter(f => !q || [f.titulo, f.descripcion, f.lugar, (f.etiquetas || []).join(" ")].join(" ").toLowerCase().includes(q));
    const g = $("#grilla"); g.innerHTML = "";
    $("#vacio").hidden = fotos.length > 0;
    lista.forEach(f => {
      const u = URL.createObjectURL(f.blob); urls.push(u);
      const b = document.createElement("button"); b.className = "tarjeta";
      const im = document.createElement("img"); im.src = u; im.alt = "Foto";
      const d = document.createElement("div");
      const t = document.createElement("b"); t.textContent = f.titulo || "Sin título";
      const s = document.createElement("span"); s.textContent = new Date(f.fecha).toLocaleString("es-AR");
      d.append(t, s); b.append(im, d);
      b.addEventListener("click", () => abrirFoto(f.id));
      g.appendChild(b);
    });
  }

  async function abrirFoto(id) {
    const f = (await dbTodas()).find(x => x.id === id);
    if (!f) return;
    fichaId = id;
    const old = $("#fImg").dataset.u; if (old) URL.revokeObjectURL(old);
    const u = URL.createObjectURL(f.blob); $("#fImg").src = u; $("#fImg").dataset.u = u;
    $("#fFecha").textContent = "Capturada: " + new Date(f.fecha).toLocaleString("es-AR") +
      (f.editado ? " · Editada: " + new Date(f.editado).toLocaleString("es-AR") : "");
    $("#fTitulo").value = f.titulo || ""; $("#fDesc").value = f.descripcion || "";
    $("#fLugar").value = f.lugar || ""; $("#fTags").value = (f.etiquetas || []).join(", ");
    $("#ficha").showModal();
  }

  async function guardarFicha() {
    const f = (await dbTodas()).find(x => x.id === fichaId);
    if (!f) return;
    f.titulo = $("#fTitulo").value.trim(); f.descripcion = $("#fDesc").value.trim();
    f.lugar = $("#fLugar").value.trim();
    f.etiquetas = $("#fTags").value.split(",").map(s => s.trim()).filter(Boolean);
    f.editado = new Date().toISOString();
    await dbGuardar(f);
    $("#ficha").close();
    if (!$("#galeria").hidden) renderGaleria();
  }

  async function fotoActual() { return (await dbTodas()).find(x => x.id === fichaId); }
  function nombreArchivo(f) { return "laser-" + f.fecha.replace(/[:.]/g, "-") + ".jpg"; }

  async function descargar() {
    const f = await fotoActual(); if (!f) return;
    const u = URL.createObjectURL(f.blob), a = document.createElement("a");
    a.href = u; a.download = nombreArchivo(f); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  async function compartir() {
    const f = await fotoActual(); if (!f) return;
    const file = new File([f.blob], nombreArchivo(f), { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: f.titulo || "Foto láser", text: f.descripcion || "" }); } catch (e) {}
    } else alert("Este dispositivo no permite compartir archivos desde la app. Usá “Descargar imagen”.");
  }

  async function eliminar() {
    if (!confirm("¿Eliminar esta foto y su información? No se puede deshacer.")) return;
    await dbBorrar(fichaId); $("#ficha").close(); renderGaleria();
  }

  async function exportar() {
    const datos = (await dbTodas()).map(f => ({ id: f.id, fecha: f.fecha, titulo: f.titulo, descripcion: f.descripcion, lugar: f.lugar, etiquetas: f.etiquetas, editado: f.editado }));
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = "detector-laser-datos.json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  // ---------- Eventos ----------
  $("#btnCam").addEventListener("click", iniciarCamara);
  $("#btnParar").addEventListener("click", () => detener());
  $("#sens").addEventListener("input", e => { ajustes.sens = +e.target.value; $("#sensVal").textContent = ajustes.sens; guardarAjustes(); });
  $("#debug").addEventListener("change", e => { ajustes.debug = e.target.checked; guardarAjustes(); });
  $("#expo").addEventListener("change", e => { ajustes.expo = e.target.checked; guardarAjustes(); aplicarExposicion(); });
  $("#selCam").addEventListener("change", e => { ajustes.camId = e.target.value; guardarAjustes(); if (stream) iniciarCamara(); });
  $("#zoom").addEventListener("input", e => {
    ajustes.zoom = +e.target.value; $("#zoomVal").textContent = ajustes.zoom.toFixed(1) + "x"; guardarAjustes();
    if (track) track.applyConstraints({ advanced: [{ zoom: ajustes.zoom }] }).catch(() => {});
  });
  $("#buscar").addEventListener("input", renderGaleria);
  $("#btnExport").addEventListener("click", exportar);
  $("#fGuardar").addEventListener("click", guardarFicha);
  $("#fCerrar").addEventListener("click", () => $("#ficha").close());
  $("#fDescargar").addEventListener("click", descargar);
  $("#fCompartir").addEventListener("click", compartir);
  $("#fEliminar").addEventListener("click", eliminar);
  document.addEventListener("visibilitychange", () => { if (document.hidden && stream) detener(); });

  // ---------- Inicio ----------
  $("#ver").textContent = "· " + CONFIG.version;
  $("#sens").value = ajustes.sens; $("#sensVal").textContent = ajustes.sens;
  $("#debug").checked = !!ajustes.debug; $("#expo").checked = !!ajustes.expo;
  abrirDB().then(d => { db = d; actualizarCuenta(); }).catch(e => { $("#estado").textContent = "No se pudo abrir el almacenamiento: " + e; });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
