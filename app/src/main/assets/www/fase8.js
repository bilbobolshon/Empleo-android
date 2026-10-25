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

// ---------- PDF del CV (sin diálogos, dentro de la app) ----------

function cvPdfBase64(contenido) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c = contenido || {};
  const k = c.contacto || {};
  const azul = [31, 95, 173];
  const M = 18, ANCHO = 210 - 2 * M;
  let y = 20;
  const limpiar = (t) => String(t == null ? '' : t).replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ€–—‘’“”•]/g, '');
  const salto = (alto) => { if (y + alto > 282) { doc.addPage(); y = 20; } };
  const texto = (t, tam, estilo, color, sangria) => {
    doc.setFont('helvetica', estilo || 'normal');
    doc.setFontSize(tam);
    doc.setTextColor(...(color || [34, 34, 34]));
    const lineas = doc.splitTextToSize(limpiar(t), ANCHO - (sangria || 0));
    lineas.forEach((l) => { salto(tam * 0.45); doc.text(l, M + (sangria || 0), y); y += tam * 0.42; });
  };
  const seccion = (titulo) => {
    y += 3; salto(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...azul);
    doc.text(titulo.toUpperCase(), M, y);
    y += 1.6; doc.setDrawColor(213, 222, 234); doc.setLineWidth(0.3); doc.line(M, y, M + ANCHO, y); y += 5;
  };
  const vinetas = (lista) => lleno(lista).forEach((x) => {
    salto(5); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(34, 34, 34);
    doc.text('•', M + 1, y); texto(x, 10, 'normal', null, 5);
  });

  texto(k.nombre || '', 20, 'bold', [19, 50, 90]);
  if (c.titulo_profesional) { y += 1; texto(c.titulo_profesional, 12, 'bold', azul); }
  const contacto = [k.telefono, k.email, k.localidad].filter(Boolean).join('   ·   ');
  if (contacto) { y += 1; texto(contacto, 9.5, 'normal', [70, 70, 70]); }
  y += 2; doc.setDrawColor(...azul); doc.setLineWidth(0.8); doc.line(M, y, M + ANCHO, y); y += 4;

  if (c.resumen) { seccion('Perfil'); texto(c.resumen, 10); }
  if (lleno(c.experiencia).length) {
    seccion('Experiencia');
    lleno(c.experiencia).forEach((e) => {
      salto(10);
      texto([e.puesto, e.empresa].filter(Boolean).join(' — '), 10.5, 'bold');
      const sub = [e.lugar, e.fechas].filter(Boolean).join(' · ');
      if (sub) texto(sub, 9, 'normal', [90, 90, 90]);
      vinetas(e.puntos);
      y += 2;
    });
  }
  if (lleno(c.formacion).length) {
    seccion('Formación');
    lleno(c.formacion).forEach((f) => {
      texto([f.titulo, f.centro].filter(Boolean).join(' — '), 10, 'bold');
      if (f.fechas) texto(f.fechas, 9, 'normal', [90, 90, 90]);
      y += 1;
    });
  }
  if (lleno(c.idiomas).length) { seccion('Idiomas'); vinetas(c.idiomas); }
  if (lleno(c.informatica).length) { seccion('Informática'); vinetas(c.informatica); }
  if (lleno(c.competencias).length) { seccion('Competencias'); vinetas(c.competencias); }
  if (lleno(c.otros).length) { seccion('Otros datos'); vinetas(c.otros); }
  return doc.output('datauristring').split(',')[1];
}

function nombrePdf(cv) {
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
  const pdf = cvPdfBase64(cv.contenido);
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
  if (a.obstaculo) { pausar(c, 'Necesita que entres en ' + (c.fuente || c.empresa || 'la web') + ' (' + textoObstaculo(a.obstaculo, '', 0).split('\n')[0].replace('Te toca: ', '') + ')'); return false; }
  hist(c, 'La app abrió la web de la oferta');
  const pdf = cvPdfBase64(cv.contenido);
  for (let paso = 0; paso < 6; paso++) {
    let campos = (await Nav.ejecutarJson(JS_FORMULARIO)) || [];
    if (!campos.filter((f) => f.tipo !== 'file').length) {
      const p = await Nav.ejecutarJson(jsPulsar('aplicar'));
      if (!p || !p.pulsado) { pausar(c, 'No encontré el formulario para inscribirte'); return false; }
      hist(c, 'Pulsó «' + p.pulsado + '»');
      await Nav.esperarCarga();
      a = await Nav.analizar();
      if (a.obstaculo) { pausar(c, 'Necesita que entres en ' + (c.fuente || c.empresa || 'la web') + ' para inscribirte'); return false; }
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
    if (falta.length) { pausar(c, 'Faltan datos que no tengo: ' + falta.slice(0, 4).join(', ')); return false; }
    // Condiciones de privacidad obligatorias: se aceptan solo las marcadas como obligatorias para poder enviar
    await Nav.ejecutar(`(function(){ [].slice.call(document.querySelectorAll('input[type=checkbox][required]')).forEach(function(x){ var t=((x.closest('label,div,li')||{}).textContent||'').toLowerCase(); if(!x.checked && /privacidad|condiciones|t[eé]rminos|legal|rgpd|acepto/.test(t) && !/publicidad|comercial|newsletter/.test(t)) x.click(); }); return 1; })()`);
    // Enviar
    const e = await Nav.ejecutarJson(jsPulsar('enviar'));
    if (!e || !e.pulsado) { pausar(c, 'Formulario rellenado, pero no encontré el botón de enviar'); return false; }
    hist(c, 'Pulsó «' + e.pulsado + '»');
    await Nav.esperarCarga();
    a = await Nav.analizar();
    if (EXITO.test(a.texto || '')) { marcarEnviadaAuto(c, 'en la web de ' + (c.empresa || c.fuente || 'la empresa'), cv); return true; }
    if (a.obstaculo) { pausar(c, 'Al enviar pidió ' + (a.obstaculo === 'captcha' ? 'una verificación («no soy un robot»)' : 'entrar con tus datos')); return false; }
    if (ERRORES_FORM.test(a.texto || '')) { pausar(c, 'La web marcó algún dato como incorrecto o incompleto'); return false; }
    // Puede ser el siguiente paso de un formulario largo: se repite
  }
  pausar(c, 'No pude confirmar que se enviara: revísalo');
  return false;
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
      if (deUsuario) cargando('Enviando candidaturas (' + (k + 1) + ' de ' + lista.length + '):\n' + (c.empresa || c.titulo));
      let ok = false;
      const email = o.email || (E.sitios.find((s) => s.id === o.sitio) || {}).email;
      if (email && E.correo && E.correo.conectado) ok = await enviarPorCorreo(c, email, cv);
      if (!ok && c.url && Nav.disponible()) {
        try { ok = await Nav.cola(() => enviarEnWeb(c, o, cv)); }
        catch (err) { if (err.message === 'SIN_CLAVE') throw err; pausar(c, 'Se interrumpió: ' + err.message); }
      } else if (!ok && !c.url) {
        pausar(c, 'No hay web ni correo para enviarla');
      }
      if (ok) enviadas++; else pendientes++;
      guardar();
    }
  } finally {
    enviando = false;
    Nav.ocultar();
  }
  if (pendientes) {
    notificarUsuario('Candidaturas que necesitan algo de ti', pendientes + (pendientes === 1 ? ' candidatura necesita' : ' candidaturas necesitan') + ' que hagas un paso (entrar, captcha o un dato). Las tienes en el inicio.');
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
