'use strict';
// Lectura de la bandeja de correo: ofertas, respuestas, entrevistas, teléfonos y siguiente paso.
// La lectura la hace la parte Android cada 30 minutos (también con la app cerrada);
// aquí se preparan sus instrucciones y se incorpora lo que encuentra.

const MINUTOS_CORREO = 30;
let esperandoCorreo = false;
let temporizadorFondo = null;

const TIPOS_CORREO = {
  oferta: { icono: '🔎', t: 'Oferta' },
  respuesta: { icono: '✉️', t: 'Respuesta de empresa' },
  entrevista: { icono: '📅', t: 'Entrevista' },
  rechazo: { icono: '📭', t: 'No seleccionado' },
  curso: { icono: '🎓', t: 'Formación' },
  otro: { icono: '📨', t: 'Correo de empleo' }
};

function baseDominio(url) {
  const h = host(url || '').split('.');
  return h.length >= 2 ? h.slice(-2).join('.') : '';
}

function promptCorreo() {
  const sel = seleccionBusqueda();
  const cands = E.candidaturas.slice(0, 60).map((c) => ({ id: c.id, titulo: c.titulo, empresa: c.empresa, fuente: c.fuente, estado: c.estado }));
  return [
    'Eres el asistente de búsqueda de empleo de ' + ((E.perfil && E.perfil.nombre) || 'el usuario') + '. Vas a revisar los correos nuevos de su bandeja.',
    'Su perfil: ' + resumenPerfil(),
    'Lo que busca: ' + (sel.todo ? 'cualquier puesto acorde a su experiencia' : JSON.stringify({ puestos: sel.puestos, sectores: sel.sectores })) + '. Vive en ' + (ciudad() || 'no indicado') + '; ámbito: ' + ambitoTexto() + '.',
    'Sus candidaturas: ' + JSON.stringify(cands),
    '',
    'Para cada correo decide si tiene que ver con su búsqueda de empleo o su formación.',
    '"tipo": "oferta" (ofertas o alertas de empleo, también avisos de portales con varias ofertas), "respuesta" (una empresa le contesta sobre una candidatura o le pide algo), "entrevista" (le citan o le piden concertar entrevista o llamada), "rechazo" (no ha sido seleccionado), "curso" (formación, LABORA, cursos), "otro".',
    '"relevante": false para publicidad general, boletines, redes sociales y todo lo que no sea empleo o formación.',
    'Extrae: "empresa", "puesto", "telefono" (tal cual aparece), "contacto" (nombre de la persona), "email_contacto", "fecha_entrevista" (en texto), "fecha_iso" (AAAA-MM-DDTHH:MM en hora local, solo si hay fecha y hora concretas), "lugar", "enlaces" útiles (máximo 3) y en "ofertas" las ofertas concretas que aparezcan.',
    '"candidatura_id": el id de su candidatura si el correo se refiere a una de ellas (por empresa o puesto); si no, "".',
    '"resumen": una o dos frases sencillas. "siguiente_paso": qué tiene que hacer ahora, concreto (por ejemplo: "Llama a Laura al 600 000 000 antes del viernes").',
    'Incluye un elemento por cada correo recibido, con su "uid".',
    'Responde ÚNICAMENTE con este JSON:',
    '{"correos":[{"uid":0,"relevante":true,"tipo":"","empresa":"","puesto":"","resumen":"","telefono":"","contacto":"","email_contacto":"","fecha_entrevista":"","fecha_iso":"","lugar":"","enlaces":[""],"ofertas":[{"titulo":"","empresa":"","lugar":"","url":"","resumen":""}],"candidatura_id":"","siguiente_paso":""}]}'
  ].join('\n');
}

// Pasa a la parte Android lo que necesita para revisar el correo sola
function sincronizarFondo() {
  if (!nativo || !nativo.guardarConfigFondo) return;
  const c = E.correo || {};
  const listo = c.conectado && c.clave && iaLista();
  const dominios = Array.from(new Set(E.sitios.map((s) => baseDominio((lleno(s.paginas)[0] || {}).url))
    .concat(E.candidaturas.map((x) => baseDominio(x.url))).filter((d) => d && !/gva\.es$/.test(d))));
  nativo.guardarConfigFondo(JSON.stringify({
    correo: { usuario: c.direccion, clave: c.clave, imap: c.imap, smtp: c.smtp },
    proveedor: proveedorIA(),
    apiKey: claveIA(),
    modelo: modeloIA(),
    sistema: sistema(),
    instrucciones: promptCorreo(),
    avisos: E.ajustes.avisos || 'ambos',
    avisosA: c.avisosA || c.direccion,
    dominios
  }));
  if (listo) nativo.programarCorreo(MINUTOS_CORREO);
  else nativo.cancelarCorreo();
}

function programarSincronizacion() {
  clearTimeout(temporizadorFondo);
  temporizadorFondo = setTimeout(sincronizarFondo, 1500);
}

// Recoge lo que la revisión de fondo ha encontrado
function incorporarCorreos() {
  if (!nativo || !nativo.tomarCorreos) return 0;
  let lista = [];
  try { lista = JSON.parse(nativo.tomarCorreos() || '[]'); } catch (e) { lista = []; }
  if (!lista.length) return 0;
  const nuevas = [];
  let n = 0;
  lista.forEach((x) => { if (incorporarCorreo(x, nuevas)) n++; });
  if (E.correos.length > 200) E.correos = E.correos.slice(0, 200);
  guardar();
  if (nuevas.length && iaLista()) valorar(nuevas).then(() => refrescar()).catch(() => {});
  return n;
}

function incorporarCorreo(x, nuevas) {
  if (!x || E.correos.find((c) => c.uid === x.uid)) return false;
  const reg = Object.assign({ id: nuevoId('co'), visto: false, recibido: x.fecha || Date.now() }, x);
  E.correos.unshift(reg);

  // Ofertas que llegan por correo
  let ofertas = lleno(x.ofertas).filter((o) => o.titulo);
  if (x.tipo === 'oferta' && !ofertas.length && x.puesto) {
    ofertas = [{ titulo: x.puesto, empresa: x.empresa, lugar: x.lugar, url: lleno(x.enlaces)[0] || '', resumen: x.resumen }];
  }
  ofertas.forEach((o) => {
    const clave = ((o.url || '') + '|' + o.titulo).toLowerCase();
    if (E.ofertas.find((y) => y.clave === clave)) return;
    const of = Object.assign({ id: nuevoId('of'), clave, sitio: 'correo', fuente: 'Correo' + (x.empresa ? ' (' + x.empresa + ')' : ''), estado: 'nueva', visto: Date.now(), nota: null }, o);
    E.ofertas.unshift(of);
    nuevas.push(of);
  });

  // Respuestas de empresas: se enlazan con su candidatura (o se crea una si no existía)
  if (['respuesta', 'entrevista', 'rechazo'].includes(x.tipo)) {
    let c = E.candidaturas.find((y) => y.id === x.candidatura_id);
    if (!c && x.empresa) {
      const e = x.empresa.toLowerCase();
      c = E.candidaturas.find((y) => y.empresa && (y.empresa.toLowerCase().includes(e) || e.includes(y.empresa.toLowerCase())));
    }
    if (!c) {
      c = { id: nuevoId('ca'), titulo: x.puesto || 'Candidatura en ' + (x.empresa || 'una empresa'), empresa: x.empresa || '', fuente: 'Correo',
        url: lleno(x.enlaces)[0] || '', estado: 'enviada', historial: [] };
      E.candidaturas.unshift(c);
      hist(c, 'Candidatura detectada en tu correo');
    }
    c.estado = x.tipo === 'entrevista' ? 'entrevista' : x.tipo === 'rechazo' ? 'descartada' : 'respondida';
    c.siguiente = x.siguiente_paso || (x.tipo === 'rechazo' ? 'No hace falta hacer nada más.' : 'Lee su correo y contesta cuanto antes.');
    c.contacto = { telefono: x.telefono || (c.contacto && c.contacto.telefono) || '', nombre: x.contacto || '', email: x.email_contacto || '' };
    if (x.tipo === 'entrevista') c.entrevista = { texto: x.fecha_entrevista || '', iso: x.fecha_iso || '', lugar: x.lugar || '' };
    hist(c, TIPOS_CORREO[x.tipo].t + ' por correo: ' + (x.resumen || x.asunto || ''));
    reg.candidatura = c.id;
  }
  return true;
}

function refrescar() {
  const h = (location.hash || '#inicio').slice(1).split('/')[0];
  if (['inicio', 'correo', 'candidaturas', 'candidatura', 'ofertas'].includes(h)) pintar();
}

// La parte Android avisa al terminar una revisión
window.correoListo = (estadoJson) => {
  let est = {};
  try { est = JSON.parse(estadoJson || '{}'); } catch (e) { est = {}; }
  const n = incorporarCorreos();
  if (esperandoCorreo) {
    esperandoCorreo = false;
    quitarCarga();
    if (est.ok) {
      mensaje('He revisado tu correo.\n\n• Correos nuevos: ' + (est.leidos || 0) + '\n• Con posible relación con empleo: ' + (est.revisados || 0) +
        '\n• Importantes para ti: ' + n, [{ texto: 'Entendido', accion: refrescar }]);
    } else {
      mensaje(errorCorreo({ error: est.error || '' }));
    }
  } else {
    refrescar();
  }
};

window.irA = (ruta) => ir(ruta);

window.alVolver = () => {
  if (incorporarCorreos()) refrescar();
  setTimeout(revisionAutomatica, 1500);
};

function revisarCorreoAhora() {
  if (!(E.correo && E.correo.conectado)) { ir('paso/correo-editar'); return; }
  if (!nativo || !nativo.correoRevisarAhora) { mensaje('La lectura del correo solo funciona dentro de la app del móvil.'); return; }
  sincronizarFondo();
  esperandoCorreo = true;
  cargando('Revisando tu correo…\nLa primera vez miro los últimos 10 días.');
  nativo.correoRevisarAhora();
  setTimeout(() => {
    if (!esperandoCorreo) return;
    esperandoCorreo = false;
    quitarCarga();
    mensaje('La revisión está tardando. Seguirá en segundo plano y te avisaré si encuentro algo.');
  }, 150000);
}

// ---------- Pantalla Correo ----------

function estadoFondo() {
  try { return JSON.parse((nativo && nativo.estadoCorreo && nativo.estadoCorreo()) || '{}'); } catch (e) { return {}; }
}

function botonesContacto(x, candidatura) {
  const b = [];
  if (x.telefono) b.push('<button class="boton" data-accion="llamar:' + esc(x.telefono) + '">📞 Llamar al ' + esc(x.telefono) + '</button>');
  if (x.email) b.push('<button class="boton secundario" data-accion="escribir:' + esc(x.email) + '">✉️ Escribir a ' + esc(x.nombre || x.email) + '</button>');
  if (candidatura && candidatura.entrevista && (candidatura.entrevista.iso || candidatura.entrevista.texto)) {
    b.push('<button class="boton secundario" data-accion="calendario:' + candidatura.id + '">📅 Añadir la entrevista al calendario</button>');
  }
  return b.join('');
}

function pCorreo() {
  const c = E.correo || {};
  const est = estadoFondo();
  const sinAhorro = !nativo || !nativo.sinAhorro || nativo.sinAhorro();
  const lista = E.correos.filter((x) => x.relevante !== false);

  pantalla('Correo',
    (!c.conectado
      ? '<div class="tarjeta urgente pulsable" data-ir="paso/correo-editar"><div class="etiqueta">Pendiente de ti</div><h3>Conecta tu correo →</h3><p class="suave">Así podré leer las ofertas y respuestas que te lleguen.</p></div>'
      : '<div class="tarjeta bien"><div class="etiqueta">Conectado</div><p>' + esc(c.direccion) + '<br><span class="suave">Lo reviso cada ' + MINUTOS_CORREO + ' minutos, también con la app cerrada.' +
        (est.hora ? ' Última revisión: ' + hora(est.hora) + (est.ok === false ? ' (con error)' : '') : '') + '</span></p></div>') +
    (c.conectado && !sinAhorro
      ? '<div class="tarjeta urgente"><div class="etiqueta">Importante</div><h3>Déjame trabajar con la app cerrada</h3>' +
        '<p class="suave">Samsung para las apps para ahorrar batería. Pulsa el botón y elige «Permitir».</p>' +
        '<button class="boton" data-accion="sin-ahorro">Permitir en segundo plano</button></div>' : '') +
    (c.conectado ? '<button class="boton" data-accion="revisar-correo">🔄 Revisar el correo ahora</button>' : '') +
    '<h3>Lo que he encontrado (' + lista.length + ')</h3>' +
    (lista.length ? lista.slice(0, 60).map((x) => {
      const t = TIPOS_CORREO[x.tipo] || TIPOS_CORREO.otro;
      const cand = x.candidatura ? E.candidaturas.find((y) => y.id === x.candidatura) : null;
      return '<div class="tarjeta' + (x.visto ? '' : ' urgente') + '"><span class="estado-c eb">' + t.icono + ' ' + t.t + '</span>' +
        '<h3>' + esc(x.empresa || x.puesto || x.asunto || 'Correo') + '</h3>' +
        '<p class="suave">' + esc([x.puesto && x.empresa ? x.puesto : '', x.recibido ? hora(x.recibido) : ''].filter(Boolean).join(' · ')) + '</p>' +
        (x.resumen ? '<p>' + esc(x.resumen) + '</p>' : '') +
        (x.fecha_entrevista ? '<p><b>Entrevista:</b> ' + esc(x.fecha_entrevista) + (x.lugar ? ' · ' + esc(x.lugar) : '') + '</p>' : '') +
        (x.siguiente_paso ? '<p><b>Siguiente paso:</b> ' + esc(x.siguiente_paso) + '</p>' : '') +
        botonesContacto({ telefono: x.telefono, email: x.email_contacto, nombre: x.contacto }, cand) +
        (lleno(x.enlaces)[0] ? '<button class="boton secundario" data-accion="ver:' + esc(lleno(x.enlaces)[0]) + '">Abrir el enlace</button>' : '') +
        (cand ? '<button class="boton texto" data-ir="candidatura/' + cand.id + '">Ver la candidatura</button>' : '') +
        '</div>';
    }).join('') : '<p class="suave">Todavía no he encontrado correos de empleo.</p>'));

  E.correos.forEach((x) => { x.visto = true; });
  guardar();
}

function urgentesCorreo() {
  const n = E.correos.filter((x) => !x.visto && x.relevante !== false && !x.candidatura).length;
  return n ? '<div class="tarjeta bien pulsable" data-ir="correo"><div class="etiqueta">Novedad</div><h3>' + n +
    (n === 1 ? ' correo de empleo nuevo' : ' correos de empleo nuevos') + ' →</h3><p class="suave">Ofertas o avisos que te han llegado al correo.</p></div>' : '';
}

function htmlContactoCandidatura(c) {
  if (!c.contacto && !c.entrevista) return '';
  const e = c.entrevista;
  return (e && (e.texto || e.iso) ? '<div class="tarjeta bien"><div class="etiqueta">Entrevista</div><p>' + esc(e.texto || e.iso) + (e.lugar ? '<br>' + esc(e.lugar) : '') + '</p></div>' : '') +
    botonesContacto(c.contacto || {}, c);
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el) return;
  const valor = el.dataset.accion;
  const i = valor.indexOf(':');
  const accion = i < 0 ? valor : valor.slice(0, i);
  const dato = i < 0 ? '' : valor.slice(i + 1);
  switch (accion) {
    case 'revisar-correo': revisarCorreoAhora(); break;
    case 'sin-ahorro': if (nativo && nativo.pedirSinAhorro) nativo.pedirSinAhorro(); break;
    case 'llamar': abrirEnlace('tel:' + dato.replace(/[^\d+]/g, '')); break;
    case 'escribir': abrirEnlace('mailto:' + dato); break;
    case 'calendario': {
      const c = E.candidaturas.find((x) => x.id === dato);
      if (!c || !nativo || !nativo.calendario) break;
      const ms = c.entrevista && c.entrevista.iso ? new Date(c.entrevista.iso).getTime() : 0;
      nativo.calendario('Entrevista: ' + (c.titulo || '') + (c.empresa ? ' — ' + c.empresa : ''), isNaN(ms) ? 0 : ms,
        (c.entrevista && c.entrevista.lugar) || '',
        [(c.entrevista && c.entrevista.texto) || '', c.contacto && c.contacto.telefono ? 'Teléfono: ' + c.contacto.telefono : ''].filter(Boolean).join('\n'));
      break;
    }
    default: break;
  }
});
