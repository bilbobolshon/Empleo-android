'use strict';
// Diseño de los CV: vista en pantalla / guardar en PDF (HTML) y PDF que se envía solo (jsPDF).
// Dos plantillas (moderna con columna lateral y clásica), cuatro colores y foto opcional.

function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function lleno(lista) {
  return Array.isArray(lista) ? lista.filter((x) => x && (typeof x !== 'string' || x.trim())) : [];
}

const COLORES_CV = {
  azul: { nombre: 'Azul', acento: '#1F5FAD', oscuro: '#163A63' },
  verde: { nombre: 'Verde', acento: '#1E7A5A', oscuro: '#164A3A' },
  granate: { nombre: 'Granate', acento: '#9B2C4B', oscuro: '#5E1B2E' },
  gris: { nombre: 'Grafito', acento: '#4A5A6E', oscuro: '#2B3440' }
};
const PLANTILLAS_CV = { moderno: 'Moderno (columna lateral)', clasico: 'Clásico' };

// Opciones de diseño elegidas por el usuario (para todos sus CV)
function opcionesCv() {
  const d = (typeof E !== 'undefined' && E.disenoCv) || {};
  return {
    plantilla: PLANTILLAS_CV[d.plantilla] ? d.plantilla : 'moderno',
    color: COLORES_CV[d.color] ? d.color : 'azul',
    foto: d.conFoto === false ? '' : ((typeof E !== 'undefined' && E.foto) || '')
  };
}

function bloquesCv(c) {
  const exp = lleno(c.experiencia).map((e) =>
    '<div class="bloque"><div class="cabeza"><div><strong>' + esc(e.puesto) + '</strong>' +
    (e.empresa ? '<span class="emp"> · ' + esc(e.empresa) + '</span>' : '') + '</div>' +
    '<div class="fechas">' + esc(e.fechas) + '</div></div>' +
    (e.lugar ? '<div class="lugar">' + esc(e.lugar) + '</div>' : '') +
    (lleno(e.puntos).length ? '<ul>' + lleno(e.puntos).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '') +
    '</div>').join('');
  const form = lleno(c.formacion).map((f) =>
    '<div class="bloque"><div class="cabeza"><div><strong>' + esc(f.titulo) + '</strong>' +
    (f.centro ? '<span class="emp"> · ' + esc(f.centro) + '</span>' : '') + '</div><div class="fechas">' + esc(f.fechas) + '</div></div></div>').join('');
  return { exp, form };
}

function htmlCv(c, opciones) {
  const o = Object.assign(opcionesCv(), opciones || {});
  const col = COLORES_CV[o.color];
  const k = c.contacto || {};
  const { exp, form } = bloquesCv(c);
  const sec = (t, cuerpo) => cuerpo ? '<section><h2>' + t + '</h2>' + cuerpo + '</section>' : '';
  const lista = (xs, cls) => lleno(xs).length ? '<ul class="' + (cls || '') + '">' + lleno(xs).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
  const foto = o.foto ? '<img class="foto" src="' + o.foto + '" alt="">' : '';
  let cuerpo;

  if (o.plantilla === 'moderno') {
    const contacto = [['☎', k.telefono], ['✉', k.email], ['⌂', k.localidad]].filter((x) => x[1])
      .map((x) => '<li><span class="ico">' + x[0] + '</span>' + esc(x[1]) + '</li>').join('');
    cuerpo = '<div class="hoja moderno"><aside>' + foto +
      sec('Contacto', contacto ? '<ul class="limpia">' + contacto + '</ul>' : '') +
      sec('Competencias', lista(c.competencias, 'limpia')) +
      sec('Idiomas', lista(c.idiomas, 'limpia')) +
      sec('Informática', lista(c.informatica, 'limpia')) +
      sec('Otros datos', lista(c.otros, 'limpia')) +
      '</aside><main><header><h1>' + esc(k.nombre || '') + '</h1>' +
      (c.titulo_profesional ? '<div class="titulo">' + esc(c.titulo_profesional) + '</div>' : '') + '</header>' +
      sec('Perfil profesional', c.resumen ? '<p>' + esc(c.resumen) + '</p>' : '') +
      sec('Experiencia', exp) + sec('Formación', form) + '</main></div>';
  } else {
    const contacto = [k.telefono, k.email, k.localidad].filter(Boolean).map(esc).join('  ·  ');
    cuerpo = '<div class="hoja clasico"><header><div class="datos"><h1>' + esc(k.nombre || '') + '</h1>' +
      (c.titulo_profesional ? '<div class="titulo">' + esc(c.titulo_profesional) + '</div>' : '') +
      (contacto ? '<div class="contacto">' + contacto + '</div>' : '') + '</div>' + foto + '</header>' +
      sec('Perfil profesional', c.resumen ? '<p>' + esc(c.resumen) + '</p>' : '') +
      sec('Experiencia', exp) + sec('Formación', form) +
      '<div class="dos">' + sec('Competencias', lista(c.competencias)) + sec('Idiomas', lista(c.idiomas)) + '</div>' +
      '<div class="dos">' + sec('Informática', lista(c.informatica)) + sec('Otros datos', lista(c.otros)) + '</div></div>';
  }

  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=794">' +
    '<title>' + esc(k.nombre || 'Currículum') + '</title><style>' +
    CSS_CV.replace(/ACENTO/g, col.acento).replace(/OSCURO/g, col.oscuro) +
    '</style></head><body>' + cuerpo + '</body></html>';
}

const CSS_CV = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; }
body { font-family: "Helvetica Neue", Arial, Helvetica, sans-serif; color: #2A2F36; font-size: 13px; line-height: 1.45;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hoja { width: 794px; min-height: 1123px; }
h1 { margin: 0; font-size: 31px; line-height: 1.1; color: OSCURO; letter-spacing: .01em; }
.titulo { margin-top: 6px; font-size: 16px; font-weight: bold; color: ACENTO; }
h2 { margin: 0 0 9px; font-size: 12.5px; text-transform: uppercase; letter-spacing: .12em; color: ACENTO; }
section { margin-bottom: 18px; }
p { margin: 0; }
ul { margin: 5px 0 0; padding-left: 17px; }
li { margin-bottom: 3px; }
.bloque { margin-bottom: 12px; page-break-inside: avoid; }
.cabeza { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.emp { color: #4A5361; font-weight: normal; }
.fechas { color: #6A7380; font-size: 12px; white-space: nowrap; }
.lugar { color: #6A7380; font-size: 12px; }
.foto { object-fit: cover; display: block; }

/* Moderno: columna lateral de color */
.moderno { display: flex; }
.moderno aside { width: 255px; flex: none; background: OSCURO; color: #fff; padding: 40px 24px; min-height: 1123px; }
.moderno aside h2 { color: #fff; border-bottom: 1px solid rgba(255,255,255,.35); padding-bottom: 5px; }
.moderno aside .foto { width: 152px; height: 152px; border-radius: 3px; margin: 0 auto 26px; border: 4px solid #fff; }
.moderno ul.limpia { list-style: none; padding: 0; margin: 0; }
.moderno ul.limpia li { margin-bottom: 6px; font-size: 12.5px; }
.moderno .ico { display: inline-block; width: 18px; opacity: .85; }
.moderno main { flex: 1; padding: 46px 40px; }
.moderno header { margin-bottom: 22px; padding-bottom: 14px; border-bottom: 3px solid ACENTO; }
.moderno main h2 { border-bottom: 1px solid #DCE2EA; padding-bottom: 4px; }

/* Clásico: cabecera con foto a la derecha */
.clasico { padding: 46px 54px; }
.clasico header { display: flex; justify-content: space-between; align-items: center; gap: 20px;
  border-bottom: 3px solid ACENTO; padding-bottom: 16px; margin-bottom: 20px; }
.clasico .contacto { margin-top: 8px; color: #4A5361; }
.clasico .foto { width: 128px; height: 128px; border-radius: 3px; border: 1px solid #DCE2EA; }
.clasico h2 { border-bottom: 1px solid #DCE2EA; padding-bottom: 4px; }
.clasico .dos { display: flex; gap: 30px; }
.clasico .dos section { flex: 1; }
@media print { .hoja { min-height: 0; } .moderno aside { min-height: 1123px; } }
`;

// ---------- PDF para enviar (mismo diseño, dibujado con jsPDF) ----------

function cvPdfBase64(contenido, opciones) {
  const o = Object.assign(opcionesCv(), opciones || {});
  const col = COLORES_CV[o.color];
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ACENTO = rgb(col.acento), OSCURO = rgb(col.oscuro), TEXTO = [42, 47, 54], SUAVE = [106, 115, 128];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c = contenido || {};
  const k = c.contacto || {};
  const limpiar = (t) => String(t == null ? '' : t).replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ€–—‘’“”•]/g, '');
  const moderno = o.plantilla === 'moderno';
  const LADO = 68;                                   // ancho de la columna lateral (moderno)
  const X = moderno ? LADO + 11 : 17;                // margen izquierdo de la columna principal
  const ANCHO = 210 - X - (moderno ? 12 : 17);
  let y = moderno ? 22 : 20;

  const pintarLado = () => { if (moderno) { doc.setFillColor(...OSCURO); doc.rect(0, 0, LADO, 297, 'F'); } };
  pintarLado();
  const salto = (alto) => { if (y + alto > 284) { doc.addPage(); pintarLado(); y = 20; } };
  const texto = (t, tam, estilo, color, x, ancho, interlinea) => {
    doc.setFont('helvetica', estilo || 'normal'); doc.setFontSize(tam); doc.setTextColor(...(color || TEXTO));
    doc.splitTextToSize(limpiar(t), ancho).forEach((l) => { salto(tam * 0.45); doc.text(l, x, y); y += tam * (interlinea || 0.43); });
  };
  const seccion = (t) => {
    y += 2.5; salto(13);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...ACENTO);
    doc.text(limpiar(t.toUpperCase()), X, y, { charSpace: 0.4 });
    y += 1.8; doc.setDrawColor(220, 226, 234); doc.setLineWidth(0.3); doc.line(X, y, X + ANCHO, y); y += 5;
  };
  const vinetas = (lista, x, ancho, color, tam) => lleno(lista).forEach((v) => {
    salto(5); doc.setFont('helvetica', 'normal'); doc.setFontSize(tam || 9.8); doc.setTextColor(...(color || TEXTO));
    doc.text('•', x, y); texto(v, tam || 9.8, 'normal', color, x + 3.6, ancho - 3.6);
  });
  const experiencia = () => {
    if (!lleno(c.experiencia).length) return;
    seccion('Experiencia');
    lleno(c.experiencia).forEach((e) => {
      salto(12);
      const yTitulo = y;
      texto([e.puesto, e.empresa].filter(Boolean).join(' · '), 10.5, 'bold', TEXTO, X, ANCHO - 30);
      if (e.fechas) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE); doc.text(limpiar(e.fechas), X + ANCHO, yTitulo, { align: 'right' }); }
      if (e.lugar) texto(e.lugar, 9, 'normal', SUAVE, X, ANCHO);
      y += 0.6;
      vinetas(e.puntos, X + 1, ANCHO - 1);
      y += 2.2;
    });
  };
  const formacion = () => {
    if (!lleno(c.formacion).length) return;
    seccion('Formación');
    lleno(c.formacion).forEach((f) => {
      salto(9);
      const yT = y;
      texto([f.titulo, f.centro].filter(Boolean).join(' · '), 10, 'bold', TEXTO, X, ANCHO - 30);
      if (f.fechas) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SUAVE); doc.text(limpiar(f.fechas), X + ANCHO, yT, { align: 'right' }); }
      y += 1.5;
    });
  };
  const foto = (x, yy, w, h) => { try { doc.addImage(o.foto, 'JPEG', x, yy, w, h); return true; } catch (err) { return false; } };

  if (moderno) {
    // Columna lateral (solo en la primera página)
    let ly = 18;
    if (o.foto && foto(14, ly, 40, 40)) { doc.setDrawColor(255, 255, 255); doc.setLineWidth(1); doc.rect(14, ly, 40, 40); ly += 48; }
    const ladoSeccion = (t) => {
      ly += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
      doc.text(limpiar(t.toUpperCase()), 9, ly, { charSpace: 0.4 }); ly += 1.8;
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.2); doc.line(9, ly, LADO - 9, ly); ly += 5;
    };
    const ladoTexto = (t) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
      doc.splitTextToSize(limpiar(t), LADO - 18).forEach((l) => { if (ly < 288) { doc.text(l, 9, ly); ly += 4.1; } });
      ly += 1.2;
    };
    const contacto = [k.telefono, k.email, k.localidad].filter(Boolean);
    if (contacto.length) { ladoSeccion('Contacto'); contacto.forEach(ladoTexto); }
    [['Competencias', c.competencias], ['Idiomas', c.idiomas], ['Informática', c.informatica], ['Otros datos', c.otros]]
      .forEach(([t, xs]) => { if (lleno(xs).length && ly < 270) { ladoSeccion(t); lleno(xs).forEach(ladoTexto); } });

    // Columna principal
    texto(k.nombre || '', 22, 'bold', OSCURO, X, ANCHO, 0.42);
    if (c.titulo_profesional) { y += 1; texto(c.titulo_profesional, 12, 'bold', ACENTO, X, ANCHO); }
    y += 1.5; doc.setDrawColor(...ACENTO); doc.setLineWidth(0.9); doc.line(X, y, X + ANCHO, y); y += 4;
    if (c.resumen) { seccion('Perfil profesional'); texto(c.resumen, 9.8, 'normal', TEXTO, X, ANCHO, 0.45); }
    experiencia();
    formacion();
  } else {
    // Clásico: cabecera con foto a la derecha
    const conFoto = o.foto && foto(210 - 17 - 34, 13, 34, 34);
    const anchoCab = ANCHO - (conFoto ? 40 : 0);
    texto(k.nombre || '', 22, 'bold', OSCURO, X, anchoCab, 0.42);
    if (c.titulo_profesional) { y += 1; texto(c.titulo_profesional, 12, 'bold', ACENTO, X, anchoCab); }
    const contacto = [k.telefono, k.email, k.localidad].filter(Boolean).join('   ·   ');
    if (contacto) { y += 1; texto(contacto, 9.5, 'normal', [74, 83, 97], X, anchoCab); }
    y = Math.max(y + 2, conFoto ? 51 : 0);
    doc.setDrawColor(...ACENTO); doc.setLineWidth(0.9); doc.line(X, y, X + ANCHO, y); y += 4;
    if (c.resumen) { seccion('Perfil profesional'); texto(c.resumen, 9.8, 'normal', TEXTO, X, ANCHO, 0.45); }
    experiencia();
    formacion();
    [['Competencias', c.competencias], ['Idiomas', c.idiomas], ['Informática', c.informatica], ['Otros datos', c.otros]]
      .forEach(([t, xs]) => { if (lleno(xs).length) { seccion(t); vinetas(xs, X + 1, ANCHO - 1); } });
  }
  return doc.output('datauristring').split(',')[1];
}
