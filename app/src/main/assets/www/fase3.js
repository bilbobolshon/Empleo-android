'use strict';
// Bienvenida (idioma, correo, avisos, ámbito geográfico) y envío de avisos por correo.

const CORREO_POR_DEFECTO = 'bilbobolshon@gmail.com';
const IDIOMAS = ['Castellano', 'Valencià', 'Català', 'English', 'Français', 'Deutsch', 'Italiano', 'Português', 'Euskara', 'Galego'];
const AMBITOS = [
  { id: 'local', titulo: 'Local', texto: (c) => (c || 'Tu localidad') + ' y alrededores' },
  { id: 'regional', titulo: 'Provincia y comunidad', texto: () => 'Tu provincia y tu comunidad autónoma' },
  { id: 'nacional', titulo: 'Nacional', texto: () => 'Toda España' },
  { id: 'internacional', titulo: 'Internacional', texto: () => 'Otros países' }
];
const PASOS = ['idioma', 'correo', 'avisos', 'ambito'];

const idioma = () => E.ajustes.idioma || 'Castellano';
const ciudad = () => E.ubicacion || (E.perfil && E.perfil.localidad) || '';

function ambitoTexto() {
  const a = E.ambito || { local: true, regional: true, nacional: true };
  const elegidos = AMBITOS.filter((x) => a[x.id]).map((x) => x.titulo + ' (' + x.texto(ciudad()) + ')');
  return elegidos.length ? elegidos.join(', ') : 'cualquier ámbito';
}

// ---------- Correo (lo hace la parte Android) ----------

const Correo = (() => {
  const esperas = {};
  let n = 0;
  window.correoResultado = (id, json) => {
    const f = esperas[id];
    delete esperas[id];
    let r = { ok: false, error: 'sin respuesta' };
    try { r = JSON.parse(json); } catch (e) { /* respuesta rara */ }
    if (f) f(r);
  };
  const disponible = () => !!(window.Android && window.Android.correo);
  function llamar(accion, cfg, para, asunto, cuerpo) {
    if (!disponible()) return Promise.resolve({ ok: false, error: 'Solo funciona dentro de la app del móvil.' });
    return new Promise((ok) => {
      const id = 'c' + (++n);
      esperas[id] = ok;
      setTimeout(() => { if (esperas[id]) { delete esperas[id]; ok({ ok: false, error: 'tiempo agotado' }); } }, 60000);
      window.Android.correo(id, accion, JSON.stringify(cfg), para || '', asunto || '', cuerpo || '');
    });
  }
  return { disponible, llamar };
})();

function servidores(dir) {
  const d = (dir.split('@')[1] || '').toLowerCase();
  if (/gmail\.com|googlemail\.com/.test(d)) return { imap: 'imap.gmail.com', smtp: 'smtp.gmail.com', tipo: 'gmail' };
  if (/yahoo\./.test(d)) return { imap: 'imap.mail.yahoo.com', smtp: 'smtp.mail.yahoo.com', tipo: 'yahoo' };
  if (/icloud\.com|me\.com/.test(d)) return { imap: 'imap.mail.me.com', smtp: 'smtp.mail.me.com', tipo: 'icloud' };
  return { imap: 'imap.' + d, smtp: 'smtp.' + d, tipo: 'otro' };
}

function cfgCorreo() {
  const c = E.correo || {};
  return { usuario: c.direccion, clave: c.clave, imap: c.imap, smtp: c.smtp };
}

function errorCorreo(r) {
  if (/auth|credential|password|Invalid credentials|AUTHENTICATE/i.test(r.error || '')) {
    return 'El correo no acepta esa contraseña. Recuerda que no es tu contraseña normal: es la «contraseña de aplicación» de 16 letras.';
  }
  if (/Unknown ?Host|resolve|connect|timeout|tiempo/i.test(r.error || '')) {
    return 'No he podido conectar con el servidor de correo. Comprueba que tienes internet.';
  }
  return 'No he podido conectar con tu correo.\n(' + (r.error || 'error desconocido') + ')';
}

// Avisos: al móvil, al correo o a ambos (los de correo se agrupan en un solo mensaje)
let colaCorreo = [];
let temporizadorCorreo = null;

function notificarUsuario(titulo, texto) {
  const modo = E.ajustes.avisos || 'ambos';
  if (modo !== 'correo' && nativo && nativo.notificar) nativo.notificar(titulo, texto);
  if (modo !== 'movil' && E.correo && E.correo.conectado) {
    colaCorreo.push('■ ' + titulo + '\n' + texto);
    clearTimeout(temporizadorCorreo);
    temporizadorCorreo = setTimeout(enviarCorreoAvisos, 4000);
  }
}

async function enviarCorreoAvisos() {
  if (!colaCorreo.length) return;
  const lineas = colaCorreo;
  colaCorreo = [];
  const asunto = lineas.length === 1 ? 'Mi Empleo: ' + lineas[0].split('\n')[0].slice(2) : 'Mi Empleo: ' + lineas.length + ' novedades';
  const cuerpo = 'Hola' + (nombreCorto() ? ' ' + nombreCorto() : '') + ',\n\nNovedades de tu búsqueda de empleo:\n\n' +
    lineas.join('\n\n') + '\n\nAbre la app Mi Empleo para ver los detalles y el siguiente paso.\n';
  const r = await Correo.llamar('enviar', cfgCorreo(), E.correo.avisosA || E.correo.direccion, asunto, cuerpo);
  if (!r.ok && nativo) nativo.aviso('No se pudo enviar el aviso por correo');
}

// ---------- Pantallas de bienvenida / configuración ----------

function pPaso(arg) {
  const partes = String(arg || 'idioma').split('-');
  const paso = PASOS.includes(partes[0]) ? partes[0] : 'idioma';
  const editar = partes[1] === 'editar';
  const num = PASOS.indexOf(paso);
  const terminar = () => {
    if (editar) { ir('ajustes'); return; }
    if (num < PASOS.length - 1) { ir('paso/' + PASOS[num + 1]); return; }
    E.bienvenida = true;
    guardar();
    mensaje('¡Todo listo! Ahora conecta la IA y sube tu CV.', [{ texto: 'Continuar', accion: () => ir(E.ajustes.apiKey ? 'inicio' : 'ajustes') }]);
  };
  const cabecera = editar ? '' :
    '<p class="suave">Paso ' + (num + 1) + ' de ' + PASOS.length + '</p>' +
    '<div class="progreso"><div style="width:' + Math.round(((num + 1) / PASOS.length) * 100) + '%"></div></div>';
  ({ idioma: pasoIdioma, correo: pasoCorreo, avisos: pasoAvisos, ambito: pasoAmbito })[paso](cabecera, terminar, editar);
}

function pasoIdioma(cabecera, terminar, editar) {
  pantalla(editar ? 'Idioma' : 'Bienvenida',
    cabecera +
    (editar ? '' : '<h2>Hola, soy tu asistente de empleo</h2>') +
    '<p class="pregunta">¿En qué idioma quieres que trabajemos?</p>' +
    '<p class="suave">Es el idioma de las preguntas, tus CV, las cartas y las explicaciones que te dé.</p>' +
    IDIOMAS.map((x) => '<button class="opcion' + (x === idioma() ? ' marcada' : '') + '" data-idioma="' + esc(x) + '">' + esc(x) + '</button>').join('') +
    '<button class="boton" id="seguir">' + (editar ? 'Guardar' : 'Siguiente') + '</button>');
  document.querySelectorAll('[data-idioma]').forEach((b) => {
    b.onclick = () => { document.querySelectorAll('[data-idioma]').forEach((x) => x.classList.remove('marcada')); b.classList.add('marcada'); };
  });
  $('#seguir').onclick = () => {
    const m = document.querySelector('[data-idioma].marcada');
    E.ajustes.idioma = m ? m.dataset.idioma : 'Castellano';
    guardar();
    terminar();
  };
}

function pasoCorreo(cabecera, terminar, editar) {
  const c = E.correo || {};
  const dir = c.direccion || CORREO_POR_DEFECTO;
  pantalla(editar ? 'Correo' : 'Bienvenida',
    cabecera +
    '<p class="pregunta">¿Qué correo usamos?</p>' +
    '<p class="suave">Lo usaré para avisarte de novedades y, más adelante, para leer las ofertas y las respuestas de empresas que te lleguen.</p>' +
    (c.conectado ? '<div class="tarjeta bien"><div class="etiqueta">Conectado</div><p>' + esc(c.direccion) + '</p></div>' : '') +
    '<label class="campo" for="correo-dir">Tu correo</label>' +
    '<input type="text" id="correo-dir" inputmode="email" autocomplete="off" value="' + esc(dir) + '">' +
    '<div class="tarjeta"><h3>Dame acceso a tu correo</h3>' +
    '<p class="suave">Por seguridad no uses tu contraseña normal. En Gmail se crea una «contraseña de aplicación», solo para esta app:</p>' +
    '<ol class="pasos suave">' +
      '<li>Tu cuenta de Google debe tener activada la <b>verificación en dos pasos</b>.</li>' +
      '<li>Pulsa el botón de abajo para abrir la página de contraseñas de aplicación.</li>' +
      '<li>Escribe como nombre <b>Mi Empleo</b> y pulsa <b>Crear</b>.</li>' +
      '<li>Copia las 16 letras que aparecen y pégalas aquí.</li>' +
    '</ol>' +
    '<button class="boton secundario" id="abrir-google">Abrir contraseñas de aplicación</button>' +
    '<label class="campo" for="correo-clave">Contraseña de aplicación</label>' +
    '<input type="password" id="correo-clave" autocomplete="off" placeholder="xxxx xxxx xxxx xxxx" value="' + esc(c.clave || '') + '">' +
    '</div>' +
    '<button class="boton" id="conectar">Conectar y enviarme un correo de prueba</button>' +
    '<button class="boton texto" id="luego">' + (editar ? 'Volver' : 'Hacerlo más tarde') + '</button>');

  $('#abrir-google').onclick = () => abrirEnlace('https://myaccount.google.com/apppasswords');
  $('#luego').onclick = () => {
    const d = $('#correo-dir').value.trim();
    if (d && !(E.correo && E.correo.conectado)) { E.correo = Object.assign({}, E.correo, { direccion: d }); guardar(); }
    terminar();
  };
  $('#conectar').onclick = async () => {
    const d = $('#correo-dir').value.trim();
    const clave = $('#correo-clave').value.replace(/\s+/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d)) { mensaje('Escribe un correo válido.'); return; }
    if (!clave) { mensaje('Pega la contraseña de aplicación.'); return; }
    const s = servidores(d);
    E.correo = Object.assign({}, E.correo, { direccion: d, clave, imap: s.imap, smtp: s.smtp, conectado: false, avisosA: d });
    guardar();
    cargando('Conectando con tu correo…');
    let r = await Correo.llamar('probar', cfgCorreo());
    if (r.ok) {
      cargando('Enviándote un correo de prueba…');
      r = await Correo.llamar('enviar', cfgCorreo(), d, 'Mi Empleo está conectado',
        'Hola,\n\nTu correo ya está conectado con Mi Empleo. A partir de ahora te avisaré aquí de las novedades de tu búsqueda de empleo.\n');
    }
    quitarCarga();
    if (r.ok) {
      E.correo.conectado = true;
      E.correo.desde = Date.now();
      guardar();
      mensaje('¡Conectado! Te he enviado un correo de prueba a ' + d + '.', [{ texto: 'Continuar', accion: terminar }]);
    } else {
      mensaje(errorCorreo(r));
    }
  };
}

function pasoAvisos(cabecera, terminar, editar) {
  const actual = E.ajustes.avisos || 'ambos';
  const conectado = E.correo && E.correo.conectado;
  const ops = [
    { id: 'ambos', t: 'Al móvil y al correo' },
    { id: 'movil', t: 'Solo al móvil' },
    { id: 'correo', t: 'Solo al correo' }
  ];
  pantalla(editar ? 'Avisos' : 'Bienvenida',
    cabecera +
    '<p class="pregunta">¿Dónde quieres recibir los avisos?</p>' +
    '<p class="suave">Ofertas que encajan contigo, webs donde tienes que entrar, cambios en tus cursos, candidaturas enviadas y respuestas de empresas.</p>' +
    ops.map((o) => '<button class="opcion' + (o.id === actual ? ' marcada' : '') + '" data-aviso="' + o.id + '">' + o.t + '</button>').join('') +
    (conectado ? '<label class="campo" for="aviso-a">Correo donde recibir los avisos</label><input type="text" id="aviso-a" inputmode="email" value="' + esc(E.correo.avisosA || E.correo.direccion) + '">'
      : '<p class="suave">Para recibirlos en el correo, conecta antes tu correo (paso anterior). Mientras tanto te llegarán al móvil.</p>') +
    '<button class="boton" id="seguir">' + (editar ? 'Guardar' : 'Siguiente') + '</button>');
  document.querySelectorAll('[data-aviso]').forEach((b) => {
    b.onclick = () => { document.querySelectorAll('[data-aviso]').forEach((x) => x.classList.remove('marcada')); b.classList.add('marcada'); };
  });
  $('#seguir').onclick = () => {
    const m = document.querySelector('[data-aviso].marcada');
    E.ajustes.avisos = m ? m.dataset.aviso : 'ambos';
    const a = $('#aviso-a');
    if (a && a.value.trim()) E.correo.avisosA = a.value.trim();
    guardar();
    terminar();
  };
}

function pasoAmbito(cabecera, terminar, editar) {
  const a = E.ambito || { local: true, regional: true, nacional: true, internacional: false };
  pantalla(editar ? 'Ámbito' : 'Bienvenida',
    cabecera +
    '<p class="pregunta">¿Dónde quieres trabajar?</p>' +
    '<label class="campo" for="ciudad">¿Dónde vives?</label>' +
    '<input type="text" id="ciudad" placeholder="Por ejemplo: Elche" value="' + esc(ciudad()) + '">' +
    '<p class="suave">Según dónde vives, buscaré en empresas de estos ámbitos. Desmarca los que no te interesen.</p>' +
    AMBITOS.map((x) => '<button class="opcion' + (a[x.id] ? ' marcada' : '') + '" data-ambito="' + x.id + '"><b>' + x.titulo + '</b><br><span class="suave" data-sub="' + x.id + '">' + esc(x.texto(ciudad())) + '</span></button>').join('') +
    '<button class="boton" id="seguir">' + (editar ? 'Guardar' : 'Terminar') + '</button>');
  document.querySelectorAll('[data-ambito]').forEach((b) => { b.onclick = () => b.classList.toggle('marcada'); });
  $('#ciudad').oninput = (ev) => {
    const sub = document.querySelector('[data-sub="local"]');
    if (sub) sub.textContent = AMBITOS[0].texto(ev.target.value.trim());
  };
  $('#seguir').onclick = () => {
    const nuevo = {};
    document.querySelectorAll('[data-ambito]').forEach((b) => { nuevo[b.dataset.ambito] = b.classList.contains('marcada'); });
    if (!Object.values(nuevo).some(Boolean)) { mensaje('Marca al menos un ámbito.'); return; }
    E.ambito = nuevo;
    E.ubicacion = $('#ciudad').value.trim();
    guardar();
    terminar();
  };
}

function htmlAjustesBienvenida() {
  const c = E.correo || {};
  return '<div class="tarjeta"><h3>Preferencias</h3>' +
    '<p class="suave">Idioma: <b>' + esc(idioma()) + '</b><br>' +
    'Correo: <b>' + esc(c.direccion || 'sin configurar') + '</b> ' + (c.conectado ? '✅' : '— sin conectar') + '<br>' +
    'Avisos: <b>' + ({ ambos: 'móvil y correo', movil: 'solo móvil', correo: 'solo correo' }[E.ajustes.avisos || 'ambos']) + '</b><br>' +
    'Ámbito: <b>' + esc(ambitoTexto()) + '</b></p>' +
    '<div class="fila"><button class="boton secundario" data-ir="paso/idioma-editar">Idioma</button>' +
    '<button class="boton secundario" data-ir="paso/correo-editar">Correo</button></div>' +
    '<div class="fila"><button class="boton secundario" data-ir="paso/avisos-editar">Avisos</button>' +
    '<button class="boton secundario" data-ir="paso/ambito-editar">Ámbito</button></div></div>';
}
