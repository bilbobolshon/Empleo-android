'use strict';
// Reiniciar la búsqueda cuando cambian los ajustes, y permiso antes de enviar cada CV.

function firmaBusqueda() {
  return JSON.stringify([firmaPortales(), E.ambito || null, seleccionBusqueda(), ciudad()]);
}

const busquedaCambiada = () => !!E.ultimaRevision && !!E.firmaBusquedaUltima && E.firmaBusquedaUltima !== firmaBusqueda();

function reiniciarBusqueda(sinPreguntar) {
  const hacer = () => {
    const sinEnviar = new Set(E.candidaturas.filter((c) => c.estado === 'lista').map((c) => c.oferta));
    // Candidaturas preparadas pero no enviadas: fuera (se volverán a preparar si siguen encajando)
    E.candidaturas = E.candidaturas.filter((c) => c.estado !== 'lista');
    const usadas = new Set(E.candidaturas.map((c) => c.oferta));
    // Ofertas que no se han usado: fuera (se volverán a buscar con los ajustes nuevos)
    E.ofertas = E.ofertas.filter((o) => usadas.has(o.id));
    E.sitios.forEach((s) => {
      lleno(s.paginas).forEach((p) => { p.huella = ''; });
      s.vacias = 0;
      if (s.estado === 'vacia') s.estado = 'nuevo';
      if (s.estado === 'ok') s.estado = 'nuevo';
      if (s.espontaneaHecha && !E.candidaturas.some((c) => c.tipo === 'espontanea' && c.empresa === s.nombre)) s.espontaneaHecha = false;
    });
    E.firmaPortales = '';
    if (E.empresasAuto) E.empresasAuto.firmaIA = '';
    E.ultimaRevision = 0;
    guardar();
    sinEnviar.clear();
    revisarTodo(true);
  };
  if (sinPreguntar) { hacer(); return; }
  preguntar('¿Reinicio la búsqueda con tus ajustes actuales?\n\nBorraré las ofertas que aún no has usado y las candidaturas preparadas sin enviar, y volveré a buscar en todas las webs. Lo que ya enviaste no se toca.',
    'Sí, reiniciar', hacer);
}

function htmlReiniciar() {
  return busquedaCambiada()
    ? '<div class="tarjeta urgente"><div class="etiqueta">Has cambiado tu búsqueda</div><p>Has cambiado lo que buscas o dónde. Reinicia la búsqueda para que las ofertas se ajusten.</p>' +
      '<button class="boton" data-accion="reiniciar-busqueda">🔁 Reiniciar búsqueda</button></div>'
    : '<button class="boton texto" data-accion="reiniciar-busqueda">🔁 Reiniciar búsqueda</button>';
}

// Tras guardar «Qué busco» o el ámbito, ofrece reiniciar al momento
function ofrecerReinicio(volver) {
  if (!E.ultimaRevision || !busquedaCambiada()) { if (volver) volver(); return; }
  mensaje('Has cambiado tu búsqueda. ¿Reinicio la búsqueda ahora para actualizar las ofertas?',
    [{ texto: 'Sí, reiniciar ahora', accion: () => reiniciarBusqueda(true) }, { texto: 'Más tarde', accion: volver }]);
}

// ---------- Permiso antes de enviar ----------

async function enviarConPermiso(ids) {
  const lista = E.candidaturas.filter((c) => ids.includes(c.id) && c.estado === 'lista');
  if (!lista.length) return;
  lista.forEach((c) => hist(c, 'Diste permiso para enviarla'));
  try {
    const r = await enviarListas(true, lista);
    quitarCarga();
    mensaje(r.enviadas === lista.length ? (r.enviadas === 1 ? 'CV enviado. Te aviso cuando respondan.' : 'He enviado los ' + r.enviadas + ' CV. Te aviso cuando respondan.')
      : 'Enviados: ' + r.enviadas + '. Necesitan un paso tuyo: ' + r.pendientes + ' (los tienes en el inicio).', [{ texto: 'Entendido', accion: () => pintar() }]);
  } catch (err) { fallo(err); }
}

function rechazarCandidatura(id) {
  const c = E.candidaturas.find((x) => x.id === id);
  if (!c) return;
  c.estado = 'descartada';
  c.siguiente = 'No quisiste enviarla.';
  hist(c, 'No diste permiso para enviarla');
  guardar();
  pintar();
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el) return;
  const v = el.dataset.accion;
  if (v === 'reiniciar-busqueda') reiniciarBusqueda();
  else if (v.startsWith('permiso-si:')) enviarConPermiso([v.slice(11)]);
  else if (v.startsWith('permiso-no:')) rechazarCandidatura(v.slice(11));
  else if (v === 'permiso-todas') enviarConPermiso(E.candidaturas.filter((c) => c.estado === 'lista').map((c) => c.id));
});
