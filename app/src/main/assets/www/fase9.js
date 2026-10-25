'use strict';
// Foto del candidato y diseño de los CV (plantilla, color, con o sin foto).

function htmlFotoYDiseno(volverA) {
  const o = opcionesCv();
  const d = E.disenoCv || {};
  return '<div class="tarjeta"><h3>Foto y diseño de tus CV</h3>' +
    '<div class="foto-fila">' +
      (E.foto ? '<img class="foto-mini" src="' + E.foto + '" alt="Tu foto">' : '<div class="foto-mini vacia">👤</div>') +
      '<div style="flex:1">' +
        '<label class="boton secundario" for="foto-galeria" style="margin:0 0 8px">🖼️ ' + (E.foto ? 'Cambiar foto' : 'Elegir foto') + '</label>' +
        '<input class="archivo-oculto" type="file" id="foto-galeria" accept="image/*">' +
        '<label class="boton secundario" for="foto-camara" style="margin:0">📷 Hacer foto</label>' +
        '<input class="archivo-oculto" type="file" id="foto-camara" accept="image/*" capture="user">' +
      '</div></div>' +
    '<p class="suave">Consejo: foto de frente, fondo liso, buena luz y ropa adecuada al puesto.</p>' +
    (E.foto ? '<label class="campo"><input type="checkbox" id="con-foto"' + (d.conFoto === false ? '' : ' checked') + '> Poner la foto en mis CV</label>' +
      '<button class="boton texto" id="quitar-foto">Quitar la foto</button>' : '') +
    '<label class="campo" for="plantilla">Diseño</label><select id="plantilla">' +
      Object.keys(PLANTILLAS_CV).map((k) => '<option value="' + k + '"' + (k === o.plantilla ? ' selected' : '') + '>' + PLANTILLAS_CV[k] + '</option>').join('') + '</select>' +
    '<label class="campo">Color</label><div class="marcas">' +
      Object.keys(COLORES_CV).map((k) => '<button class="opcion marca color-cv' + (k === o.color ? ' marcada' : '') + '" data-color="' + k + '" style="border-left:14px solid ' + COLORES_CV[k].acento + '">' + COLORES_CV[k].nombre + '</button>').join('') +
    '</div></div>';
}

// Recorta la foto en cuadrado (centrada) y la reduce para que pese poco
async function prepararFoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('No se ha podido abrir la foto. Prueba con otra.'));
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    // un poco más alto que ancho para retrato: se recorta centrado en horizontal y algo arriba en vertical
    const sx = (img.naturalWidth - lado) / 2;
    const sy = Math.max(0, (img.naturalHeight - lado) * 0.3);
    const c = document.createElement('canvas');
    c.width = 600; c.height = 600;
    c.getContext('2d').drawImage(img, sx, sy, lado, lado, 0, 0, 600, 600);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function activarFotoYDiseno(repintar) {
  const alElegir = async (ev) => {
    const f = (ev.target.files || [])[0];
    if (!f) return;
    cargando('Preparando tu foto…');
    try {
      E.foto = await prepararFoto(f);
      E.disenoCv = Object.assign({}, E.disenoCv, { conFoto: true });
      guardar();
      quitarCarga();
      repintar();
    } catch (err) { fallo(err); }
  };
  const g = $('#foto-galeria'), cam = $('#foto-camara');
  if (g) g.onchange = alElegir;
  if (cam) cam.onchange = alElegir;
  const con = $('#con-foto');
  if (con) con.onchange = () => { E.disenoCv = Object.assign({}, E.disenoCv, { conFoto: con.checked }); guardar(); repintar(); };
  const q = $('#quitar-foto');
  if (q) q.onclick = () => preguntar('¿Quitar tu foto de los CV?', 'Sí, quitar', () => { E.foto = ''; guardar(); repintar(); });
  const pl = $('#plantilla');
  if (pl) pl.onchange = () => { E.disenoCv = Object.assign({}, E.disenoCv, { plantilla: pl.value }); guardar(); repintar(); };
  document.querySelectorAll('[data-color]').forEach((b) => {
    b.onclick = () => { E.disenoCv = Object.assign({}, E.disenoCv, { color: b.dataset.color }); guardar(); repintar(); };
  });
}
