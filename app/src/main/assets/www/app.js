'use strict';
// Mi Empleo — fase 1: importar CV, preguntas y creación de CV adaptados.

const CLAVE = 'miempleo.v1';
const MODELOS = [
  { id: 'claude-haiku-5-5', nombre: 'Rápido y más barato (recomendado)' },
  { id: 'claude-sonnet-5-5', nombre: 'Equilibrado' },
  { id: 'claude-opus-5-5', nombre: 'Máxima calidad (más caro)' }
];
const MODELOS_GEMINI = [
  { id: 'gemini-3.5-flash-lite', nombre: 'Flash-Lite (recomendado, unas 500 consultas gratis al día)' },
  { id: 'gemini-3.6-flash', nombre: 'Flash (mejor, pero muy pocas consultas gratis al día)' }
];

// IA elegida: Gemini (gratis) o Claude (de pago)
const proveedorIA = () => E.ajustes.proveedor || (E.ajustes.apiKey ? 'claude' : 'gemini');
const claveIA = () => (proveedorIA() === 'gemini' ? E.ajustes.claveGemini : E.ajustes.apiKey) || '';
const modeloIA = () => proveedorIA() === 'gemini' ? (E.ajustes.modeloGemini || MODELOS_GEMINI[0].id) : (E.ajustes.modelo || MODELOS[0].id);
const iaLista = () => !!claveIA();

function contarUsoIA() {
  const hoy = new Date().toISOString().slice(0, 10);
  if (!E.usoIA || E.usoIA.dia !== hoy) E.usoIA = { dia: hoy, n: 0 };
  E.usoIA.n++;
}

// ---------- Datos guardados en el móvil ----------

function estadoInicial() {
  return {
    ajustes: { proveedor: 'gemini', apiKey: '', claveGemini: '', modelo: MODELOS[0].id, modeloGemini: MODELOS_GEMINI[0].id },
    fuentes: [],          // nombres de los CV subidos
    perfil: null,         // datos extraídos de los CV
    preguntas: [],
    respuestas: {},
    preferencias: null,
    orientaciones: [],
    cvs: [],              // CV creados
    sitios: [],           // LABORA, empresas y webs vigiladas
    ofertas: [],
    cursos: [],
    candidaturas: [],
    correos: [],
    ultimaRevision: 0
  };
}

function cargar() {
  try {
    const t = localStorage.getItem(CLAVE);
    if (t) {
      const d = JSON.parse(t);
      const e = Object.assign(estadoInicial(), d);
      e.ajustes = Object.assign(estadoInicial().ajustes, d.ajustes || {});
      return e;
    }
  } catch (err) { /* datos dañados: empezamos de cero */ }
  return estadoInicial();
}

let E = cargar();
let pendientes = []; // archivos elegidos y aún sin analizar (solo en memoria)

function guardar() {
  if (typeof programarSincronizacion === 'function') programarSincronizacion();
  try { localStorage.setItem(CLAVE, JSON.stringify(E)); }
  catch (err) { mensaje('No se han podido guardar los datos en el móvil.\n' + err.message); }
}

// ---------- Utilidades de pantalla ----------

const $ = (s) => document.querySelector(s);
const nativo = window.Android || null;

function pantalla(titulo, html, conAtras = true) {
  $('#titulo').textContent = titulo;
  $('#atras').hidden = !conAtras;
  $('#pantalla').innerHTML = html;
  window.scrollTo(0, 0);
}

function cargando(texto) {
  $('#carga-texto').textContent = texto || 'Un momento…';
  $('#carga').hidden = false;
}
function quitarCarga() { $('#carga').hidden = true; }

function mensaje(texto, botones) {
  botones = botones || [{ texto: 'Entendido' }];
  $('#dialogo-texto').textContent = texto;
  const caja = $('#dialogo-botones');
  caja.innerHTML = '';
  botones.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'boton' + (i > 0 ? ' secundario' : '');
    el.textContent = b.texto;
    el.onclick = () => { $('#dialogo').hidden = true; if (b.accion) b.accion(); };
    caja.appendChild(el);
  });
  $('#dialogo').hidden = false;
}

function preguntar(texto, siTexto, accion) {
  mensaje(texto, [{ texto: siTexto, accion }, { texto: 'Cancelar' }]);
}

function fallo(err) {
  quitarCarga();
  if (err && err.message === 'SIN_CLAVE') {
    mensaje('Primero tienes que conectar la IA: pega tu clave en Ajustes.',
      [{ texto: 'Ir a Ajustes', accion: () => ir('ajustes') }, { texto: 'Ahora no' }]);
    return;
  }
  mensaje((err && err.message) || 'Ha ocurrido un error inesperado.');
}

function ir(ruta) {
  if (location.hash === '#' + ruta) pintar();
  else location.hash = '#' + ruta;
}

function abrirEnlace(url) {
  if (nativo) nativo.abrirEnlace(url); else window.open(url, '_blank');
}

function fecha(ms) {
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nombreCorto() {
  const n = E.perfil && E.perfil.nombre;
  return n ? n.trim().split(/\s+/)[0] : '';
}

// ---------- Conexión con la IA (Gemini gratis o Claude de pago) ----------

async function llamadaIA(cuerpo) {
  if (!iaLista()) throw new Error('SIN_CLAVE');
  contarUsoIA();
  return proveedorIA() === 'gemini' ? llamadaGemini(cuerpo) : llamadaClaude(cuerpo);
}

async function llamadaClaude(cuerpo) {
  const datos = Object.assign({ model: modeloIA(), max_tokens: 8000, system: sistema() }, cuerpo);
  delete datos.json;
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': E.ajustes.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(datos)
    });
  } catch (err) {
    throw new Error('No hay conexión con la IA. Comprueba que tienes internet y vuelve a intentarlo.');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (d.error && d.error.message) || '';
    if (r.status === 401) throw new Error('La clave de la IA no es válida. Revísala en Ajustes.');
    if (r.status === 429 || r.status === 529 || r.status === 503) throw new Error('La IA está saturada ahora mismo. Espera un minuto y vuelve a intentarlo.');
    if (/credit|balance/i.test(m)) throw new Error('Tu cuenta de la IA no tiene saldo. Añade crédito en console.anthropic.com o cambia a la IA gratuita en Ajustes.');
    if (/model/i.test(m) && !/tool/i.test(m)) throw new Error('El modelo de IA elegido no está disponible. Cambia el modelo en Ajustes.\n\n(' + m + ')');
    throw new Error('La IA ha devuelto un error (' + r.status + ').\n' + m);
  }
  if (d.stop_reason === 'max_tokens') throw new Error('La respuesta de la IA era demasiado larga y se cortó. Vuelve a intentarlo.');
  return d;
}

// Traduce la petición al formato de Gemini y la respuesta al formato que usa la app
async function llamadaGemini(cuerpo) {
  if (cuerpo.tools) throw new Error('La búsqueda en internet (tool web_search) no está disponible en la IA gratuita.');
  const partes = (bloques) => (typeof bloques === 'string' ? [{ type: 'text', text: bloques }] : bloques).map((b) => {
    if (b.type === 'text') return { text: b.text };
    if (b.type === 'image' || b.type === 'document') return { inline_data: { mime_type: b.source.media_type, data: b.source.data } };
    return { text: '' };
  });
  const datos = {
    systemInstruction: { parts: [{ text: sistema() }] },
    contents: (cuerpo.messages || []).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: partes(m.content) })),
    generationConfig: { maxOutputTokens: Math.max(8192, cuerpo.max_tokens || 0) }
  };
  if (cuerpo.json) datos.generationConfig.responseMimeType = 'application/json';
  let r;
  try {
    r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modeloIA()) + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': E.ajustes.claveGemini },
      body: JSON.stringify(datos)
    });
  } catch (err) {
    throw new Error('No hay conexión con la IA. Comprueba que tienes internet y vuelve a intentarlo.');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (d.error && d.error.message) || '';
    if (r.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(m)) throw new Error('Has llegado al límite gratuito de la IA por hoy. Se renueva cada día (a las 9:00 en España, aproximadamente).');
    if (/API key|API_KEY|permission/i.test(m) || r.status === 401 || r.status === 403) throw new Error('La clave de Gemini no es válida. Revísala en Ajustes.');
    if (r.status === 404 || /not found|model/i.test(m)) throw new Error('El modelo de IA elegido no está disponible. Elige el otro en Ajustes.\n\n(' + m + ')');
    if (r.status === 503 || r.status === 500) throw new Error('La IA está saturada ahora mismo. Espera un minuto y vuelve a intentarlo.');
    throw new Error('La IA ha devuelto un error (' + r.status + ').\n' + m);
  }
  const c = (d.candidates || [])[0] || {};
  if (c.finishReason === 'MAX_TOKENS') throw new Error('La respuesta de la IA era demasiado larga y se cortó. Vuelve a intentarlo.');
  if (c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') throw new Error('La IA no ha querido procesar este contenido.');
  const texto = ((c.content && c.content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  return { content: [{ type: 'text', text: texto }], stop_reason: 'end_turn' };
}

async function ia(contenido, maxTokens, json) {
  const d = await llamadaIA({ max_tokens: maxTokens || 8000, messages: [{ role: 'user', content: contenido }], json: !!json });
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function iaJson(contenido, maxTokens) {
  const t = await ia(contenido, maxTokens, true);
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  try {
    if (a < 0 || b < a) throw new Error();
    return JSON.parse(t.slice(a, b + 1));
  } catch (err) {
    throw new Error('La IA ha respondido de forma incompleta. Vuelve a intentarlo.');
  }
}

// ---------- Lectura de archivos ----------

function leerBase64(file) {
  return new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1]);
    fr.onerror = () => ko(new Error('No se ha podido leer "' + file.name + '".'));
    fr.readAsDataURL(file);
  });
}

async function fotoReducida(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('No se ha podido abrir la foto "' + file.name + '". Prueba con otra foto o con el PDF.'));
      i.src = url;
    });
    const max = 1800;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function tipoArchivo(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name)) return 'foto';
  return null;
}

// ---------- Pantallas ----------

function pInicio() {
  asegurarPortales();
  asegurarEmpresasAuto();
  const n = nombreCorto();
  let urgente = '';
  const sinResponder = E.preguntas.findIndex((p) => !E.respuestas[p.id]);
  if (!iaLista()) {
    urgente = tarjetaUrgente('Para empezar', 'Conecta la IA (gratis)', 'Es lo que lee tus CV y los mejora. Te explico cómo en un minuto.', 'ajustes');
  } else if (!E.perfil) {
    urgente = tarjetaUrgente('Siguiente paso', 'Sube tu CV', 'En PDF o con una foto. Puedes subir varios.', 'subir');
  } else if (!E.preferencias && E.preguntas.length) {
    urgente = tarjetaUrgente('Pendiente de ti', 'Responde unas preguntas',
      'Te quedan ' + E.preguntas.filter((p) => !E.respuestas[p.id]).length + ' de ' + E.preguntas.length + '. Sirven para mejorar tu CV.',
      'preguntas/' + Math.max(0, sinResponder));
  } else if (E.preferencias && !E.cvs.length) {
    urgente = tarjetaUrgente('Siguiente paso', 'Elige qué CV crear', 'Ya tengo propuestas preparadas para ti.', 'orientaciones');
  } else if (!sitiosRevisables().length) {
    urgente = tarjetaUrgente('Siguiente paso', 'Dime dónde buscar', 'Configura LABORA y añade empresas para que busque ofertas por ti.', 'empresas');
  }
  urgente += urgentesDemanda() + urgentesAuto() + urgentesFase2() + urgentesCorreo();
  if (!urgente) {
    urgente = '<div class="tarjeta bien"><div class="etiqueta">Todo al día</div>' +
      '<h3>No tienes nada pendiente</h3><p class="suave">Sigo vigilando tus webs. Te aviso cuando haya algo.</p></div>';
  }
  const libres = E.ofertas.filter((o) => o.estado === 'nueva' && (o.nota || 0) >= umbral()).length;
  const activas = E.candidaturas.filter((c) => c.estado !== 'descartada').length;
  const labora = E.sitios.find((s) => s.id === 'labora');

  pantalla('Mi Empleo',
    '<h2>Hola' + (n ? ', ' + esc(n) : '') + '</h2>' +
    urgente +
    (sitiosRevisables().length ? '<button class="boton secundario" data-accion="revisar">' +
      (revisando ? '⏳ Revisando tus webs…' : '🔄 Buscar ofertas ahora') + '</button>' : '') +
    '<div class="rejilla">' +
      mosaico('🔎', 'Ofertas', libres ? libres + ' para ti' : 'Ver ofertas', 'ofertas') +
      mosaico('📋', 'Candidaturas', activas ? activas + ' en marcha' : 'Ninguna aún', 'candidaturas') +
      mosaico('🏛️', 'LABORA', labora && lleno(labora.paginas).length ? 'Configurado' : 'Configurar', 'labora') +
      mosaico('🏢', 'Empresas', Math.max(0, E.sitios.filter((s) => s.id !== 'labora' && s.origen !== 'portal').length) + ' + portales', 'empresas') +
      mosaico('📄', 'Mis CV', E.cvs.length ? E.cvs.length + ' creados' : 'Ninguno aún', 'miscv') +
      mosaico('🎯', 'Qué busco', E.busqueda && E.busqueda.quitados.length ? 'Afinado' : 'Todo', 'busqueda') +
      mosaico('📤', 'Subir CV', 'PDF o foto', 'subir') +
      mosaico('✉️', 'Correo', E.correo && E.correo.conectado ? (E.correos.filter((x) => !x.visto).length ? E.correos.filter((x) => !x.visto).length + ' nuevos' : 'Conectado') : 'Conectar', 'correo') +
      mosaico('⚙️', 'Ajustes', iaLista() ? 'IA conectada' : 'Falta la IA', 'ajustes') +
    '</div>', false);
}

function tarjetaUrgente(etiqueta, titulo, texto, ruta) {
  return '<div class="tarjeta urgente pulsable" data-ir="' + ruta + '">' +
    '<div class="etiqueta">' + etiqueta + '</div><h3>' + titulo + ' →</h3><p class="suave">' + texto + '</p></div>';
}

function mosaico(icono, titulo, nota, ruta, pronto) {
  return '<div class="mosaico' + (pronto ? ' pronto' : '') + '"' + (ruta ? ' data-ir="' + ruta + '"' : ' data-pronto="1"') + '>' +
    '<span class="icono">' + icono + '</span>' + titulo + '<span class="nota">' + nota + '</span></div>';
}

// --- Ajustes ---

function pAjustes() {
  const prov = proveedorIA();
  const lista = prov === 'gemini' ? MODELOS_GEMINI : MODELOS;
  const actual = modeloIA();
  const opciones = lista.map((m) => '<option value="' + m.id + '"' + (m.id === actual ? ' selected' : '') + '>' + m.nombre + '</option>').join('');
  const hoy = new Date().toISOString().slice(0, 10);
  const usos = E.usoIA && E.usoIA.dia === hoy ? E.usoIA.n : 0;
  const pasos = prov === 'gemini'
    ? '<ol class="pasos suave">' +
        '<li>Pulsa el botón de abajo: se abre Google AI Studio. Entra con tu cuenta de Google.</li>' +
        '<li>Pulsa <b>Create API key</b> (Crear clave de API) y acepta.</li>' +
        '<li>Copia la clave (empieza por <b>AIza</b>) y pégala aquí.</li>' +
      '</ol>' +
      '<p class="suave">Es gratis, con un límite de consultas al día. En el plan gratuito Google puede usar lo que se envía para mejorar sus productos.</p>' +
      '<button class="boton secundario" id="abrir-consola">Conseguir la clave gratis</button>'
    : '<ol class="pasos suave">' +
        '<li>Abre la web de Anthropic con el botón de abajo y crea una cuenta o entra.</li>' +
        '<li>Añade algo de saldo y, si quieres, un límite de gasto mensual.</li>' +
        '<li>Ve a <b>API Keys</b>, pulsa <b>Create Key</b>, copia la clave (empieza por <b>sk-ant-</b>) y pégala aquí.</li>' +
      '</ol>' +
      '<button class="boton secundario" id="abrir-consola">Abrir la web para conseguir la clave</button>';

  pantalla('Ajustes',
    '<div class="tarjeta"><h3>Inteligencia artificial</h3>' +
    '<p class="suave">La IA lee tus CV, te hace preguntas, redacta CV y cartas, valora ofertas y entiende tus correos. La app la usa lo mínimo posible.</p>' +
    '<button class="opcion' + (prov === 'gemini' ? ' marcada' : '') + '" data-prov="gemini"><b>Gemini de Google — gratis</b><br><span class="suave">Recomendada. Con límite diario de consultas.</span></button>' +
    '<button class="opcion' + (prov === 'claude' ? ' marcada' : '') + '" data-prov="claude"><b>Claude — de pago</b><br><span class="suave">Más precisa. Cuesta céntimos por consulta.</span></button>' +
    pasos +
    '<label class="campo" for="clave">Tu clave</label>' +
    '<input type="password" id="clave" placeholder="' + (prov === 'gemini' ? 'AIza…' : 'sk-ant-…') + '" autocomplete="off" value="' + esc(claveIA()) + '">' +
    '<button class="boton texto" id="ver-clave">Mostrar la clave</button>' +
    '<label class="campo" for="modelo">Modelo</label>' +
    '<select id="modelo">' + opciones + '</select>' +
    '<button class="boton" id="guardar-clave">Guardar y comprobar</button>' +
    '<p class="suave centro">Consultas a la IA hoy: ' + usos + '</p></div>' +

    htmlAjustesBienvenida() +
    '<div class="tarjeta"><h3>Tus datos</h3>' +
    '<p class="suave">Todo se guarda solo en este móvil. ' +
    (E.fuentes.length ? 'CV subidos: ' + E.fuentes.map(esc).join(', ') + '.' : 'Aún no has subido ningún CV.') + '</p>' +
    '<button class="boton peligro" id="borrar-todo">Borrar todos mis datos</button></div>' +
    '<p class="suave centro">Versión ' + esc(nativo ? nativo.version() : 'web') + '</p>');

  document.querySelectorAll('[data-prov]').forEach((b) => {
    b.onclick = () => { E.ajustes.proveedor = b.dataset.prov; guardar(); pAjustes(); };
  });
  $('#abrir-consola').onclick = () => abrirEnlace(prov === 'gemini' ? 'https://aistudio.google.com/app/apikey' : 'https://console.anthropic.com/settings/keys');
  $('#ver-clave').onclick = (ev) => {
    const c = $('#clave');
    c.type = c.type === 'password' ? 'text' : 'password';
    ev.target.textContent = c.type === 'password' ? 'Mostrar la clave' : 'Ocultar la clave';
  };
  $('#guardar-clave').onclick = async () => {
    const clave = $('#clave').value.trim();
    if (!clave) { mensaje('Pega primero tu clave.'); return; }
    E.ajustes.proveedor = prov;
    if (prov === 'gemini') { E.ajustes.claveGemini = clave; E.ajustes.modeloGemini = $('#modelo').value; }
    else { E.ajustes.apiKey = clave; E.ajustes.modelo = $('#modelo').value; }
    guardar();
    cargando('Comprobando la conexión con la IA…');
    try {
      await ia([{ type: 'text', text: 'Responde solo con la palabra: listo' }], 300);
      quitarCarga();
      mensaje('¡Conectado! La IA funciona correctamente.', [{ texto: 'Continuar', accion: () => ir('inicio') }]);
    } catch (err) { fallo(err); }
  };
  $('#borrar-todo').onclick = () => preguntar(
    '¿Seguro que quieres borrar todos tus datos? Se perderán tu perfil, las respuestas y los CV creados. La clave de la IA se mantiene.',
    'Sí, borrar todo', () => {
      const ajustes = E.ajustes;
      E = estadoInicial(); E.ajustes = ajustes; guardar(); ir('inicio');
    });
}

// --- Subir CV ---

function pSubir() {
  const lista = pendientes.map((p, i) =>
    '<li><span>' + (p.tipo === 'pdf' ? '📄' : '🖼️') + '</span><span class="nombre">' + esc(p.nombre) + '</span>' +
    '<button class="quitar" data-quitar="' + i + '" aria-label="Quitar">×</button></li>').join('');

  pantalla('Subir CV',
    '<h2>Tus CV actuales</h2>' +
    '<p class="suave">Sube uno o varios CV en PDF, o hazles una foto. La IA los leerá y te hará unas preguntas para completarlos.' +
    (E.perfil ? ' Lo nuevo se combinará con lo que ya tienes.' : '') + '</p>' +
    '<label class="boton secundario" for="elegir">📁  Elegir PDF o foto del móvil</label>' +
    '<input class="archivo-oculto" type="file" id="elegir" accept="application/pdf,image/*" multiple>' +
    '<label class="boton secundario" for="camara">📷  Hacer una foto al CV</label>' +
    '<input class="archivo-oculto" type="file" id="camara" accept="image/*" capture="environment">' +
    (pendientes.length ? '<ul class="lista-archivos">' + lista + '</ul>' : '<p class="suave centro">Todavía no has elegido ningún archivo.</p>') +
    '<p class="suave">Consejo para las fotos: buena luz, el papel entero en la imagen y sin sombras.</p>' +
    '<button class="boton" id="analizar"' + (pendientes.length ? '' : ' disabled') + '>Analizar ' +
    (pendientes.length > 1 ? 'mis ' + pendientes.length + ' CV' : 'mi CV') + '</button>');

  const anadir = (ev) => {
    const malos = [];
    Array.from(ev.target.files || []).forEach((f) => {
      const tipo = tipoArchivo(f);
      if (tipo) pendientes.push({ nombre: f.name || 'Foto', tipo, file: f });
      else malos.push(f.name);
    });
    pSubir();
    if (malos.length) mensaje('Estos archivos no son PDF ni fotos y no se han añadido:\n' + malos.join('\n'));
  };
  $('#elegir').onchange = anadir;
  $('#camara').onchange = anadir;
  document.querySelectorAll('[data-quitar]').forEach((b) => {
    b.onclick = () => { pendientes.splice(Number(b.dataset.quitar), 1); pSubir(); };
  });
  $('#analizar').onclick = analizar;
}

async function analizar() {
  if (!iaLista()) { fallo(new Error('SIN_CLAVE')); return; }
  cargando('Leyendo tus CV…\nPuede tardar hasta un minuto.');
  try {
    const bloques = [];
    for (const p of pendientes) {
      if (p.tipo === 'pdf') {
        if (p.file.size > 25 * 1024 * 1024) throw new Error('El PDF "' + p.nombre + '" es demasiado grande (más de 25 MB).');
        bloques.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await leerBase64(p.file) } });
      } else {
        bloques.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await fotoReducida(p.file) } });
      }
    }
    bloques.push({ type: 'text', text: promptAnalisis(E.perfil) });
    const r = await iaJson(bloques, 16000);
    if (!r.perfil) throw new Error('La IA no ha encontrado datos de un CV en esos archivos. Revisa que se lean bien.');
    E.perfil = r.perfil;
    E.preguntas = (r.preguntas || []).filter((p) => p && p.texto).slice(0, 15)
      .map((p, i) => Object.assign({ id: 'p' + (i + 1), tipo: 'texto', opciones: [] }, p, { id: 'p' + (i + 1) }));
    E.respuestas = {};
    E.preferencias = null;
    E.orientaciones = [];
    E.fuentes = E.fuentes.concat(pendientes.map((p) => p.nombre));
    pendientes = [];
    guardar();
    quitarCarga();
    if (E.preguntas.length) {
      mensaje('He leído tu CV' + (E.perfil.nombre ? ', ' + E.perfil.nombre.split(' ')[0] : '') + '.\n\nAhora te haré ' + E.preguntas.length +
        ' preguntas cortas para completarlo. Puedes saltarte las que quieras.',
        [{ texto: 'Empezar', accion: () => ir('preguntas/0') }]);
    } else {
      procesarRespuestas();
    }
  } catch (err) { fallo(err); }
}

// --- Preguntas ---

function pPreguntas(arg) {
  const total = E.preguntas.length;
  if (!total) { ir('inicio'); return; }
  const i = Math.min(Math.max(0, Number(arg) || 0), total - 1);
  const p = E.preguntas[i];
  const r = E.respuestas[p.id] || { opciones: [], texto: '' };
  const conOpciones = (p.tipo === 'opciones' || p.tipo === 'multiple') && lleno(p.opciones).length;

  pantalla('Preguntas',
    '<p class="suave">Pregunta ' + (i + 1) + ' de ' + total + '</p>' +
    '<div class="progreso"><div style="width:' + Math.round(((i + 1) / total) * 100) + '%"></div></div>' +
    '<div class="pregunta">' + esc(p.texto) + '</div>' +
    (p.ayuda ? '<p class="suave">' + esc(p.ayuda) + '</p>' : '') +
    (conOpciones
      ? (p.tipo === 'multiple' ? '<p class="suave">Puedes marcar varias.</p>' : '') +
        lleno(p.opciones).map((o) =>
          '<button class="opcion' + (r.opciones.includes(o) ? ' marcada' : '') + '" data-op="' + esc(o) + '">' + esc(o) + '</button>').join('') +
        '<label class="campo" for="resp">¿Quieres añadir algo? (opcional)</label>'
      : '<label class="campo" for="resp">Tu respuesta</label>') +
    '<textarea id="resp" placeholder="Escribe aquí…">' + esc(r.texto) + '</textarea>' +
    '<button class="boton" id="siguiente">' + (i === total - 1 ? 'Terminar' : 'Siguiente') + '</button>' +
    '<div class="fila">' +
      (i > 0 ? '<button class="boton secundario" id="anterior">Anterior</button>' : '') +
      '<button class="boton texto" id="saltar">Saltar esta pregunta</button>' +
    '</div>');

  const recoger = () => {
    const texto = $('#resp').value;
    const opciones = Array.from(document.querySelectorAll('.opcion.marcada')).map((b) => b.dataset.op);
    if (texto.trim() || opciones.length) E.respuestas[p.id] = { opciones, texto };
    else delete E.respuestas[p.id];
    guardar();
  };
  document.querySelectorAll('.opcion').forEach((b) => {
    b.onclick = () => {
      if (p.tipo !== 'multiple') document.querySelectorAll('.opcion').forEach((x) => { if (x !== b) x.classList.remove('marcada'); });
      b.classList.toggle('marcada');
    };
  });
  const avanzar = () => {
    if (i === total - 1) procesarRespuestas();
    else ir('preguntas/' + (i + 1));
  };
  $('#siguiente').onclick = () => { recoger(); avanzar(); };
  $('#saltar').onclick = () => { delete E.respuestas[p.id]; guardar(); avanzar(); };
  const ant = $('#anterior');
  if (ant) ant.onclick = () => { recoger(); ir('preguntas/' + (i - 1)); };
}

async function procesarRespuestas() {
  cargando('Preparando tus propuestas de CV…');
  try {
    const r = await iaJson([{ type: 'text', text: promptRespuestas(E.perfil, E.preguntas, E.respuestas) }], 16000);
    if (r.perfil) E.perfil = r.perfil;
    E.preferencias = r.preferencias || {};
    E.orientaciones = lleno(r.orientaciones).filter((o) => o.titulo)
      .map((o, i) => Object.assign({}, o, { id: 'o' + Date.now() + '_' + i }));
    guardar();
    quitarCarga();
    ir(E.busqueda ? 'orientaciones' : 'busqueda/seguir');
  } catch (err) { fallo(err); }
}

// --- Qué busco (sectores y puestos) ---

const SECTORES = [
  'Atención al cliente', 'Turismo y viajes', 'Hostelería y restauración', 'Transporte y aeropuertos',
  'Logística y almacén', 'Comercio y ventas', 'Administración y oficina', 'Banca, finanzas e inversión',
  'Informática y tecnología', 'Sanidad y cuidados', 'Educación y formación', 'Limpieza y mantenimiento',
  'Industria y producción', 'Construcción', 'Seguridad', 'Agricultura', 'Marketing y comunicación',
  'Recursos humanos', 'Administración pública', 'Otros'
];

// Todo lo que no se ha desmarcado cuenta como marcado (por defecto se busca en todo)
function busquedaActual() {
  const b = E.busqueda || { quitados: [], extra: [] };
  const puestos = Array.from(new Set(lleno((E.preferencias && E.preferencias.puestos) || []).concat(b.extra || [])));
  return { b, puestos };
}

function pBusqueda(arg) {
  const { b, puestos } = busquedaActual();
  const quitados = new Set(b.quitados || []);
  const ficha = (x) => '<button class="opcion marca' + (quitados.has(x) ? '' : ' marcada') + '" data-m="' + esc(x) + '">' + esc(x) + '</button>';
  const seguir = arg === 'seguir';

  pantalla('Qué busco',
    '<h2>¿Dónde quieres que busque?</h2>' +
    '<p class="suave">Por defecto busco en <b>todo</b>. Desmarca lo que no te interese para afinar el tiro. Puedes cambiarlo cuando quieras desde el inicio.</p>' +
    '<div class="fila"><button class="boton secundario" id="todo">Marcar todo</button>' +
    '<button class="boton secundario" id="nada">Desmarcar todo</button></div>' +
    (puestos.length ? '<h3>Tipos de puesto</h3><div class="marcas">' + puestos.map(ficha).join('') + '</div>' : '') +
    '<h3>Sectores</h3><div class="marcas">' + SECTORES.map(ficha).join('') + '</div>' +
    '<label class="campo" for="nuevo">Añadir un puesto o sector</label>' +
    '<div class="fila"><input type="text" id="nuevo" placeholder="Por ejemplo: guía turístico">' +
    '<button class="boton" id="anadir" style="flex:0 0 110px;margin:0">Añadir</button></div>' +
    '<button class="boton" id="guardar-busqueda">' + (seguir ? 'Guardar y continuar' : 'Guardar') + '</button>');

  const recoger = () => {
    const nuevo = { quitados: [], extra: (E.busqueda && E.busqueda.extra) || [] };
    document.querySelectorAll('.marca').forEach((x) => { if (!x.classList.contains('marcada')) nuevo.quitados.push(x.dataset.m); });
    E.busqueda = nuevo;
    guardar();
  };
  document.querySelectorAll('.marca').forEach((x) => { x.onclick = () => x.classList.toggle('marcada'); });
  $('#todo').onclick = () => document.querySelectorAll('.marca').forEach((x) => x.classList.add('marcada'));
  $('#nada').onclick = () => document.querySelectorAll('.marca').forEach((x) => x.classList.remove('marcada'));
  $('#anadir').onclick = () => {
    const t = $('#nuevo').value.trim();
    if (!t) return;
    recoger();
    if (!E.busqueda.extra.includes(t) && !SECTORES.includes(t)) E.busqueda.extra.push(t);
    E.busqueda.quitados = E.busqueda.quitados.filter((x) => x !== t);
    guardar();
    pBusqueda(arg);
  };
  $('#guardar-busqueda').onclick = () => {
    recoger();
    const marcados = document.querySelectorAll('.marca.marcada').length;
    if (!marcados) { mensaje('Deja marcado al menos un puesto o sector, o pulsa "Marcar todo".'); return; }
    if (seguir) ir('orientaciones');
    else mensaje('Guardado. Buscaré en ' + marcados + ' puestos y sectores.', [{ texto: 'Volver al inicio', accion: () => ir('inicio') }]);
  };
}

// --- Propuestas de CV ---

function pOrientaciones() {
  if (!E.perfil) { ir('subir'); return; }
  if (!E.preferencias) { ir('preguntas/0'); return; }
  const lista = E.orientaciones.map((o) =>
    '<label class="tarjeta orientacion"><input type="checkbox" data-o="' + esc(o.id) + '" checked>' +
    '<div><h3>' + esc(o.titulo) + '</h3><p class="suave">' + esc(o.para_que || '') + '</p>' +
    (lleno(o.puestos_ejemplo).length ? '<div class="chips">' + lleno(o.puestos_ejemplo).map((x) => '<span class="chip">' + esc(x) + '</span>').join('') + '</div>' : '') +
    '</div></label>').join('');

  pantalla('Qué CV crear',
    '<h2>Te propongo estos CV</h2>' +
    '<p class="suave">Cada uno destaca una parte distinta de tu experiencia. Marca los que quieras crear.</p>' +
    (lista || '<p class="suave">No hay propuestas. Escribe abajo qué tipo de CV quieres.</p>') +
    '<label class="campo" for="otro">¿Quieres otro tipo de CV? (opcional)</label>' +
    '<input type="text" id="otro" placeholder="Por ejemplo: CV para recepción de hotel">' +
    '<button class="boton" id="crear">Crear los CV marcados</button>' +
    '<button class="boton texto" id="repreguntar">Volver a las preguntas</button>');

  $('#crear').onclick = () => {
    const marcadas = Array.from(document.querySelectorAll('[data-o]:checked')).map((c) => E.orientaciones.find((o) => o.id === c.dataset.o));
    const otro = $('#otro').value.trim();
    if (otro) {
      const nueva = { id: 'o' + Date.now(), titulo: otro, para_que: otro, puestos_ejemplo: [] };
      E.orientaciones.push(nueva);
      marcadas.push(nueva);
      guardar();
    }
    if (!marcadas.length) { mensaje('Marca al menos un CV o escribe el tipo que quieres.'); return; }
    crearCvs(marcadas);
  };
  $('#repreguntar').onclick = () => ir('preguntas/0');
}

async function crearCvs(orientaciones) {
  let creados = 0;
  try {
    for (let i = 0; i < orientaciones.length; i++) {
      const o = orientaciones[i];
      cargando('Creando CV ' + (i + 1) + ' de ' + orientaciones.length + ':\n' + o.titulo);
      const contenido = await iaJson([{ type: 'text', text: promptCv(E.perfil, E.preferencias, o) }], 8000);
      contenido.contacto = {
        nombre: E.perfil.nombre || '', telefono: E.perfil.telefono || '',
        email: E.perfil.email || '', localidad: E.perfil.localidad || ''
      };
      E.cvs.unshift({ id: 'cv' + Date.now() + '_' + i, titulo: o.titulo, orientacion: o.id, contenido, fecha: Date.now() });
      guardar();
      creados++;
    }
    quitarCarga();
    mensaje(creados === 1 ? 'Tu CV está listo.' : 'Tus ' + creados + ' CV están listos.',
      [{ texto: 'Verlos', accion: () => ir('miscv') }]);
  } catch (err) {
    fallo(err);
    if (creados) setTimeout(() => ir('miscv'), 0);
  }
}

// --- Mis CV ---

function pMisCv() {
  const lista = E.cvs.map((c) =>
    '<div class="tarjeta pulsable" data-ir="cv/' + c.id + '"><h3>📄 ' + esc(c.titulo) + '</h3>' +
    '<p class="suave">' + esc(c.contenido.titulo_profesional || '') + ' · creado el ' + fecha(c.fecha) + '</p></div>').join('');

  pantalla('Mis CV',
    (lista || '<div class="tarjeta"><h3>Aún no tienes CV creados</h3><p class="suave">Sube tu CV actual y te ayudo a crear versiones mejores.</p></div>') +
    (E.preferencias ? '<button class="boton" data-ir="orientaciones">Crear otro CV</button>' : '<button class="boton" data-ir="subir">Subir mi CV</button>'));
}

function pCv(id) {
  const c = E.cvs.find((x) => x.id === id);
  if (!c) { ir('miscv'); return; }
  const html = htmlCv(c.contenido);

  pantalla(c.titulo,
    '<p class="suave">Así queda tu CV. Toca "Guardar en PDF" y elige <b>Guardar como PDF</b> en la pantalla que aparece.</p>' +
    '<div class="vista-cv" id="marco"><iframe id="cv-frame" title="Vista del CV"></iframe></div>' +
    '<button class="boton" id="pdf">⬇️  Guardar en PDF</button>' +
    '<label class="campo" for="cambios">¿Quieres cambiar algo?</label>' +
    '<textarea id="cambios" placeholder="Por ejemplo: quita la experiencia de 2009, pon el teléfono 600 000 000, haz el resumen más corto…"></textarea>' +
    '<button class="boton secundario" id="aplicar">Aplicar cambios</button>' +
    '<button class="boton peligro" id="borrar">Borrar este CV</button>');

  const frame = $('#cv-frame');
  const ajustar = () => {
    try {
      const marco = $('#marco');
      if (!marco) return;
      const escala = marco.clientWidth / 794;
      const alto = frame.contentDocument.documentElement.scrollHeight;
      frame.style.height = alto + 'px';
      frame.style.transform = 'scale(' + escala + ')';
      marco.style.height = Math.ceil(alto * escala) + 'px';
    } catch (err) { /* sin vista previa */ }
  };
  frame.onload = ajustar;
  frame.srcdoc = html;
  window.onresize = ajustar;

  const nombreArchivo = 'CV ' + (c.contenido.contacto && c.contenido.contacto.nombre ? c.contenido.contacto.nombre + ' - ' : '') + c.titulo;
  $('#pdf').onclick = () => {
    if (nativo) nativo.guardarPdf(html, nombreArchivo);
    else { const w = window.open(''); w.document.write(html); w.document.close(); w.print(); }
  };
  $('#aplicar').onclick = async () => {
    const peticion = $('#cambios').value.trim();
    if (!peticion) { mensaje('Escribe primero qué quieres cambiar.'); return; }
    cargando('Aplicando los cambios…');
    try {
      const nuevo = await iaJson([{ type: 'text', text: promptCambios(c.contenido, peticion) }], 8000);
      if (!nuevo.contacto) nuevo.contacto = c.contenido.contacto;
      c.contenido = nuevo;
      c.fecha = Date.now();
      guardar();
      quitarCarga();
      pCv(id);
      mensaje('Cambios aplicados.');
    } catch (err) { fallo(err); }
  };
  $('#borrar').onclick = () => preguntar('¿Borrar el CV "' + c.titulo + '"?', 'Sí, borrar', () => {
    E.cvs = E.cvs.filter((x) => x.id !== id);
    guardar();
    ir('miscv');
  });
}

// ---------- Navegación ----------

const RUTAS = {
  inicio: pInicio,
  ajustes: pAjustes,
  subir: pSubir,
  preguntas: pPreguntas,
  orientaciones: pOrientaciones,
  busqueda: pBusqueda,
  miscv: pMisCv,
  cv: pCv,
  ofertas: pOfertas,
  candidaturas: pCandidaturas,
  candidatura: pCandidatura,
  labora: pLabora,
  empresas: pEmpresas,
  paso: pPaso,
  correo: pCorreo
};

function pintar() {
  window.onresize = null;
  if (!E.bienvenida && !(location.hash || '').startsWith('#paso')) { location.hash = '#paso/idioma'; return; }
  const h = (location.hash || '#inicio').slice(1);
  const corte = h.indexOf('/');
  const ruta = corte < 0 ? h : h.slice(0, corte);
  const arg = corte < 0 ? undefined : decodeURIComponent(h.slice(corte + 1));
  (RUTAS[ruta] || pInicio)(arg);
}

document.addEventListener('click', (ev) => {
  const destino = ev.target.closest('[data-ir]');
  if (destino) { ir(destino.dataset.ir); return; }
  if (ev.target.closest('[data-pronto]')) mensaje('Esta parte llegará en las próximas fases de la app.');
});

$('#atras').onclick = () => {
  if (history.length > 1) history.back(); else ir('inicio');
};

window.addEventListener('hashchange', pintar);
incorporarCorreos();
pintar();
sincronizarFondo();
programarAvisosDemanda();
setTimeout(revisionAutomatica, 4000);
