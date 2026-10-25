'use strict';
// Empresas candidatas automáticas según el perfil, y candidaturas preparadas solas
// que el usuario envía una tras otra («Presentarme a todas»).

// Grandes empresas que contratan mucho, por tipo de puesto
const CATALOGO = {
  alimentacion: { nombre: 'Supermercados', empresas: ['Mercadona', 'Lidl', 'Consum', 'Carrefour', 'Aldi', 'Dia', 'Alcampo', 'Eroski', 'Masymas'] },
  retail: { nombre: 'Tiendas', empresas: ['El Corte Inglés', 'Inditex', 'Primark', 'Decathlon', 'Leroy Merlin', 'Ikea', 'MediaMarkt', 'Mango', 'Action', 'Kiabi'] },
  logistica: { nombre: 'Logística y almacén', empresas: ['Amazon', 'DHL', 'Seur', 'GLS', 'MRW', 'Correos'] },
  hosteleria: { nombre: 'Hostelería', empresas: ['Meliá', 'NH Hotels', 'Barceló', 'Iberostar', 'RIU Hotels', 'McDonald\'s', 'Burger King', 'Telepizza', 'Grupo Vips', 'Restalia'] },
  aeropuertos: { nombre: 'Aeropuertos y aerolíneas', empresas: ['Aena', 'Iberia', 'Vueling', 'Ryanair', 'Air Europa', 'Groundforce', 'Menzies Aviation', 'Swissport', 'Azul Handling'] },
  turismo: { nombre: 'Turismo y viajes', empresas: ['Ávoris', 'Viajes El Corte Inglés', 'Mundiplan', 'Logitravel', 'Europcar', 'Hertz'] },
  atencion: { nombre: 'Atención al cliente', empresas: ['Konecta', 'Atento', 'Teleperformance', 'Transcom', 'Foundever'] },
  limpieza: { nombre: 'Limpieza y servicios', empresas: ['ISS', 'Clece', 'Eulen', 'Serveo', 'Ilunion'] },
  seguridad: { nombre: 'Seguridad', empresas: ['Securitas', 'Prosegur', 'Trablisa', 'Sureste Seguridad'] },
  sanidad: { nombre: 'Sanidad y cuidados', empresas: ['Quirónsalud', 'Vithas', 'HM Hospitales', 'Sanitas', 'DomusVi', 'Ribera Salud'] },
  banca: { nombre: 'Banca y finanzas', empresas: ['Santander', 'BBVA', 'CaixaBank', 'Banco Sabadell', 'Bankinter', 'Renta 4'] },
  tecnologia: { nombre: 'Tecnología', empresas: ['Indra', 'NTT Data', 'Accenture', 'Capgemini', 'Sopra Steria'] }
};

// Qué tipos de empresa encajan con cada puesto o sector
const SENALES = [
  [/cajer|reponed|dependient|supermercad|charcuter|carnicer|pescader|frutero|panader|alimentaci/i, ['alimentacion', 'retail']],
  [/vendedor|venta|comercial|tienda|retail|comercio|probador|visual/i, ['retail', 'alimentacion']],
  [/mozo|almac[eé]n|carretiller|log[ií]stic|repartid|preparador de pedidos|picking|conductor|transporte/i, ['logistica']],
  [/camarer|cocin|recepcion|hotel|hosteler|restaura|barista|ayudante de cocina/i, ['hosteleria', 'turismo']],
  [/aeropuerto|azafat|tripulante|handling|pasajer|facturaci|embarque|aerol[ií]nea|aviaci/i, ['aeropuertos', 'turismo']],
  [/gu[ií]a|tur[ií]s|viaje|imserso|ocio|animador|excursi/i, ['turismo', 'hosteleria', 'aeropuertos']],
  [/teleoperador|atenci[oó]n al cliente|call center|contact center|telemarketing|soporte/i, ['atencion']],
  [/limpie|mantenimiento|conserje|jardiner/i, ['limpieza']],
  [/vigilante|seguridad|controlador de acceso|auxiliar de servicios/i, ['seguridad']],
  [/enfermer|auxiliar de enfermer|celador|cuidador|geriatr|sanitari|sanidad|gerocultor/i, ['sanidad']],
  [/banca|banco|finanz|inversi|trader|trading|bolsa|gestor comercial|cajero de banco/i, ['banca']],
  [/inform[aá]tic|program|desarroll|sistemas|software|datos|tecnolog/i, ['tecnologia']]
];

const SECTOR_A_TIPO = {
  'Atención al cliente': 'atencion', 'Turismo y viajes': 'turismo', 'Hostelería y restauración': 'hosteleria',
  'Transporte y aeropuertos': 'aeropuertos', 'Logística y almacén': 'logistica', 'Comercio y ventas': 'retail',
  'Banca, finanzas e inversión': 'banca', 'Informática y tecnología': 'tecnologia', 'Sanidad y cuidados': 'sanidad',
  'Limpieza y mantenimiento': 'limpieza', 'Seguridad': 'seguridad'
};

const MAX_WEBS_POR_REVISION = 6;

function tiposEmpresa() {
  const tipos = new Set();
  const textos = palabrasBusqueda()
    .concat(lleno((E.preferencias && E.preferencias.puestos) || []))
    .concat(lleno((E.perfil && E.perfil.experiencia) || []).map((x) => x.puesto || ''));
  textos.forEach((t) => SENALES.forEach(([re, ts]) => { if (re.test(t)) ts.forEach((x) => tipos.add(x)); }));
  const sel = seleccionBusqueda();
  if (!sel.todo) sel.sectores.forEach((s) => { if (SECTOR_A_TIPO[s]) tipos.add(SECTOR_A_TIPO[s]); });
  return Array.from(tipos);
}

function auto() {
  E.empresasAuto = E.empresasAuto || { descartadas: [], firmaIA: '' };
  return E.empresasAuto;
}

const mismaEmpresa = (a, b) => String(a).toLowerCase().replace(/[^a-z0-9ñáéíóú]/g, '') === String(b).toLowerCase().replace(/[^a-z0-9ñáéíóú]/g, '');

function anadirEmpresaAuto(nombre, motivo) {
  const A = auto();
  if (A.descartadas.some((d) => mismaEmpresa(d, nombre))) return false;
  if (E.sitios.some((s) => mismaEmpresa(s.nombre, nombre))) return false;
  E.sitios.push({ id: nuevoId('ea'), nombre, origen: 'auto', motivo, paginas: [], pendienteWeb: true, estado: 'nuevo' });
  return true;
}

// Añade (sin IA) las grandes empresas que encajan con los puestos buscados
function asegurarEmpresasAuto() {
  if (!E.perfil) return 0;
  let n = 0;
  tiposEmpresa().forEach((t) => CATALOGO[t].empresas.forEach((e) => { if (anadirEmpresaAuto(e, CATALOGO[t].nombre)) n++; }));
  if (n) guardar();
  return n;
}

// Una vez por cada cambio de perfil, pide a la IA empresas de la zona (una sola consulta)
async function proponerEmpresasLocales() {
  const A = auto();
  const firma = firmaPortales();
  if (A.firmaIA === firma || !iaLista()) return 0;
  A.firmaIA = firma;
  guardar();
  try {
    const r = await iaJson([{ type: 'text', text: promptEmpresas() + '\nPrioriza empresas de la zona del candidato que no sean grandes cadenas nacionales.' }], 6000);
    let n = 0;
    lleno(r.empresas).forEach((e) => { if (e.nombre && anadirEmpresaAuto(e.nombre, e.sector || 'Propuesta para tu perfil')) n++; });
    guardar();
    return n;
  } catch (err) {
    if (err.message === 'SIN_CLAVE') throw err;
    return 0;
  }
}

// Busca (sin IA) la web de empleo de las empresas añadidas que aún no la tienen
async function resolverWebsPendientes(maximo, deUsuario) {
  const pendientes = E.sitios.filter((s) => s.pendienteWeb).slice(0, maximo);
  for (let k = 0; k < pendientes.length; k++) {
    const s = pendientes[k];
    if (deUsuario) cargando('Buscando la web de empleo de ' + s.nombre + '…', k + 1, pendientes.length);
    else Trabajo.mostrar('Buscando webs de empleo: ' + s.nombre, k + 1, pendientes.length);
    const url = await buscarWebEmpleo(s.nombre + ' ' + (ciudad() || 'España'));
    s.pendienteWeb = false;
    if (url) s.paginas = [{ tipo: 'ofertas', url }];
    else s.estado = 'sinweb';
    guardar();
  }
}

// Se llama al empezar cada revisión
async function prepararEmpresas(deUsuario) {
  asegurarEmpresasAuto();
  if (deUsuario) cargando('Buscando empresas de tu zona que encajen contigo…');
  await proponerEmpresasLocales();
  await resolverWebsPendientes(MAX_WEBS_POR_REVISION, deUsuario);
}

function quitarEmpresaAuto(id) {
  const s = E.sitios.find((x) => x.id === id);
  if (s && (s.origen === 'auto' || s.origen === 'empresa')) auto().descartadas.push(s.nombre);
  E.sitios = E.sitios.filter((x) => x.id !== id);
  guardar();
}

// ---------- Candidaturas preparadas solas ----------

const umbralAuto = () => (E.ajustes.autoUmbral === undefined ? 7 : Number(E.ajustes.autoUmbral));

function prepararCandidaturas(ofertas) {
  const u = umbralAuto();
  if (!u || !E.cvs.length) return [];
  const listas = [];
  ofertas.filter((o) => o.estado === 'nueva' && (o.nota || 0) >= u && o.url).forEach((o) => {
    if (E.candidaturas.some((c) => c.oferta === o.id)) return;
    const cv = E.cvs.find((x) => x.id === o.cv) || E.cvs[0];
    const c = { id: nuevoId('ca'), oferta: o.id, titulo: o.titulo, empresa: o.empresa, fuente: o.fuente, url: o.url, cv: cv.id,
      estado: 'lista', historial: [], siguiente: 'Lista para presentarte. Pulsa «Presentarme a todas» en el inicio.' };
    hist(c, 'Preparada automáticamente (nota ' + o.nota + '/10) con el CV «' + cv.titulo + '»');
    E.candidaturas.unshift(c);
    o.estado = 'candidatura';
    listas.push(c);
  });
  if (listas.length) {
    guardar();
    if (!envioDirecto()) notificarUsuario(listas.length === 1 ? 'Candidatura lista para enviar' : listas.length + ' candidaturas listas para enviar',
      listas.slice(0, 3).map((c) => c.titulo + (c.empresa ? ' — ' + c.empresa : '')).join('\n') + '\nAbre la app y pulsa «Presentarme a todas».');
  }
  return listas;
}

// Se presenta a todas las candidaturas listas, una detrás de otra
async function presentarEnCadena() {
  const lista = E.candidaturas.filter((c) => c.estado === 'lista');
  if (!lista.length) { mensaje('No hay candidaturas listas para enviar.'); return; }
  if (!Nav.disponible()) { mensaje('Esto solo funciona dentro de la app del móvil.'); return; }
  if (Nav.ocupado) { mensaje('Estoy terminando otra tarea. Inténtalo en unos segundos.'); return; }
  let enviadas = 0;
  for (let k = 0; k < lista.length; k++) {
    const c = lista[k];
    if (k > 0) {
      const sigue = await Nav.cola(async () => {
        Nav.panel('Siguiente (' + (k + 1) + ' de ' + lista.length + '): ' + c.titulo + (c.empresa ? ' — ' + c.empresa : ''),
          [{ id: 'seguir', texto: 'Seguir', principal: true }, { id: 'parar', texto: 'Parar aquí' }]);
        const b = await Nav.esperarBoton();
        if (b !== 'seguir') Nav.ocultar();
        return b === 'seguir';
      });
      if (!sigue) break;
    }
    await presentarme(c.oferta, true);
    if ((E.candidaturas.find((x) => x.id === c.id) || {}).estado === 'enviada') enviadas++;
  }
  Nav.ocultar();
  const quedan = E.candidaturas.filter((c) => c.estado === 'lista' || c.estado === 'pendiente_ti').length;
  mensaje('Has enviado ' + enviadas + (enviadas === 1 ? ' candidatura.' : ' candidaturas.') + (quedan ? '\nQuedan ' + quedan + ' pendientes; las tienes en Candidaturas.' : ''),
    [{ texto: 'Ver candidaturas', accion: () => ir('candidaturas') }]);
}

function urgentesAuto() {
  const n = E.candidaturas.filter((c) => c.estado === 'lista').length;
  return n ? '<div class="tarjeta urgente"><div class="etiqueta">Pendiente de ti</div><h3>' + n +
    (n === 1 ? ' candidatura lista para enviar' : ' candidaturas listas para enviar') + '</h3>' +
    '<p class="suave">Las abro y relleno una tras otra; tú revisas y pulsas enviar.</p>' +
    '<button class="boton" data-accion="cadena">Presentarme a todas</button></div>' : '';
}

function htmlAutoAjuste() {
  const ops = [0, 6, 7, 8, 9].map((n) => '<option value="' + n + '"' + (n === umbralAuto() ? ' selected' : '') + '>' +
    (n ? 'Con nota ' + n + ' o más' : 'No, solo cuando yo lo pida') + '</option>').join('');
  return '<label class="campo" for="auto-umbral">Preparar candidaturas automáticamente</label><select id="auto-umbral">' + ops + '</select>';
}

document.addEventListener('change', (ev) => {
  if (ev.target && ev.target.id === 'auto-umbral') { E.ajustes.autoUmbral = Number(ev.target.value); guardar(); }
});

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el) return;
  const v = el.dataset.accion;
  if (v === 'cadena') presentarEnCadena();
  else if (v.startsWith('quitar-auto:')) {
    preguntar('¿Quitar esta empresa? No volveré a proponerla.', 'Sí, quitar', () => { quitarEmpresaAuto(v.slice(12)); pintar(); });
  } else if (v === 'buscar-webs') {
    resolverWebsPendientes(50, true).then(() => { quitarCarga(); pintar(); }).catch((err) => fallo(err));
  }
});
