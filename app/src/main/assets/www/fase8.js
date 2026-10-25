'use strict';
// Envío directo de candidaturas: la app manda el CV adecuado ella sola
// (por correo con el PDF adjunto, o rellenando y enviando el formulario de la web)
// y avisa al usuario de cada envío. Si algo lo impide (acceso, captcha, dato que falta),
// la deja «Pendiente de ti» con el motivo.

const MAX_ENVIOS_DIA = 15;
const envioDirecto = () => E.ajustes.envioDirecto !== false;

function enviosHoy() {
  const hoy = new Date().toISOString().slice(0, 10);
  if (!E.envios || E.envios.dia !== hoy) E.envios = { dia: hoy, n: 0 };
  return E.envios;
}

function nombrePdf(cv) {
  if (cv.original && cv.nombreArchivo) return cv.nombreArchivo;
  const n = (cv.contenido.contacto && cv.contenido.contacto.nombre) || 'CV';
  return ('CV ' + n + ' - ' + cv.titulo).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80) + '.pdf';
}

// Elige el CV que mejor encaja con una empresa u oferta (por palabras en común)
function mejorCv(texto) {
  const t = String(texto || '').toLowerCase();
  let mejor = E.cvs[0], puntos = -1;
  E.cvs.forEach((cv) => {
    const p = (cv.titulo + ' ' + (cv.contenido.titulo_profesional || '')).toLowerCase().split(/[^a-záéíóúñü]+/).filter((x) => x.length > 3)
      .reduce((n, palabra) => n + (t.includes(palabra) ? 1 : 0), 0);
    if (p > puntos) { puntos = p; mejor = cv; }
  });
  return mejor;
}

// ---------- Envío por correo ----------

function textoCorreoCandidatura(c, cv) {
  const k = cv.contenido.contacto || {};
  const espontanea = c.tipo === 'espontanea';
  return 'Estimado equipo de selección' + (c.empresa ? ' de ' + c.empresa : '') + ':\n\n' +
    (espontanea
      ? 'Me pongo en contacto con ustedes para presentar mi candidatura por si tienen o tendrán vacantes que encajen con mi perfil.'
      : 'Les escribo para presentar mi candidatura a la oferta de «' + c.titulo + '».') + '\n\n' +
    (cv.contenido.resumen ? cv.contenido.resumen + '\n\n' : '') +
    'Adjunto mi currículum. Quedo a su disposición para ampliar cualquier información o concertar una entrevista.\n\n' +
    'Un saludo,\n' + (k.nombre || '') + (k.telefono ? '\nTel.: ' + k.telefono : '') + (k.email ? '\n' + k.email : '') + '\n';
}

async function enviarPorCorreo(c, email, cv) {
  if (!(E.correo && E.correo.conectado) || !(window.Android && window.Android.correoConAdjunto)) return false;
  const asunto = (c.tipo === 'espontanea' ? 'Candidatura espontánea' : 'Candidatura: ' + c.titulo) + ' — ' + ((cv.contenido.contacto || {}).nombre || '');
  const pdf = pdfDeCv(cv);
  const r = await new Promise((ok) => {
    const id = 'adj' + Date.now();
    const anterior = window.correoResultado;
    window.correoResultado = (rid, json) => {
      if (rid !== id) { if (anterior) anterior(rid, json); return; }
      window.correoResultado = anterior;
      try { ok(JSON.parse(json)); } catch (e) { ok({ ok: false }); }
    };
    window.Android.correoConAdjunto(id, JSON.stringify(cfgCorreo()), email, asunto, textoCorreoCandidatura(c, cv), pdf, nombrePdf(cv));
    setTimeout(() => ok({ ok: false, error: 'tiempo agotado' }), 60000);
  });
  if (r.ok) {
    marcarEnviadaAuto(c, 'por correo a ' + email, cv);
    return true;
  }
  hist(c, 'No se pudo enviar por correo: ' + (r.error || 'error'));
  return false;
}

// ---------- Envío en la web ----------

function jsAdjuntar(b64, nombre) {
  return `(function(b64, nombre){
  var bin = atob(b64), arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  var f = new File([arr], nombre, { type: 'application/pdf' });
  var todos = [].slice.call(document.querySelectorAll('input[type=file]')).filter(function(inp){
    var acc = (inp.accept || '').toLowerCase();
    return !acc || acc.indexOf('pdf') >= 0 || acc.indexOf('*') >= 0 || acc.indexOf('application') >= 0;
  });
  var cv = todos.filter(function(inp){
    var t = ((inp.name||'') + ' ' + (inp.id||'') + ' ' + ((inp.closest('div,li,td,label,fieldset')||{}).textContent||'')).toLowerCase();
    return /cv|curr[ií]cul|resume|archivo|documento|adjunt/.test(t) && !/foto|imagen|photo/.test(t);
  });
  var destino = cv.length ? cv : todos.slice(0, 1);
  var n = 0;
  destino.forEach(function(inp){
    try {
      var dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      n++;
    } catch (e) {}
  });
  return JSON.stringify({ adjuntados: n, campos: todos.length });
})(${JSON.stringify(b64)}, ${JSON.stringify(nombre)})`;
}

// Pulsa el botón para llegar al formulario («Inscribirme», «Aplicar»…) o para enviarlo («Enviar»…)
function jsPulsar(tipo) {
  const patron = tipo === 'enviar'
    ? 'enviar|inscrib|aplicar|apply|submit|finalizar|confirmar|postular|enviar candidatura|enviar solicitud|send'
    : 'inscrib|aplicar|apply|me interesa|quiero|env[ií]a tu cv|enviar cv|presentar candidatura|candidatar|postular|solicitar';
  return `(function(){
  function vis(e){ try{ var r=e.getBoundingClientRect(), s=getComputedStyle(e); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; }catch(x){ return false; } }
  var bueno = new RegExp(${JSON.stringify(patron)}, 'i');
  var malo = /cancel|volver|borrar|buscar|filtr|iniciar sesi|login|acceder|registr|cookie|aceptar todas|rechazar|suscrib|newsletter|compartir|share/i;
  var cands = [].slice.call(document.querySelectorAll('button, input[type=submit], input[type=button], a, [role=button]')).filter(vis).filter(function(b){
    var t = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
    return t && t.length < 60 && bueno.test(t) && !malo.test(t);
  });
  ${tipo === 'enviar' ? "cands.sort(function(a,b){ return (b.type==='submit') - (a.type==='submit'); });" : ''}
  if (!cands.length) return JSON.stringify({ pulsado: '' });
  var b = cands[0];
  try { b.scrollIntoView({ block: 'center' }); } catch (e) {}
  b.click();
  return JSON.stringify({ pulsado: (b.innerText || b.value || '').trim().slice(0, 40) });
})()`;
}

const EXITO = /gracias por (tu|su) (candidatura|inter[eé]s|solicitud)|hemos recibido|candidatura (ha sido )?(enviada|registrada|recibida)|solicitud (ha sido )?(enviada|registrada|recibida)|te has inscrito|inscripci[oó]n (realizada|completada)|thank you for (applying|your application)|application (has been )?(submitted|received)|enviad[ao] correctamente|correctamente/i;
const ERRORES_FORM = /campo (es )?obligatorio|this field is required|es obligatorio|revisa los campos|formato no v[aá]lido|invalid/i;

// Intenta presentarse sola en la web. Devuelve true si la envió.
async function enviarEnWeb(c, o, cv) {
  await Nav.abrir(c.url);
  let a = await Nav.analizar();
  if (a.obstaculo) { pausar(c, motivoAcceso(a.obstaculo, c)); return 'acceso'; }
  hist(c, 'La app abrió la web de la oferta');
  const pdf = pdfDeCv(cv);
  for (let paso = 0; paso < 6; paso++) {
    let campos = (await Nav.ejecutarJson(JS_FORMULARIO)) || [];
    if (!campos.filter((f) => f.tipo !== 'file').length) {
      const p = await Nav.ejecutarJson(jsPulsar('aplicar'));
      if (!p || !p.pulsado) { pausar(c, 'No encontré el formulario para inscribirte'); return 'manual'; }
      hist(c, 'Pulsó «' + p.pulsado + '»');
      await Nav.esperarCarga();
      a = await Nav.analizar();
      if (a.obstaculo) { pausar(c, motivoAcceso(a.obstaculo, c)); return 'acceso'; }
      continue;
    }
    // Rellenar
    const local = rellenarLocal(campos);
    let m = { valores: [], pendientes: [] };
    if (local.resto.length) m = await iaJson([{ type: 'text', text: promptRellenar(local.resto, cv, o) }], 8000);
    const r = await Nav.ejecutarJson(jsRellenar(local.valores.concat(lleno(m.valores))));
    hist(c, 'Rellenó ' + (r ? r.rellenados : 0) + ' campos');
    if (campos.some((f) => f.tipo === 'file')) {
      const adj = await Nav.ejecutarJson(jsAdjuntar(pdf, nombrePdf(cv)));
      if (adj && adj.adjuntados) hist(c, 'Adjuntó el CV «' + cv.titulo + '»');
    }
    const falta = lleno(m.pendientes).filter((x) => !/privacidad|condiciones|t[eé]rminos|legal|rgpd|acepto/i.test(x));
    if (falta.length) { pausar(c, 'Faltan datos que no tengo: ' + falta.slice(0, 4).join(', ')); return 'manual'; }
    // Condiciones de privacidad obligatorias: se aceptan solo las marcadas como obligatorias para poder enviar
    await Nav.ejecutar(`(function(){ [].slice.call(document.querySelectorAll('input[type=checkbox][required]')).forEach(function(x){ var t=((x.closest('label,div,li')||{}).textContent||'').toLowerCase(); if(!x.checked && /privacidad|condiciones|t[eé]rminos|legal|rgpd|acepto/.test(t) && !/publicidad|comercial|newsletter/.test(t)) x.click(); }); return 1; })()`);
    // Enviar
    const e = await Nav.ejecutarJson(jsPulsar('enviar'));
    if (!e || !e.pulsado) { pausar(c, 'Formulario rellenado, pero no encontré el botón de enviar'); return 'manual'; }
    hist(c, 'Pulsó «' + e.pulsado + '»');
    await Nav.esperarCarga();
    a = await Nav.analizar();
    if (EXITO.test(a.texto || '')) { marcarEnviadaAuto(c, 'en la web de ' + (c.empresa || c.fuente || 'la empresa'), cv); return 'enviada'; }
    if (a.obstaculo) { pausar(c, motivoAcceso(a.obstaculo, c)); return 'acceso'; }
    if (ERRORES_FORM.test(a.texto || '')) { pausar(c, 'La web marcó algún dato como incorrecto o incompleto'); return 'manual'; }
    // Puede ser el siguiente paso de un formulario largo: se repite
  }
  pausar(c, 'No pude confirmar que se enviara: revísalo');
  return 'manual';
}

function motivoAcceso(tipo, c) {
  const web = c.fuente || c.empresa || 'la web';
  return {
    registro: 'Hay que crear una cuenta de candidato en ' + web + ' (usuario y contraseña). Pulsa «Hacerlo ahora», créala y yo sigo con la inscripción',
    login: 'Hay que iniciar sesión en ' + web + ' (o crear la cuenta si no la tienes). Pulsa «Hacerlo ahora», entra y yo sigo',
    clave: 'Hay que identificarse con Cl@ve o certificado en ' + web + '. Pulsa «Hacerlo ahora» y yo sigo',
    captcha: web + ' pide una verificación «no soy un robot». Pulsa «Hacerlo ahora», resuélvela y yo sigo',
    codigo: web + ' pide un código enviado por SMS o correo. Pulsa «Hacerlo ahora», escríbelo y yo sigo'
  }[tipo] || 'Hace falta un paso tuyo en ' + web;
}

function marcarEnviadaAuto(c, como, cv) {
  c.estado = 'enviada';
  c.enviada = Date.now();
  c.siguiente = '';
  c.automatica = true;
  hist(c, 'Enviada automáticamente ' + como + ' con el CV «' + cv.titulo + '»');
  enviosHoy().n++;
  guardar();
  notificarUsuario('He enviado tu CV' + (c.empresa ? ' a ' + c.empresa : ''),
    (c.tipo === 'espontanea' ? 'Candidatura espontánea' : c.titulo) + ' — ' + como + '. CV: «' + cv.titulo + '». Te avisaré cuando respondan.');
}

// ---------- Candidaturas espontáneas a empresas sin ofertas que encajen ----------

function prepararEspontaneas() {
  const nuevas = [];
  if (!E.cvs.length) return nuevas;
  E.sitios.filter((s) => ['auto', 'empresa', 'manual'].includes(s.origen) && (s.email || s.espontanea) && !s.espontaneaHecha).forEach((s) => {
    const tieneOferta = E.ofertas.some((o) => o.sitio === s.id && o.estado === 'candidatura');
    if (tieneOferta) return;
    const cv = mejorCv(s.nombre + ' ' + (s.motivo || ''));
    const o = { id: nuevoId('of'), clave: 'espontanea|' + s.id, sitio: s.id, fuente: s.nombre, titulo: 'Candidatura espontánea', empresa: s.nombre,
      url: s.espontanea || '', email: s.email || '', estado: 'candidatura', espontanea: true, visto: Date.now(), nota: null, cv: cv.id };
    E.ofertas.push(o);
    const c = { id: nuevoId('ca'), oferta: o.id, tipo: 'espontanea', titulo: 'Candidatura espontánea', empresa: s.nombre, fuente: s.nombre,
      url: o.url, cv: cv.id, estado: 'lista', historial: [], siguiente: 'Lista para enviar.' };
    hist(c, 'Preparada: ' + s.nombre + ' encaja con tu perfil (' + (s.motivo || 'empresa de tu lista') + ')');
    E.candidaturas.unshift(c);
    s.espontaneaHecha = true;
    nuevas.push(c);
  });
  if (nuevas.length) guardar();
  return nuevas;
}

// ---------- Envío automático de todo lo que está listo ----------

let enviando = false;

async function enviarListas(deUsuario) {
  if (enviando || !envioDirecto()) return { enviadas: 0, pendientes: 0 };
  enviando = true;
  let enviadas = 0, pendientes = 0;
  try {
    const lista = E.candidaturas.filter((c) => c.estado === 'lista');
    for (let k = 0; k < lista.length; k++) {
      if (enviosHoy().n >= MAX_ENVIOS_DIA) break;
      const c = lista[k];
      const o = E.ofertas.find((x) => x.id === c.oferta) || {};
      const cv = E.cvs.find((x) => x.id === c.cv) || mejorCv(c.titulo + ' ' + (c.empresa || ''));
      if (!cv) break;
      if (deUsuario) cargando('Enviando candidaturas:\n' + (c.empresa || c.titulo), k + 1, lista.length);
      else Trabajo.mostrar('Enviando tu CV a ' + (c.empresa || c.titulo), k + 1, lista.length);
      let ok = false;
      const email = o.email || (E.sitios.find((s) => s.id === o.sitio) || {}).email;
      if (email && E.correo && E.correo.conectado) ok = await enviarPorCorreo(c, email, cv);
      if (!ok && c.url && Nav.disponible()) {
        try { ok = (await Nav.cola(() => enviarEnWeb(c, o, cv))) === 'enviada'; }
        catch (err) { if (err.message === 'SIN_CLAVE') throw err; pausar(c, 'Se interrumpió: ' + err.message); }
      } else if (!ok && !c.url) {
        pausar(c, 'No hay web ni correo para enviarla');
      }
      if (ok) enviadas++; else pendientes++;
      guardar();
    }
  } finally {
    enviando = false;
    if (!deUsuario) Trabajo.ocultar();
    Nav.ocultar();
  }
  if (pendientes) {
    const motivos = E.candidaturas.filter((c) => c.estado === 'pendiente_ti').slice(0, 3).map((c) => '• ' + (c.siguiente || '').split('.')[0]);
    notificarUsuario(pendientes === 1 ? 'Una candidatura necesita un paso tuyo' : pendientes + ' candidaturas necesitan un paso tuyo',
      motivos.join('\n') + '\nAbre la app: en el inicio tienes el botón «Hacerlo ahora».');
  }
  return { enviadas, pendientes };
}

function htmlEnvioDirecto() {
  return '<label class="campo" for="envio-directo">Envío de candidaturas</label>' +
    '<select id="envio-directo">' +
    '<option value="si"' + (envioDirecto() ? ' selected' : '') + '>La app las envía sola y me avisa</option>' +
    '<option value="no"' + (!envioDirecto() ? ' selected' : '') + '>Quiero revisarlas y enviarlas yo</option>' +
    '</select><p class="suave">Máximo ' + MAX_ENVIOS_DIA + ' envíos al día. Si una web pide entrar, una verificación o un dato que no tengo, te la dejo pendiente.</p>';
}

document.addEventListener('change', (ev) => {
  if (ev.target && ev.target.id === 'envio-directo') { E.ajustes.envioDirecto = ev.target.value === 'si'; guardar(); }
});
