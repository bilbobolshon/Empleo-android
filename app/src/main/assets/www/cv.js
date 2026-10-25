'use strict';
// Convierte el contenido de un CV (JSON) en una página lista para ver y guardar en PDF (A4).

function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function lleno(lista) {
  return Array.isArray(lista) ? lista.filter((x) => x && (typeof x !== 'string' || x.trim())) : [];
}

function htmlCv(c) {
  const k = c.contacto || {};
  const contacto = [k.telefono, k.email, k.localidad].filter(Boolean).map(esc).join('  ·  ');

  const seccion = (titulo, cuerpo) => cuerpo ? '<section><h2>' + titulo + '</h2>' + cuerpo + '</section>' : '';

  const experiencia = lleno(c.experiencia).map((e) =>
    '<div class="bloque">' +
      '<div class="cabeza"><div><strong>' + esc(e.puesto) + '</strong>' +
      (e.empresa ? ' — ' + esc(e.empresa) : '') +
      (e.lugar ? '<span class="lugar"> · ' + esc(e.lugar) + '</span>' : '') +
      '</div><div class="fechas">' + esc(e.fechas) + '</div></div>' +
      (lleno(e.puntos).length ? '<ul>' + lleno(e.puntos).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '') +
    '</div>').join('');

  const formacion = lleno(c.formacion).map((f) =>
    '<div class="bloque"><div class="cabeza"><div><strong>' + esc(f.titulo) + '</strong>' +
    (f.centro ? ' — ' + esc(f.centro) : '') + '</div><div class="fechas">' + esc(f.fechas) + '</div></div></div>'
  ).join('');

  const lista = (xs) => lleno(xs).length ? '<ul class="compacta">' + lleno(xs).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';

  return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=794">' +
    '<title>' + esc(k.nombre || 'Currículum') + '</title><style>' + CSS_CV + '</style></head><body><div class="hoja">' +
    '<header><h1>' + esc(k.nombre || '') + '</h1>' +
    (c.titulo_profesional ? '<div class="titulo">' + esc(c.titulo_profesional) + '</div>' : '') +
    (contacto ? '<div class="contacto">' + contacto + '</div>' : '') + '</header>' +
    seccion('Perfil', c.resumen ? '<p>' + esc(c.resumen) + '</p>' : '') +
    seccion('Experiencia', experiencia) +
    seccion('Formación', formacion) +
    seccion('Idiomas', lista(c.idiomas)) +
    seccion('Informática', lista(c.informatica)) +
    seccion('Competencias', lista(c.competencias)) +
    seccion('Otros datos', lista(c.otros)) +
    '</div></body></html>';
}

const CSS_CV = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; }
body { font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 13.5px; line-height: 1.42;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hoja { width: 794px; min-height: 1123px; padding: 46px 54px; }
header { border-bottom: 3px solid #1F5FAD; padding-bottom: 14px; margin-bottom: 16px; }
h1 { font-size: 30px; margin: 0; color: #13325A; letter-spacing: .01em; }
.titulo { font-size: 17px; color: #1F5FAD; font-weight: bold; margin-top: 4px; }
.contacto { margin-top: 8px; color: #444; font-size: 13.5px; }
section { margin-bottom: 14px; page-break-inside: auto; }
h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #1F5FAD;
  margin: 0 0 8px; padding-bottom: 3px; border-bottom: 1px solid #D5DEEA; }
p { margin: 0; }
.bloque { margin-bottom: 10px; page-break-inside: avoid; }
.cabeza { display: flex; justify-content: space-between; gap: 12px; }
.fechas { color: #555; white-space: nowrap; font-size: 13px; }
.lugar { color: #555; }
ul { margin: 4px 0 0; padding-left: 18px; }
li { margin-bottom: 2px; }
ul.compacta { columns: 2; column-gap: 30px; margin-top: 0; }
@media print { .hoja { min-height: 0; } }
`;
