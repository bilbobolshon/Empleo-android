'use strict';
// Fase 2: LABORA, webs de empresas, ofertas, candidaturas con autorrelleno e historial.

const LABORA_URL = 'https://labora.gva.es/';
const HORAS_ENTRE_REVISIONES = 4;
let revisando = false;

const umbral = () => Number(E.ajustes.umbral || 6);
const avisar = (t, x) => notificarUsuario(t, x);
const nuevoId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function hist(c, texto) {
  c.historial = c.historial || [];
  c.historial.push({ t: Date.now(), texto });
}

function hora(ms) {
  return new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function host(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch (e) { return url; }
}

function asegurarLabora() {
  if (!E.sitios.find((s) => s.id === 'labora')) {
    E.sitios.unshift({ id: 'labora', nombre: 'LABORA', origen: 'labora', inicio: LABORA_URL, paginas: [], estado: 'nuevo' });
  }
  return E.sitios.find((s) => s.id === 'labora');
}

function seleccionBusqueda() {
  const { b, puestos } = busquedaActual();
  const quitados = new Set(b.quitados || []);
  return {
    puestos: puestos.filter((x) => !quitados.has(x)),
    sectores: SECTORES.filter((x) => !quitados.has(x)),
    todo: !quitados.size
  };
}

// ---------- IA con búsqueda en internet (para encontrar webs de empleo de empresas) ----------

async function iaConBusqueda(texto) {
  const mensajes = [{ role: 'user', content: texto }];
  const herramientas = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }];
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const d = await llamadaIA({ max_tokens: 12000, messages: mensajes, tools: herramientas });
    if (d.stop_reason === 'pause_turn') { mensajes.push({ role: 'assistant', content: d.content }); continue; }
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  throw new Error('La búsqueda en internet ha tardado demasiado. Vuelve a intentarlo.');
}

async function iaJsonBuscando(texto) {
  let t;
  try {
    t = await iaConBusqueda(texto);
  } catch (err) {
    if (/tool|web_search|search/i.test(err.message)) {
      t = await ia([{ type: 'text', text: texto + '\n\n(No puedes buscar en internet: usa lo que sepas y deja "url_empleo" vacío si no estás seguro.)' }], 8000);
    } else throw err;
  }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  try { return JSON.parse(t.slice(a, b + 1)); }
  catch (e) { throw new Error('La IA ha respondido de forma incompleta. Vuelve a intentarlo.'); }
}

// ---------- Instrucciones para la IA (fase 2) ----------

function resumenPerfil() {
  const p = E.perfil || {};
  return JSON.stringify({
    nombre: p.nombre, localidad: p.localidad, resumen: p.resumen,
    experiencia: lleno(p.experiencia).map((x) => ({ puesto: x.puesto, empresa: x.empresa, inicio: x.inicio, fin: x.fin })),
    formacion: lleno(p.formacion).map((x) => x.titulo), idiomas: p.idiomas, carnes: p.carnes, habilidades: p.habilidades
  });
}

function promptExtraer(s, pg, a) {
  const enlaces = (a.enlaces || []).slice(0, 250).map((x) => x.t + ' | ' + x.h).join('\n');
  const cursos = pg.tipo === 'cursos';
  return [
    'Esta es una página web de "' + s.nombre + '" (' + a.url + ').',
    'La app la ha abierto para ' + (cursos ? 'leer los cursos de formación del usuario y su estado.' : 'buscar ofertas de empleo.'),
    '',
    'TEXTO DE LA PÁGINA:', '<<<', (a.texto || '').slice(0, 25000), '>>>',
    '', 'ENLACES (texto | dirección):', enlaces,
    '',
    'Tareas:',
    '- Si la página pide iniciar sesión o identificarse para ver el contenido (y no se ve ya el área personal), pon "requiere_acceso": true.',
    cursos
      ? '- Extrae los cursos que aparecen como del usuario (seleccionado, preinscrito, admitido, en curso, finalizado…), con su estado tal como lo muestra la web.'
      : '- Extrae las ofertas de empleo que aparecen. "url" es el enlace de la oferta, tomado de la lista de enlaces; si no tiene enlace propio, usa la dirección de la página.',
    '- No incluyas menús, noticias ni avisos que no sean ' + (cursos ? 'cursos.' : 'ofertas.'),
    '',
    'Devuelve este JSON:',
    cursos
      ? '{"requiere_acceso":false,"cursos":[{"titulo":"","estado":"","fechas":"","lugar":"","resumen":"","url":""}]}'
      : '{"requiere_acceso":false,"ofertas":[{"titulo":"","empresa":"","lugar":"","resumen":"","fecha":"","url":""}]}'
  ].join('\n');
}

function promptValorar(ofertas) {
  const sel = seleccionBusqueda();
  return [
    'Valora si estas ofertas de empleo encajan con el candidato.',
    'Perfil: ' + resumenPerfil(),
    'Preferencias: ' + JSON.stringify(E.preferencias || {}),
    'Lo que quiere buscar: ' + (sel.todo ? 'todo tipo de puestos y sectores' : JSON.stringify({ puestos: sel.puestos, sectores: sel.sectores })),
    'Dónde quiere trabajar: vive en ' + (ciudad() || 'no indicado') + '; ámbito: ' + ambitoTexto() + '.',
    'Sus CV: ' + JSON.stringify(E.cvs.map((c) => ({ id: c.id, titulo: c.titulo, enfoque: c.contenido.titulo_profesional }))),
    'Ofertas: ' + JSON.stringify(ofertas.map((o) => ({ id: o.id, titulo: o.titulo, empresa: o.empresa, lugar: o.lugar, resumen: o.resumen }))),
    '',
    'Para cada oferta: "nota" de 0 a 10 (10 = encaja perfectamente; baja la nota si está fuera de lo que busca, fuera del ámbito geográfico que quiere o pide requisitos que no tiene),',
    '"motivo" en una frase sencilla y "cv" con el id del CV más adecuado (vacío si no tiene CV).',
    'Devuelve este JSON: {"valoraciones":[{"id":"","nota":0,"motivo":"","cv":""}]}'
  ].join('\n');
}

function promptEmpresas() {
  const sel = seleccionBusqueda();
  const p = E.perfil || {};
  return [
    'Busca en internet empresas reales que puedan contratar a este candidato.',
    'Perfil: ' + resumenPerfil(),
    'Vive en: ' + (ciudad() || 'no indicado') + '. Zona donde quiere trabajar: ' + ((E.preferencias && E.preferencias.zona) || 'no indicada') + '.',
    'Ámbito en el que quiere buscar: ' + ambitoTexto() + '.',
    'Lo que busca: ' + (sel.todo ? 'cualquier puesto acorde a su experiencia' : JSON.stringify({ puestos: sel.puestos, sectores: sel.sectores })),
    'Ya tiene en su lista (no las repitas): ' + E.sitios.map((s) => s.nombre).join(', '),
    '',
    'Propón entre 8 y 12 empresas de sectores afines a su perfil, repartidas según ese ámbito: empresas locales de su localidad y alrededores, de su provincia y comunidad, grandes empresas nacionales con centros en su zona y, solo si lo ha marcado, internacionales.',
    'En "sector" indica también el ámbito (local, provincial, nacional o internacional).',
    'Para cada una busca la dirección oficial de su página de empleo ("Trabaja con nosotros", "Empleo", portal de candidatos). Si no la encuentras, deja "url_empleo" vacío.',
    'Responde ÚNICAMENTE con este JSON: {"empresas":[{"nombre":"","sector":"","motivo":"","url_empleo":""}]}'
  ].join('\n');
}

function promptUrlEmpresa(nombre) {
  return [
    'Busca en internet la página oficial de empleo ("Trabaja con nosotros", "Empleo", portal de candidatos) de la empresa: ' + nombre + '.',
    'El candidato vive en ' + ((E.perfil && E.perfil.localidad) || 'España') + '; si la empresa tiene web de empleo para España, usa esa.',
    'Responde ÚNICAMENTE con este JSON: {"nombre":"","url_empleo":""}'
  ].join('\n');
}

function promptRellenar(campos, cv, oferta) {
  return [
    'Vas a ayudar a rellenar un formulario de candidatura de empleo en una web.',
    'Oferta: ' + JSON.stringify({ titulo: oferta.titulo, empresa: oferta.empresa, resumen: oferta.resumen }),
    'Perfil del candidato: ' + JSON.stringify(E.perfil),
    'Preferencias: ' + JSON.stringify(E.preferencias || {}),
    'CV elegido: ' + JSON.stringify(cv.contenido),
    'Campos del formulario ("i" es el número de campo): ' + JSON.stringify(campos).slice(0, 30000),
    '',
    'Reglas:',
    '- Rellena solo con datos que estén en el perfil, las preferencias o el CV. No inventes nada (ni DNI, ni fechas, ni contraseñas).',
    '- En "select" y "radio" el valor debe ser exactamente una de las opciones.',
    '- En "checkbox" el valor es true o false. No marques condiciones legales, privacidad ni publicidad: déjalas fuera, las decide el usuario.',
    '- En un "textarea" de carta de presentación o motivación escribe de 4 a 6 frases adaptadas a la oferta.',
    '- No incluyas campos de tipo "file". Omite los campos que ya tengan el valor correcto.',
    '- En "pendientes" pon las etiquetas de los campos obligatorios que no puedas rellenar.',
    'Devuelve este JSON: {"valores":[{"i":0,"valor":""}],"pendientes":[""]}'
  ].join('\n');
}

// ---------- Revisión de webs (LABORA, empresas, portales) ----------

function sitiosRevisables() {
  return E.sitios.filter((s) => s.activo !== false && lleno(s.paginas).some((p) => p.url));
}

async function revisarTodo(deUsuario) {
  if (revisando) { if (deUsuario) mensaje('Ya estoy revisando. Te aviso al terminar.'); return; }
  if (!E.ajustes.apiKey) { if (deUsuario) fallo(new Error('SIN_CLAVE')); return; }
  if (!Nav.disponible()) { if (deUsuario) mensaje('La revisión de webs solo funciona dentro de la app del móvil.'); return; }
  const sitios = sitiosRevisables();
  if (!sitios.length) {
    if (deUsuario) mensaje('Aún no hay webs que revisar. Añade empresas o configura LABORA.', [{ texto: 'Añadir empresas', accion: () => ir('empresas') }, { texto: 'Configurar LABORA', accion: () => ir('labora') }]);
    return;
  }
  revisando = true;
  refrescarSiInicio();
  let nuevas = [], cambiosCursos = [];
  const accesos = [];
  try {
    await Nav.cola(async () => {
      for (let k = 0; k < sitios.length; k++) {
        const s = sitios[k];
        if (deUsuario) cargando('Revisando ' + (k + 1) + ' de ' + sitios.length + ':\n' + s.nombre);
        const r = await revisarSitio(s);
        nuevas = nuevas.concat(r.nuevas);
        cambiosCursos = cambiosCursos.concat(r.cursos);
        if (s.estado === 'acceso') accesos.push(s);
        guardar();
      }
    });
    if (nuevas.length) {
      if (deUsuario) cargando('Valorando ' + nuevas.length + ' ofertas nuevas…');
      await valorar(nuevas);
    }
    E.ultimaRevision = Date.now();
    guardar();
  } catch (err) {
    revisando = false;
    Nav.ocultar();
    if (deUsuario) fallo(err);
    refrescarSiInicio();
    return;
  }
  revisando = false;
  quitarCarga();
  const buenas = nuevas.filter((o) => (o.nota || 0) >= umbral());
  if (buenas.length) {
    avisar(buenas.length === 1 ? 'Nueva oferta para ti' : buenas.length + ' ofertas nuevas para ti',
      buenas.slice(0, 3).map((o) => o.titulo + ' (' + o.nota + '/10)' + (o.empresa ? ' — ' + o.empresa : '')).join('\n'));
  }
  cambiosCursos.forEach((c) => avisar('Tu curso ha cambiado', c));
  if (accesos.length) avisar('Te necesito un momento', accesos.map((s) => s.nombre).join(', ') + ' pide que entres con tus datos.');
  if (deUsuario) {
    mensaje('Revisión terminada.\n\n' +
      '• Ofertas nuevas: ' + nuevas.length + (nuevas.length ? ' (' + buenas.length + ' encajan contigo)' : '') + '\n' +
      (cambiosCursos.length ? '• Cambios en tus cursos: ' + cambiosCursos.length + '\n' : '') +
      (accesos.length ? '• Necesitan que entres tú: ' + accesos.map((s) => s.nombre).join(', ') : ''),
      [{ texto: buenas.length ? 'Ver ofertas' : 'Volver al inicio', accion: () => ir(buenas.length ? 'ofertas' : 'inicio') }]);
  } else {
    refrescarSiInicio();
  }
}

// Revisa todas las páginas de un sitio. No pasa el control: si hace falta entrar, lo marca.
async function revisarSitio(s) {
  const res = { nuevas: [], cursos: [] };
  for (const pg of lleno(s.paginas).filter((p) => p.url)) {
    try {
      await Nav.abrir(pg.url);
      const a = await Nav.analizar();
      if (a.obstaculo) { marcarAcceso(s, a.obstaculo); return res; }
      const r = await iaJson([{ type: 'text', text: promptExtraer(s, pg, a) }], 8000);
      if (r.requiere_acceso) { marcarAcceso(s, 'login'); return res; }
      incorporar(s, pg, r, res);
      s.estado = 'ok';
      s.error = '';
      s.ultima = Date.now();
    } catch (err) {
      if (err.message === 'SIN_CLAVE') throw err;
      s.estado = 'error';
      s.error = err.message;
    }
  }
  return res;
}

function marcarAcceso(s, tipo) {
  s.estado = 'acceso';
  s.obstaculo = tipo;
  s.ultimoAviso = Date.now();
}

function incorporar(s, pg, r, res) {
  if (pg.tipo === 'cursos') {
    lleno(r.cursos).forEach((c) => {
      if (!c.titulo) return;
      const clave = c.titulo.toLowerCase().trim();
      const prev = E.cursos.find((x) => x.clave === clave);
      if (!prev) {
        E.cursos.unshift(Object.assign({ id: nuevoId('cu'), clave, sitio: s.id, visto: Date.now() }, c));
        res.cursos.push('Nuevo curso: ' + c.titulo + (c.estado ? ' (' + c.estado + ')' : ''));
      } else if ((c.estado || '') !== (prev.estado || '')) {
        res.cursos.push(c.titulo + ': ' + (prev.estado || '—') + ' → ' + (c.estado || '—'));
        Object.assign(prev, c, { cambio: Date.now() });
      }
    });
    return;
  }
  lleno(r.ofertas).forEach((o) => {
    if (!o.titulo) return;
    const clave = ((o.url || '') + '|' + o.titulo).toLowerCase();
    if (E.ofertas.find((x) => x.clave === clave)) return;
    const nueva = Object.assign({ id: nuevoId('of'), clave, sitio: s.id, fuente: s.nombre, estado: 'nueva', visto: Date.now(), nota: null },
      o, { empresa: o.empresa || (s.origen === 'empresa' ? s.nombre : '') , url: o.url || pg.url });
    E.ofertas.unshift(nueva);
    res.nuevas.push(nueva);
  });
  if (E.ofertas.length > 400) E.ofertas = E.ofertas.slice(0, 400);
}

async function valorar(lista) {
  for (let i = 0; i < lista.length; i += 15) {
    const tanda = lista.slice(i, i + 15);
    try {
      const r = await iaJson([{ type: 'text', text: promptValorar(tanda) }], 6000);
      lleno(r.valoraciones).forEach((v) => {
        const o = E.ofertas.find((x) => x.id === v.id);
        if (o) { o.nota = Math.max(0, Math.min(10, Math.round(Number(v.nota) || 0))); o.motivo = v.motivo || ''; o.cv = v.cv || ''; }
      });
      guardar();
    } catch (err) {
      if (err.message === 'SIN_CLAVE') throw err;
    }
  }
}

// El usuario resuelve el acceso de un sitio y la app recupera el control
function entrarEnSitio(id) {
  const s = E.sitios.find((x) => x.id === id);
  if (!s) return;
  const pg = lleno(s.paginas).find((p) => p.url);
  const url = pg ? pg.url : (s.inicio || '');
  if (!url) { ir(s.id === 'labora' ? 'labora' : 'empresas'); return; }
  if (Nav.ocupado) { mensaje('Estoy terminando otra tarea. Inténtalo en unos segundos.'); return; }
  Nav.cola(async () => {
    Nav.panel('Abriendo ' + s.nombre + '…', [{ id: 'cancelar', texto: 'Cancelar' }]);
    await Nav.abrir(url);
    if (Nav.tomarBotonSuelto() === 'cancelar') { Nav.ocultar(); return; }
    let ok = await resolverAcceso(url, s.nombre, s.estado === 'acceso' && s.obstaculo === 'login');
    if (!ok) { Nav.ocultar(); return; }
    Nav.panel('Perfecto, ya sigo yo. Revisando ' + s.nombre + '…', []);
    let r = await revisarSitio(s);
    if (s.estado === 'acceso') {
      ok = await resolverAcceso(url, s.nombre, true);
      if (ok) r = await revisarSitio(s);
    }
    Nav.ocultar();
    guardar();
    if (r.nuevas.length) { cargando('Valorando ' + r.nuevas.length + ' ofertas nuevas…'); await valorar(r.nuevas); quitarCarga(); }
    mensaje(s.estado === 'ok'
      ? 'Listo. He recuperado el control y he revisado ' + s.nombre + '.\nOfertas nuevas: ' + r.nuevas.length + (r.cursos.length ? '\nCambios en cursos: ' + r.cursos.length : '')
      : 'No he podido terminar de revisar ' + s.nombre + '. Lo intentaré en la próxima revisión.',
      [{ texto: 'Volver al inicio', accion: () => ir('inicio') }]);
  }).catch((err) => { Nav.ocultar(); fallo(err); });
}

// Muestra una web para que el usuario la vea; él la cierra
function verWeb(url, titulo) {
  if (!url) return;
  if (!Nav.disponible()) { abrirEnlace(url); return; }
  if (Nav.ocupado) { mensaje('Estoy terminando otra tarea. Inténtalo en unos segundos.'); return; }
  Nav.cola(async () => {
    Nav.panel(titulo || host(url), [{ id: 'cerrar', texto: 'Cerrar' }]);
    Nav.abrir(url);
    await Nav.esperarBoton();
    Nav.ocultar();
  });
}

// ---------- LABORA ----------

function pLabora() {
  const s = asegurarLabora();
  const pag = (t) => lleno(s.paginas).find((p) => p.tipo === t);
  const cursos = E.cursos.filter((c) => c.sitio === 'labora');
  const ofertas = E.ofertas.filter((o) => o.sitio === 'labora');
  const estado = s.estado === 'acceso' ? '<div class="tarjeta urgente pulsable" data-accion="entrar:labora"><div class="etiqueta">Pendiente de ti</div><h3>Entra en LABORA →</h3><p class="suave">Tu sesión ha caducado. Entra y yo sigo.</p></div>'
    : s.ultima ? '<p class="suave">Revisado por última vez: ' + hora(s.ultima) + '</p>' : '';

  pantalla('LABORA',
    estado +
    '<div class="tarjeta"><h3>Configurar LABORA</h3>' +
    '<ol class="pasos suave">' +
      '<li>Pulsa «Entrar en LABORA».</li>' +
      '<li>Entra en tu área personal como siempre: Cl@ve, certificado digital o usuario.</li>' +
      '<li>Ve a la página donde ves <b>tus ofertas</b> y pulsa arriba «Aquí están mis ofertas».</li>' +
      '<li>Ve a la página de <b>tus cursos</b> y pulsa «Aquí están mis cursos».</li>' +
    '</ol>' +
    '<p>Mis ofertas: ' + (pag('ofertas') ? '✅ guardada' : '— sin configurar') + '<br>Mis cursos: ' + (pag('cursos') ? '✅ guardada' : '— sin configurar') + '</p>' +
    '<button class="boton" data-accion="ensenar-labora">Entrar en LABORA</button>' +
    (pag('ofertas') || pag('cursos') ? '<button class="boton secundario" data-accion="revisar-labora">Revisar LABORA ahora</button>' : '') +
    '</div>' +
    '<h3>Mis cursos (' + cursos.length + ')</h3>' +
    (cursos.length ? cursos.map((c) => '<div class="tarjeta"' + (c.url ? ' data-accion="ver:' + esc(c.url) + '"' : '') + '><h3>' + esc(c.titulo) + '</h3>' +
      '<p class="suave">' + [c.estado, c.fechas, c.lugar].filter(Boolean).map(esc).join(' · ') + '</p></div>').join('')
      : '<p class="suave">Aún no he leído tus cursos.</p>') +
    '<h3>Mis ofertas de LABORA (' + ofertas.length + ')</h3>' +
    (ofertas.length ? ofertas.slice(0, 20).map(tarjetaOferta).join('') : '<p class="suave">Aún no he leído tus ofertas.</p>'));
}

function ensenarLabora() {
  const s = asegurarLabora();
  if (Nav.ocupado) { mensaje('Estoy terminando otra tarea. Inténtalo en unos segundos.'); return; }
  const botones = [
    { id: 'ofertas', texto: 'Aquí están mis ofertas', principal: true },
    { id: 'cursos', texto: 'Aquí están mis cursos', principal: true },
    { id: 'cerrar', texto: 'Cerrar' }
  ];
  const texto = 'Entra en tu área personal (Cl@ve, certificado o usuario). Luego ve a tus ofertas o a tus cursos y pulsa el botón que corresponda.';
  Nav.cola(async () => {
    Nav.panel(texto, botones);
    Nav.abrir(s.inicio || LABORA_URL);
    for (;;) {
      const b = await Nav.esperarBoton();
      if (b !== 'ofertas' && b !== 'cursos') break;
      const a = await Nav.analizar();
      if (a.obstaculo) { Nav.panel('Todavía no estás dentro. ' + texto, botones); continue; }
      s.paginas = lleno(s.paginas).filter((p) => p.tipo !== b).concat([{ tipo: b, url: a.url }]);
      s.estado = 'nuevo';
      guardar();
      if (nativo) nativo.aviso(b === 'ofertas' ? 'Página de ofertas guardada' : 'Página de cursos guardada');
      Nav.panel('Guardado. ' + (b === 'ofertas' ? 'Ahora, si quieres, ve a tus cursos.' : 'Ahora, si quieres, ve a tus ofertas.') + ' Cuando termines pulsa «Cerrar».', botones);
    }
    Nav.ocultar();
    pLabora();
    if (lleno(s.paginas).length) {
      mensaje('LABORA configurado. ¿Lo reviso ahora?', [{ texto: 'Sí, revisar', accion: () => revisarUno('labora') }, { texto: 'Más tarde' }]);
    }
  }).catch((err) => { Nav.ocultar(); fallo(err); });
}

function revisarUno(id) {
  const s = E.sitios.find((x) => x.id === id);
  if (!s) return;
  entrarEnSitio(id);
}

// ---------- Empresas y webs ----------

function pEmpresas() {
  const lista = E.sitios.filter((s) => s.id !== 'labora');
  const estado = (s) => s.estado === 'acceso' ? '🔑 Necesita que entres tú'
    : s.estado === 'error' ? '⚠️ No se pudo leer' : s.ultima ? '✅ Revisada ' + hora(s.ultima) : '⏳ Sin revisar';

  pantalla('Empresas y webs',
    '<p class="suave">Estas webs las reviso yo cada cierto tiempo para buscarte ofertas. Puedes añadir empresas, o pegar el enlace de una búsqueda de InfoJobs, Indeed u otro portal.</p>' +
    '<button class="boton" data-accion="proponer">✨ Proponer empresas afines a mi perfil</button>' +
    '<label class="campo" for="nueva-empresa">Añadir una empresa o web</label>' +
    '<input type="text" id="nueva-empresa" placeholder="Nombre (ej.: Mercadona) o enlace">' +
    '<button class="boton secundario" data-accion="anadir-empresa">Añadir</button>' +
    '<h3>Mi lista (' + lista.length + ')</h3>' +
    (lista.length ? lista.map((s) => {
      const url = (lleno(s.paginas)[0] || {}).url || '';
      return '<div class="tarjeta"><h3>' + esc(s.nombre) + '</h3>' +
        '<p class="suave">' + esc(host(url)) + (s.motivo ? ' · ' + esc(s.motivo) : '') + '<br>' + estado(s) + '</p>' +
        '<div class="fila">' +
          (s.estado === 'acceso' ? '<button class="boton" data-accion="entrar:' + s.id + '">Entrar</button>' : '<button class="boton secundario" data-accion="ver:' + esc(url) + '">Ver web</button>') +
          '<button class="boton peligro" data-accion="quitar-sitio:' + s.id + '">Quitar</button>' +
        '</div></div>';
    }).join('') : '<p class="suave">Tu lista está vacía. Pulsa «Proponer empresas» o añade las tuyas.</p>'));
}

async function proponerEmpresas() {
  if (!E.perfil) { mensaje('Primero sube tu CV para que sepa qué empresas te encajan.', [{ texto: 'Subir CV', accion: () => ir('subir') }]); return; }
  cargando('Buscando empresas afines a tu perfil…\nPuede tardar un par de minutos.');
  try {
    const r = await iaJsonBuscando(promptEmpresas());
    quitarCarga();
    const empresas = lleno(r.empresas).filter((e) => e.nombre);
    if (!empresas.length) { mensaje('No he encontrado empresas nuevas. Prueba a añadirlas a mano.'); return; }
    pantalla('Empresas propuestas',
      '<p class="suave">Marca las que quieras que vigile. Las que no tienen web de empleo las puedes completar luego.</p>' +
      empresas.map((e, i) => '<label class="tarjeta orientacion"><input type="checkbox" data-e="' + i + '"' + (e.url_empleo ? ' checked' : '') + '>' +
        '<div><h3>' + esc(e.nombre) + '</h3><p class="suave">' + esc([e.sector, e.motivo].filter(Boolean).join(' · ')) + '</p>' +
        '<p class="suave">' + (e.url_empleo ? '🔗 ' + esc(host(e.url_empleo)) : 'Sin web de empleo encontrada') + '</p></div></label>').join('') +
      '<button class="boton" id="guardar-empresas">Añadir las marcadas</button>');
    $('#guardar-empresas').onclick = () => {
      let n = 0;
      document.querySelectorAll('[data-e]:checked').forEach((c) => {
        const e = empresas[Number(c.dataset.e)];
        if (!e.url_empleo) return;
        E.sitios.push({ id: nuevoId('si'), nombre: e.nombre, origen: 'empresa', motivo: e.sector || '', paginas: [{ tipo: 'ofertas', url: e.url_empleo }], estado: 'nuevo' });
        n++;
      });
      guardar();
      mensaje(n ? 'He añadido ' + n + ' empresas. Las revisaré en la próxima revisión.' : 'No has añadido ninguna (las que no tienen web de empleo no se pueden vigilar).',
        [{ texto: 'Revisar ahora', accion: () => revisarTodo(true) }, { texto: 'Ver mi lista', accion: () => ir('empresas') }]);
    };
  } catch (err) { fallo(err); }
}

async function anadirEmpresa() {
  const t = ($('#nueva-empresa') || {}).value ? $('#nueva-empresa').value.trim() : '';
  if (!t) { mensaje('Escribe el nombre de la empresa o pega un enlace.'); return; }
  if (/^https?:\/\//i.test(t) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(t)) {
    const url = /^https?:/i.test(t) ? t : 'https://' + t;
    E.sitios.push({ id: nuevoId('si'), nombre: host(url), origen: 'manual', paginas: [{ tipo: 'ofertas', url }], estado: 'nuevo' });
    guardar();
    pEmpresas();
    mensaje('Añadida. La revisaré en la próxima revisión.');
    return;
  }
  cargando('Buscando la web de empleo de ' + t + '…');
  try {
    const r = await iaJsonBuscando(promptUrlEmpresa(t));
    quitarCarga();
    if (!r.url_empleo) {
      mensaje('No he encontrado la web de empleo de ' + t + '. Si la conoces, pega aquí el enlace de su «Trabaja con nosotros».');
      return;
    }
    preguntar('He encontrado esta web de empleo de ' + (r.nombre || t) + ':\n' + r.url_empleo + '\n\n¿La añado a tu lista?', 'Sí, añadir', () => {
      E.sitios.push({ id: nuevoId('si'), nombre: r.nombre || t, origen: 'empresa', paginas: [{ tipo: 'ofertas', url: r.url_empleo }], estado: 'nuevo' });
      guardar();
      pEmpresas();
    });
  } catch (err) { fallo(err); }
}

// ---------- Ofertas ----------

function tarjetaOferta(o) {
  const nota = o.nota == null ? '' : '<span class="nota-oferta n' + (o.nota >= 8 ? 'a' : o.nota >= umbral() ? 'b' : 'c') + '">' + o.nota + '/10</span>';
  return '<div class="tarjeta">' + nota + '<h3>' + esc(o.titulo) + '</h3>' +
    '<p class="suave">' + [o.empresa, o.lugar, o.fuente].filter(Boolean).map(esc).join(' · ') + '</p>' +
    (o.motivo ? '<p>' + esc(o.motivo) + '</p>' : '') +
    (o.estado === 'candidatura' ? '<p class="suave">📋 Ya tienes una candidatura en marcha</p>' : '') +
    '<div class="fila">' +
      '<button class="boton secundario" data-accion="ver:' + esc(o.url) + '">Ver</button>' +
      (o.estado !== 'candidatura' ? '<button class="boton" data-accion="presentarme:' + o.id + '">Presentarme</button>' : '<button class="boton" data-ir="candidaturas">Ver candidatura</button>') +
    '</div>' +
    (o.estado === 'nueva' ? '<button class="boton texto" data-accion="descartar:' + o.id + '">No me interesa</button>' : '') +
    '</div>';
}

function pOfertas(arg) {
  const todas = arg === 'todas';
  const visibles = E.ofertas.filter((o) => o.estado !== 'descartada' && (todas || o.nota == null || o.nota >= umbral()))
    .sort((a, b) => (b.nota || 0) - (a.nota || 0) || b.visto - a.visto);
  const ocultas = E.ofertas.filter((o) => o.estado !== 'descartada').length - visibles.length;
  const opciones = [4, 5, 6, 7, 8].map((n) => '<option value="' + n + '"' + (n === umbral() ? ' selected' : '') + '>' + n + ' o más</option>').join('');

  pantalla('Ofertas',
    '<button class="boton" data-accion="revisar">🔄 Buscar ofertas ahora</button>' +
    (E.ultimaRevision ? '<p class="suave centro">Última búsqueda: ' + hora(E.ultimaRevision) + '</p>' : '') +
    '<label class="campo" for="umbral">Mostrar ofertas con nota</label><select id="umbral">' + opciones + '</select>' +
    (visibles.length ? visibles.slice(0, 60).map(tarjetaOferta).join('')
      : '<div class="tarjeta"><h3>Sin ofertas por ahora</h3><p class="suave">Pulsa «Buscar ofertas ahora». Busco en LABORA y en las empresas de tu lista.</p></div>') +
    (ocultas > 0 && !todas ? '<button class="boton texto" data-ir="ofertas/todas">Ver también ' + ocultas + ' con nota más baja</button>' : ''));

  $('#umbral').onchange = (ev) => { E.ajustes.umbral = Number(ev.target.value); guardar(); pOfertas(arg); };
  E.ofertas.forEach((o) => { if (o.estado === 'nueva' && o.nota != null) o.leida = true; });
  guardar();
}

// ---------- Candidaturas ----------

const ESTADOS = {
  preparando: { t: 'Preparando', c: 'b' },
  pendiente_ti: { t: 'Pendiente de ti', c: 'c' },
  enviada: { t: 'Enviada', c: 'b' },
  respondida: { t: 'Te han respondido', c: 'a' },
  entrevista: { t: 'Entrevista', c: 'a' },
  descartada: { t: 'Descartada', c: 'x' }
};

function siguientePaso(c) {
  if (c.estado === 'enviada') {
    const dias = Math.floor((Date.now() - (c.enviada || Date.now())) / 86400000);
    return dias >= 10
      ? 'Han pasado ' + dias + ' días sin respuesta. Puedes llamar o escribir para interesarte (pronto te lo dejaré redactado).'
      : 'Esperando respuesta. Si en ' + (10 - dias) + ' días no hay noticias, te propondré hacer un seguimiento.';
  }
  return c.siguiente || '';
}

function pCandidaturas() {
  const lista = E.candidaturas;
  pantalla('Candidaturas',
    (lista.length ? lista.map((c) => {
      const e = ESTADOS[c.estado] || ESTADOS.preparando;
      return '<div class="tarjeta pulsable" data-ir="candidatura/' + c.id + '"><span class="estado-c e' + e.c + '">' + e.t + '</span>' +
        '<h3>' + esc(c.titulo) + '</h3><p class="suave">' + [c.empresa, c.fuente].filter(Boolean).map(esc).join(' · ') + '</p>' +
        '<p><b>Siguiente paso:</b> ' + esc(siguientePaso(c)) + '</p></div>';
    }).join('') : '<div class="tarjeta"><h3>Aún no tienes candidaturas</h3><p class="suave">Entra en Ofertas y pulsa «Presentarme» en la que te interese.</p></div>'));
}

function pCandidatura(id) {
  const c = E.candidaturas.find((x) => x.id === id);
  if (!c) { ir('candidaturas'); return; }
  const e = ESTADOS[c.estado] || ESTADOS.preparando;
  const cv = E.cvs.find((x) => x.id === c.cv);
  const pendiente = c.estado === 'pendiente_ti' || c.estado === 'preparando';

  pantalla('Candidatura',
    '<span class="estado-c e' + e.c + '">' + e.t + '</span><h2>' + esc(c.titulo) + '</h2>' +
    '<p class="suave">' + [c.empresa, c.fuente].filter(Boolean).map(esc).join(' · ') + (cv ? '<br>CV usado: ' + esc(cv.titulo) : '') + '</p>' +
    '<div class="tarjeta ' + (pendiente ? 'urgente' : 'bien') + '"><div class="etiqueta">Siguiente paso</div><p>' + esc(siguientePaso(c)) + '</p></div>' +
    (pendiente ? '<button class="boton" data-accion="presentarme:' + c.oferta + '">Continuar candidatura</button>' : '') +
    (c.url ? '<button class="boton secundario" data-accion="ver:' + esc(c.url) + '">Ver la oferta</button>' : '') +
    '<label class="campo" for="cambiar-estado">Cambiar estado</label>' +
    '<select id="cambiar-estado">' + Object.keys(ESTADOS).map((k) => '<option value="' + k + '"' + (k === c.estado ? ' selected' : '') + '>' + ESTADOS[k].t + '</option>').join('') + '</select>' +
    '<h3>Historial</h3>' +
    '<div class="tarjeta">' + lleno(c.historial).slice().reverse().map((h) => '<p><span class="suave">' + hora(h.t) + '</span><br>' + esc(h.texto) + '</p>').join('') + '</div>' +
    '<button class="boton peligro" data-accion="borrar-cand:' + c.id + '">Borrar esta candidatura</button>');

  $('#cambiar-estado').onchange = (ev) => {
    const nuevo = ev.target.value;
    if (nuevo === c.estado) return;
    c.estado = nuevo;
    hist(c, 'Estado cambiado a mano: ' + ESTADOS[nuevo].t);
    c.siguiente = {
      respondida: 'Lee su respuesta y contesta cuanto antes.',
      entrevista: 'Prepárate la entrevista: repasa la oferta y tu CV. Apunta día, hora y lugar.',
      descartada: 'No hace falta hacer nada más.',
      pendiente_ti: 'Pulsa «Continuar candidatura» para terminarla.',
      preparando: 'Pulsa «Continuar candidatura» para terminarla.'
    }[nuevo] || '';
    if (nuevo === 'enviada' && !c.enviada) c.enviada = Date.now();
    guardar();
    pCandidatura(id);
  };
}

function pausar(c, motivo) {
  c.estado = 'pendiente_ti';
  c.siguiente = motivo + '. Pulsa «Continuar candidatura» para retomarla.';
  hist(c, 'En pausa: ' + motivo);
  guardar();
}

// Rellena la candidatura en la web; pasa a manual para accesos y para el envío final
function presentarme(ofertaId) {
  const o = E.ofertas.find((x) => x.id === ofertaId);
  if (!o) { mensaje('No encuentro esa oferta.'); return; }
  if (!E.cvs.length) { mensaje('Primero crea al menos un CV.', [{ texto: 'Ir a Mis CV', accion: () => ir('miscv') }]); return; }
  if (!o.url) { mensaje('Esta oferta no tiene enlace para presentarse.'); return; }
  if (!Nav.disponible()) { mensaje('Las candidaturas solo funcionan dentro de la app del móvil.'); return; }
  if (Nav.ocupado) { mensaje('Estoy terminando otra tarea (por ejemplo, una revisión). Inténtalo en unos segundos.'); return; }

  const cv = E.cvs.find((x) => x.id === o.cv) || E.cvs[0];
  let c = E.candidaturas.find((x) => x.oferta === o.id);
  if (!c) {
    c = { id: nuevoId('ca'), oferta: o.id, titulo: o.titulo, empresa: o.empresa, fuente: o.fuente, url: o.url, cv: cv.id, estado: 'preparando', historial: [] };
    E.candidaturas.unshift(c);
    hist(c, 'Empieza la candidatura con el CV «' + cv.titulo + '»');
  } else {
    hist(c, 'Se retoma la candidatura');
  }
  o.estado = 'candidatura';
  guardar();
  const cvUsado = E.cvs.find((x) => x.id === c.cv) || cv;

  Nav.cola(async () => {
    Nav.panel('Abriendo la oferta…', [{ id: 'cancelar', texto: 'Cancelar' }]);
    await Nav.abrir(c.url);
    if (Nav.tomarBotonSuelto() === 'cancelar') { pausar(c, 'La cancelaste al abrirla'); Nav.ocultar(); return; }
    if (!(await resolverAcceso(null, c.fuente))) { pausar(c, 'Falta que entres en ' + (c.fuente || 'la web')); Nav.ocultar(); return; }
    hist(c, 'La app abrió la oferta');
    let vueltas = 0;
    for (;;) {
      if (++vueltas > 10) { pausar(c, 'Formulario demasiado largo'); break; }
      const campos = (await Nav.ejecutarJson(JS_FORMULARIO)) || [];
      const rellenables = campos.filter((f) => f.tipo !== 'file');
      if (!rellenables.length) {
        Nav.panel('No veo todavía el formulario. Busca en la web el botón «Inscribirme», «Aplicar» o «Enviar CV» y llega hasta el formulario. Luego pulsa «Ya está, continúa».',
          [{ id: 'continuar', texto: 'Ya está, continúa', principal: true }, { id: 'enviada', texto: 'Ya la he enviado' }, { id: 'cancelar', texto: 'Ahora no' }]);
        hist(c, 'Pasa a manual: llegar al formulario');
        const b = await Nav.esperarBoton();
        if (b === 'enviada') { marcarEnviada(c); break; }
        if (b !== 'continuar') { pausar(c, 'Falta llegar al formulario de la web'); break; }
        if (!(await resolverAcceso(null, c.fuente))) { pausar(c, 'Falta que entres en ' + (c.fuente || 'la web')); break; }
        continue;
      }
      Nav.panel('Rellenando el formulario con tus datos…', []);
      const m = await iaJson([{ type: 'text', text: promptRellenar(campos, cvUsado, o) }], 8000);
      const r = await Nav.ejecutarJson(jsRellenar(lleno(m.valores)));
      const n = r ? r.rellenados : 0;
      hist(c, 'La app rellenó ' + n + ' campos');
      const falta = lleno(m.pendientes);
      const archivo = campos.some((f) => f.tipo === 'file');
      let texto = 'He rellenado ' + n + ' campos. Revísalos.';
      if (archivo) texto += '\nSi pide adjuntar el CV, elige «' + cvUsado.titulo + '» (guárdalo antes en PDF desde Mis CV).';
      if (falta.length) texto += '\nCompleta tú: ' + falta.slice(0, 5).join(', ') + '.';
      texto += '\nCuando esté bien, pulsa TÚ el botón de enviar de la web. Si hay otra página, pasa a ella y pulsa «Rellenar esta página».';
      Nav.panel(texto, [
        { id: 'enviada', texto: 'Ya la he enviado', principal: true },
        { id: 'siguiente', texto: 'Rellenar esta página' },
        { id: 'cancelar', texto: 'No la envío' }
      ]);
      hist(c, 'Pasa a manual: revisión y envío');
      const b = await Nav.esperarBoton();
      if (b === 'enviada') { marcarEnviada(c); break; }
      if (b === 'siguiente') {
        Nav.panel('Recuperando el control…', []);
        if (!(await resolverAcceso(null, c.fuente))) { pausar(c, 'Falta que entres en ' + (c.fuente || 'la web')); break; }
        continue;
      }
      pausar(c, 'No la enviaste');
      break;
    }
    Nav.ocultar();
    guardar();
    ir('candidatura/' + c.id);
  }).catch((err) => { Nav.ocultar(); pausar(c, 'Se interrumpió por un error'); fallo(err); });
}

function marcarEnviada(c) {
  c.estado = 'enviada';
  c.enviada = Date.now();
  c.siguiente = '';
  hist(c, 'Enviada tras tu confirmación');
  guardar();
  notificarUsuario('Candidatura enviada', c.titulo + (c.empresa ? ' — ' + c.empresa : '') + '. Te avisaré cuando respondan.');
}

// ---------- Lo urgente (pantalla de inicio) ----------

function urgentesFase2() {
  const t = [];
  E.sitios.filter((s) => s.estado === 'acceso').forEach((s) => {
    t.push('<div class="tarjeta urgente pulsable" data-accion="entrar:' + s.id + '"><div class="etiqueta">Pendiente de ti</div>' +
      '<h3>Entra en ' + esc(s.nombre) + ' →</h3><p class="suave">' + esc(textoObstaculo(s.obstaculo, '', 0).split('\n')[0].replace('Te toca: ', '')) + ' Luego sigo yo.</p></div>');
  });
  E.candidaturas.filter((c) => c.estado === 'pendiente_ti').forEach((c) => {
    t.push('<div class="tarjeta urgente pulsable" data-ir="candidatura/' + c.id + '"><div class="etiqueta">Pendiente de ti</div>' +
      '<h3>Termina tu candidatura →</h3><p class="suave">' + esc(c.titulo) + (c.empresa ? ' — ' + esc(c.empresa) : '') + '</p></div>');
  });
  E.candidaturas.filter((c) => c.estado === 'entrevista' || c.estado === 'respondida').forEach((c) => {
    t.push('<div class="tarjeta bien pulsable" data-ir="candidatura/' + c.id + '"><div class="etiqueta">' + ESTADOS[c.estado].t + '</div>' +
      '<h3>' + esc(c.titulo) + ' →</h3><p class="suave">' + esc(siguientePaso(c)) + '</p></div>');
  });
  const nuevas = E.ofertas.filter((o) => o.estado === 'nueva' && !o.leida && (o.nota || 0) >= umbral());
  if (nuevas.length) {
    t.push('<div class="tarjeta bien pulsable" data-ir="ofertas"><div class="etiqueta">Novedad</div>' +
      '<h3>' + nuevas.length + (nuevas.length === 1 ? ' oferta nueva encaja' : ' ofertas nuevas encajan') + ' contigo →</h3>' +
      '<p class="suave">' + esc(nuevas.slice(0, 2).map((o) => o.titulo).join(' · ')) + '</p></div>');
  }
  return t.join('');
}

function refrescarSiInicio() {
  const h = location.hash || '#inicio';
  if (h === '#inicio' || h === '#') pintar();
}

// Revisión automática al abrir la app (si ha pasado tiempo)
function revisionAutomatica() {
  if (revisando || !E.ajustes.apiKey || !Nav.disponible() || Nav.ocupado) return;
  if (!sitiosRevisables().length) return;
  if (Date.now() - (E.ultimaRevision || 0) < HORAS_ENTRE_REVISIONES * 3600000) return;
  revisarTodo(false);
}

window.alVolver = () => setTimeout(revisionAutomatica, 1500);

// ---------- Acciones de los botones (data-accion="accion:dato") ----------

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el) return;
  const valor = el.dataset.accion;
  const i = valor.indexOf(':');
  const accion = i < 0 ? valor : valor.slice(0, i);
  const dato = i < 0 ? '' : valor.slice(i + 1);
  switch (accion) {
    case 'revisar': revisarTodo(true); break;
    case 'entrar': entrarEnSitio(dato); break;
    case 'ver': verWeb(dato); break;
    case 'ensenar-labora': ensenarLabora(); break;
    case 'revisar-labora': revisarUno('labora'); break;
    case 'proponer': proponerEmpresas(); break;
    case 'anadir-empresa': anadirEmpresa(); break;
    case 'quitar-sitio': preguntar('¿Quitar esta web de tu lista?', 'Sí, quitar', () => {
      E.sitios = E.sitios.filter((s) => s.id !== dato); guardar(); pEmpresas();
    }); break;
    case 'presentarme': presentarme(dato); break;
    case 'descartar': {
      const o = E.ofertas.find((x) => x.id === dato);
      if (o) { o.estado = 'descartada'; guardar(); pintar(); }
      break;
    }
    case 'borrar-cand': preguntar('¿Borrar esta candidatura y su historial?', 'Sí, borrar', () => {
      E.candidaturas = E.candidaturas.filter((c) => c.id !== dato); guardar(); ir('candidaturas');
    }); break;
    default: break;
  }
});
