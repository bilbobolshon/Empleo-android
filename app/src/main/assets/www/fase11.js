'use strict';
// Trabajar con los CV subidos tal cual: se guardan en el móvil y la app los envía sin cambiarlos.

// Convierte la foto de un CV en papel en un PDF de una página
async function fotoAPdf(b64jpeg) {
  const img = await new Promise((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error('No se ha podido leer la foto del CV.'));
    i.src = 'data:image/jpeg;base64,' + b64jpeg;
  });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const m = 8, w = 210 - 2 * m, h = 297 - 2 * m;
  const k = Math.min(w / (img.naturalWidth || 1), h / (img.naturalHeight || 1));
  const iw = (img.naturalWidth || w) * k, ih = (img.naturalHeight || h) * k;
  doc.addImage('data:image/jpeg;base64,' + b64jpeg, 'JPEG', (210 - iw) / 2, (297 - ih) / 2, iw, ih);
  return doc.output('datauristring').split(',')[1];
}

// Guarda el PDF en la memoria del móvil (no en los datos de la app, que tienen poco espacio)
function guardarOriginal(nombre, b64) {
  const archivo = 'cv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.pdf';
  if (nativo && nativo.guardarArchivo) {
    if (!nativo.guardarArchivo(archivo, b64)) throw new Error('No se ha podido guardar tu CV en el móvil.');
    return { archivo };
  }
  return { archivo, pdf: b64 }; // sin la parte Android (pruebas): se guarda dentro
}

function anadirOriginales(originales) {
  const p = E.perfil || {};
  originales.forEach((o) => {
    const g = guardarOriginal(o.nombre, o.b64);
    E.cvs.unshift(Object.assign({
      id: nuevoId('cv'), titulo: o.nombre.replace(/\.pdf$/i, '') || 'Mi CV', original: true, nombreArchivo: /\.pdf$/i.test(o.nombre) ? o.nombre : o.nombre + '.pdf',
      fecha: Date.now(),
      contenido: { titulo_profesional: 'CV original', contacto: { nombre: p.nombre || '', telefono: p.telefono || '', email: p.email || '', localidad: p.localidad || '' } }
    }, g));
  });
}

// PDF que se envía: el original tal cual o el generado con el diseño elegido
function pdfDeCv(cv) {
  if (cv.original) {
    const b64 = cv.pdf || (nativo && nativo.leerArchivo ? nativo.leerArchivo(cv.archivo) : '');
    if (!b64) throw new Error('No encuentro el archivo de tu CV «' + cv.titulo + '». Vuelve a subirlo.');
    return b64;
  }
  return cvPdfBase64(cv.contenido);
}

function borrarArchivoCv(cv) {
  if (cv && cv.original && nativo && nativo.borrarArchivo) nativo.borrarArchivo(cv.archivo);
}

function pCvOriginal(c) {
  pantalla(c.titulo,
    '<div class="tarjeta"><h3>📎 CV original</h3>' +
    '<p class="suave">Es el CV que subiste, sin cambios. La app lo envía tal cual a las empresas cuando es el más adecuado.</p>' +
    '<button class="boton" data-accion="abrir-original:' + c.id + '">Abrir el PDF</button>' +
    '<button class="boton secundario" data-accion="mejorar-original">Crear una versión mejorada y editable</button>' +
    '<button class="boton peligro" data-accion="borrar-cv:' + c.id + '">Borrar este CV</button></div>');
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el) return;
  const v = el.dataset.accion;
  if (v.startsWith('abrir-original:')) {
    const c = E.cvs.find((x) => x.id === v.slice(15));
    if (c && nativo && nativo.abrirArchivo) nativo.abrirArchivo(c.archivo);
  } else if (v === 'mejorar-original') {
    ir(E.preferencias ? 'orientaciones' : (E.preguntas.length ? 'preguntas/0' : 'subir'));
  } else if (v === 'analizar-tal-cual') {
    analizar('tal-cual');
  }
});
