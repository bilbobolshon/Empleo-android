'use strict';
// Editor de CV, borrar CV, aviso de «estoy trabajando», navegación adelante,
// reiniciar el cuestionario y sugerencias de puestos.

// ---------- Aviso fijo cuando la app trabaja en segundo plano ----------

const Trabajo = (() => {
  let inicio = 0, reloj = null;
  const el = () => document.getElementById('trabajo');
  function mostrar(texto, actual, total) {
    const b = el();
    if (!b) return;
    if (b.hidden) { inicio = Date.now(); b.hidden = false; }
    b.querySelector('.trabajo-texto').textContent = texto + (total ? ' (' + actual + ' de ' + total + ')' : '');
    clearInterval(reloj);
    const pintarReloj = () => { b.querySelector('.trabajo-tiempo').textContent = duracion(Date.now() - inicio); };
    pintarReloj();
    reloj = setInterval(pintarReloj, 1000);
  }
  function ocultar() { const b = el(); if (b) b.hidden = true; clearInterval(reloj); }
  return { mostrar, ocultar };
})();

function duracion(ms) {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ---------- Borrar CV ----------

function borrarCv(id) {
  const c = E.cvs.find((x) => x.id === id);
  if (!c) return;
  preguntar('¿Borrar el CV «' + c.titulo + '»? No se puede deshacer.', 'Sí, borrar', () => {
    borrarArchivoCv(c);
    E.cvs = E.cvs.filter((x) => x.id !== id);
    guardar();
    ir('miscv');
  });
}

// ---------- Editor de CV ----------

function pEditarCv(id) {
  const cv = E.cvs.find((x) => x.id === id);
  if (!cv) { ir('miscv'); return; }
  if (cv.original) { pCvOriginal(cv); return; }
  const c = cv.contenido;
  const k = c.contacto || {};
  const campo = (etq, nombre, valor, area) => '<label class="campo">' + etq + '</label>' +
    (area ? '<textarea data-c="' + nombre + '">' + esc(valor || '') + '</textarea>' : '<input type="text" data-c="' + nombre + '" value="' + esc(valor || '') + '">');
  const lineas = (xs) => lleno(xs).join('\n');
  const bloqueExp = (e, i) => '<div class="tarjeta editor-bloque" data-exp="' + i + '">' +
    '<div class="fila"><h3 style="flex:1">Puesto ' + (i + 1) + '</h3><button class="boton texto" style="flex:0 0 auto;width:auto" data-quitar-exp="' + i + '">Quitar</button></div>' +
    campo('Puesto', 'puesto', e.puesto) + campo('Empresa', 'empresa', e.empresa) +
    '<div class="fila"><div>' + campo('Lugar', 'lugar', e.lugar) + '</div><div>' + campo('Fechas', 'fechas', e.fechas) + '</div></div>' +
    campo('Tareas y logros (uno por línea)', 'puntos', lineas(e.puntos), true) + '</div>';
  const bloqueForm = (f, i) => '<div class="tarjeta editor-bloque" data-form="' + i + '">' +
    '<div class="fila"><h3 style="flex:1">Estudio ' + (i + 1) + '</h3><button class="boton texto" style="flex:0 0 auto;width:auto" data-quitar-form="' + i + '">Quitar</button></div>' +
    campo('Título', 'titulo', f.titulo) + campo('Centro', 'centro', f.centro) + campo('Fechas', 'fechas', f.fechas) + '</div>';

  pantalla('Editar CV',
    '<p class="suave">Cambia lo que quieras y pulsa «Guardar». El diseño (foto, plantilla y color) se cambia en Mis CV.</p>' +
    '<div class="tarjeta">' + campo('Nombre del CV (solo para ti)', 'nombre-cv', cv.titulo) + '</div>' +
    '<div class="tarjeta"><h3>Datos de contacto</h3>' +
      campo('Nombre y apellidos', 'k-nombre', k.nombre) + campo('Teléfono', 'k-telefono', k.telefono) +
      campo('Correo', 'k-email', k.email) + campo('Localidad', 'k-localidad', k.localidad) + '</div>' +
    '<div class="tarjeta"><h3>Cabecera</h3>' + campo('Título profesional', 'titulo_profesional', c.titulo_profesional) +
      campo('Perfil profesional (resumen)', 'resumen', c.resumen, true) + '</div>' +
    '<h3>Experiencia</h3>' + lleno(c.experiencia).map(bloqueExp).join('') +
    '<button class="boton secundario" id="mas-exp">+ Añadir experiencia</button>' +
    '<h3>Formación</h3>' + lleno(c.formacion).map(bloqueForm).join('') +
    '<button class="boton secundario" id="mas-form">+ Añadir estudio</button>' +
    '<div class="tarjeta"><h3>Otros apartados (uno por línea)</h3>' +
      campo('Competencias', 'competencias', lineas(c.competencias), true) +
      campo('Idiomas', 'idiomas', lineas(c.idiomas), true) +
      campo('Informática', 'informatica', lineas(c.informatica), true) +
      campo('Otros datos (carné, disponibilidad…)', 'otros', lineas(c.otros), true) + '</div>' +
    '<button class="boton" id="guardar-cv">Guardar</button>' +
    '<button class="boton texto" data-ir="cv/' + id + '">Cancelar</button>');

  const leer = () => {
    const v = (raiz, n) => { const x = raiz.querySelector('[data-c="' + n + '"]'); return x ? x.value.trim() : ''; };
    const lista = (raiz, n) => v(raiz, n).split('\n').map((x) => x.replace(/^[•\-\s]+/, '').trim()).filter(Boolean);
    const doc = document;
    return {
      titulo: v(doc, 'nombre-cv') || cv.titulo,
      contenido: Object.assign({}, c, {
        contacto: { nombre: v(doc, 'k-nombre'), telefono: v(doc, 'k-telefono'), email: v(doc, 'k-email'), localidad: v(doc, 'k-localidad') },
        titulo_profesional: v(doc, 'titulo_profesional'),
        resumen: v(doc, 'resumen'),
        experiencia: Array.from(doc.querySelectorAll('[data-exp]')).map((b) => ({
          puesto: v(b, 'puesto'), empresa: v(b, 'empresa'), lugar: v(b, 'lugar'), fechas: v(b, 'fechas'), puntos: lista(b, 'puntos')
        })).filter((e) => e.puesto || e.empresa),
        formacion: Array.from(doc.querySelectorAll('[data-form]')).map((b) => ({
          titulo: v(b, 'titulo'), centro: v(b, 'centro'), fechas: v(b, 'fechas')
        })).filter((f) => f.titulo),
        competencias: lista(doc, 'competencias'), idiomas: lista(doc, 'idiomas'),
        informatica: lista(doc, 'informatica'), otros: lista(doc, 'otros')
      })
    };
  };
  // Guarda lo escrito (sin salir) antes de añadir o quitar bloques
  const conservar = (cambio) => {
    const r = leer();
    cv.titulo = r.titulo;
    cv.contenido = r.contenido;
    cambio(cv.contenido);
    pEditarCv(id);
  };
  $('#mas-exp').onclick = () => conservar((x) => { x.experiencia = lleno(x.experiencia).concat([{ puesto: ' ', puntos: [] }]); });
  $('#mas-form').onclick = () => conservar((x) => { x.formacion = lleno(x.formacion).concat([{ titulo: ' ' }]); });
  document.querySelectorAll('[data-quitar-exp]').forEach((b) => {
    b.onclick = () => conservar((x) => { x.experiencia.splice(Number(b.dataset.quitarExp), 1); });
  });
  document.querySelectorAll('[data-quitar-form]').forEach((b) => {
    b.onclick = () => conservar((x) => { x.formacion.splice(Number(b.dataset.quitarForm), 1); });
  });
  $('#guardar-cv').onclick = () => {
    const r = leer();
    cv.titulo = r.titulo;
    cv.contenido = r.contenido;
    cv.fecha = Date.now();
    guardar();
    ir('cv/' + id);
    if (nativo) nativo.aviso('CV guardado');
  };
}

// ---------- Cuestionario: reiniciar o preguntas nuevas ----------

function reiniciarCuestionario() {
  preguntar('¿Borrar tus respuestas y empezar el cuestionario desde la primera pregunta? Tus CV ya creados no se tocan.', 'Sí, empezar de nuevo', () => {
    E.respuestas = {};
    guardar();
    ir('preguntas/0');
  });
}

async function preguntasNuevas() {
  if (!E.perfil) { ir('subir'); return; }
  if (!iaLista()) { fallo(new Error('SIN_CLAVE')); return; }
  cargando('Preparando preguntas nuevas a partir de tu perfil…');
  try {
    const r = await iaJson([{ type: 'text', text: promptAnalisis(E.perfil) + '\n\n(No hay documentos nuevos: trabaja con el perfil guardado y haz preguntas que ayuden a completarlo y a orientar la búsqueda.)' }], 12000);
    if (r.perfil) E.perfil = r.perfil;
    E.preguntas = lleno(r.preguntas).filter((p) => p && p.texto).slice(0, 15)
      .map((p, i) => Object.assign({ tipo: 'texto', opciones: [] }, p, { id: 'p' + (i + 1) }));
    E.respuestas = {};
    guardar();
    quitarCarga();
    ir('preguntas/0');
  } catch (err) { fallo(err); }
}

// ---------- Sugerencias de puestos («Qué busco») ----------

async function sugerirPuestos(silencioso) {
  if (!E.perfil || !iaLista()) {
    if (!silencioso) mensaje(E.perfil ? 'Primero conecta la IA en Ajustes.' : 'Primero sube tu CV para que pueda sugerirte puestos.');
    return false;
  }
  cargando('Leyendo tu perfil para sugerirte puestos…');
  try {
    const r = await iaJson([{ type: 'text', text: [
      'A partir de este perfil, propón entre 8 y 12 puestos de trabajo concretos para los que encaja, con el nombre corto que se usa en las ofertas de empleo en España (por ejemplo "Cajero/a", "Recepcionista de hotel", "Agente de handling").',
      'Ordénalos de más a menos encaje. Incluye variantes cercanas a su experiencia y algún puesto de otro sector donde sus habilidades también sirvan.',
      'Perfil: ' + resumenPerfil(),
      'Responde ÚNICAMENTE con este JSON: {"puestos":[""]}'
    ].join('\n') }], 2000);
    const nuevos = lleno(r.puestos).map((x) => String(x).trim()).filter(Boolean);
    E.sugeridos = Array.from(new Set(lleno(E.sugeridos).concat(nuevos)));
    guardar();
    quitarCarga();
    return true;
  } catch (err) {
    if (silencioso) { quitarCarga(); return false; }
    fallo(err);
    return false;
  }
}

// ---------- Navegación adelante ----------

let pasosAdelante = 0;
let navegandoConBotones = false;

function actualizarAdelante() {
  const b = document.getElementById('adelante');
  if (b) b.hidden = pasosAdelante <= 0;
}

window.addEventListener('hashchange', () => {
  if (!navegandoConBotones) pasosAdelante = 0;
  navegandoConBotones = false;
  actualizarAdelante();
});

document.addEventListener('click', (ev) => {
  if (ev.target.closest('#atras')) { navegandoConBotones = true; pasosAdelante++; }
  if (ev.target.closest('#adelante')) {
    if (pasosAdelante > 0) { navegandoConBotones = true; pasosAdelante--; history.forward(); }
  }
  const el = ev.target.closest('[data-accion]');
  if (!el) return;
  const v = el.dataset.accion;
  if (v.startsWith('borrar-cv:')) borrarCv(v.slice(10));
  else if (v === 'reiniciar-preguntas') reiniciarCuestionario();
  else if (v === 'preguntas-nuevas') preguntasNuevas();
  else if (v === 'sugerir-puestos') sugerirPuestos(false).then((ok) => { if (ok) pintar(); });
}, true);
