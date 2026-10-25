'use strict';
// Búsquedas automáticas en los portales de empleo principales, a partir de «Qué busco» y del ámbito.

const PORTALES = [
  { id: 'infojobs', nombre: 'InfoJobs', url: (kw) => 'https://www.infojobs.net/jobsearch/search-results/list.xhtml?keyword=' + encodeURIComponent(kw) + '&sortBy=PUBLICATION_DATE' },
  { id: 'indeed', nombre: 'Indeed', url: (kw, loc) => 'https://es.indeed.com/jobs?q=' + encodeURIComponent(kw) + '&l=' + encodeURIComponent(loc) + '&sort=date' },
  { id: 'linkedin', nombre: 'LinkedIn', url: (kw, loc) => 'https://www.linkedin.com/jobs/search/?keywords=' + encodeURIComponent(kw) + '&location=' + encodeURIComponent(loc) + '&sortBy=DD' },
  { id: 'jooble', nombre: 'Jooble', url: (kw, loc) => 'https://es.jooble.org/SearchResult?ukw=' + encodeURIComponent(kw) + (loc && loc !== 'España' ? '&rgns=' + encodeURIComponent(loc) : '') },
  // Estos se buscan con un buscador normal limitado a su web (una sola búsqueda con todos los puestos)
  { id: 'labora', nombre: 'LABORA (ofertas públicas)', dominio: 'labora.gva.es' },
  { id: 'infoempleo', nombre: 'Infoempleo', dominio: 'infoempleo.com' },
  { id: 'turijobs', nombre: 'Turijobs', dominio: 'turijobs.com' },
  { id: 'empleate', nombre: 'Empléate (SEPE)', dominio: 'empleate.gob.es' },
  { id: 'adecco', nombre: 'Adecco', dominio: 'adecco.es' },
  { id: 'randstad', nombre: 'Randstad', dominio: 'randstad.es' },
  { id: 'manpower', nombre: 'Manpower', dominio: 'manpower.es' },
  { id: 'eurofirms', nombre: 'Eurofirms', dominio: 'eurofirms.es' },
  { id: 'jobandtalent', nombre: 'Jobandtalent', dominio: 'jobandtalent.com' },
  { id: 'tecnoempleo', nombre: 'Tecnoempleo', dominio: 'tecnoempleo.com', soloSi: /inform[aá]tic|program|desarroll|sistemas|t[eé]cnico it|software|datos/i }
];

function urlBuscadorSitio(dominio, palabras, loc) {
  const q = '(' + palabras.map((p) => '"' + p + '"').join(' OR ') + ') ' + (loc && loc !== 'España' ? loc + ' ' : '') + 'oferta site:' + dominio;
  return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q) + '&df=m';
}
const MAX_PUESTOS_PORTALES = 3;

function portalesActivos() {
  const a = (E.portales && E.portales.activos) || {};
  const texto = palabrasBusqueda().join(' ');
  return PORTALES.filter((p) => a[p.id] === true || (a[p.id] !== false && (!p.soloSi || p.soloSi.test(texto))));
}

// Qué palabras buscar: los puestos marcados en «Qué busco» (como mucho 3, para no gastar de más)
function palabrasBusqueda() {
  let puestos = seleccionBusqueda().puestos;
  if (!puestos.length) puestos = lleno((E.preferencias && E.preferencias.puestos) || []);
  if (!puestos.length) puestos = [].concat(...E.orientaciones.map((o) => lleno(o.puestos_ejemplo)));
  return Array.from(new Set(puestos.map((x) => String(x).trim()).filter(Boolean))).slice(0, MAX_PUESTOS_PORTALES);
}

// Dónde buscar según el ámbito: local/provincial → tu ciudad; solo nacional/internacional → España
function lugarBusqueda() {
  const a = E.ambito || { local: true, regional: true, nacional: true };
  return (a.local || a.regional) && ciudad() ? ciudad() : 'España';
}

function firmaPortales() {
  return JSON.stringify([palabrasBusqueda(), lugarBusqueda(), portalesActivos().map((p) => p.id)]);
}

// Crea o actualiza las búsquedas de los portales (sin coste: no usa IA)
function asegurarPortales() {
  if (!E.perfil) return;
  const firma = firmaPortales();
  if (E.firmaPortales === firma && E.sitios.some((s) => s.origen === 'portal')) return;
  const palabras = palabrasBusqueda();
  const anteriores = E.sitios.filter((s) => s.origen === 'portal');
  E.sitios = E.sitios.filter((s) => s.origen !== 'portal');
  const loc = lugarBusqueda();
  const anadir = (p, nombre, url) => {
    const prev = anteriores.find((s) => (lleno(s.paginas)[0] || {}).url === url);
    E.sitios.push(prev || { id: nuevoId('po'), nombre, portal: p.id, origen: 'portal', paginas: [{ tipo: 'ofertas', url }], estado: 'nuevo' });
  };
  if (palabras.length) {
    portalesActivos().forEach((p) => {
      if (p.dominio) anadir(p, p.nombre + ': ' + palabras.join(', '), urlBuscadorSitio(p.dominio, palabras, loc));
      else palabras.forEach((kw) => anadir(p, p.nombre + ': ' + kw, p.url(kw, loc)));
    });
  }
  E.firmaPortales = firma;
  guardar();
}

function htmlPortales() {
  asegurarPortales();
  const activos = new Set(portalesActivos().map((p) => p.id));
  const busquedas = E.sitios.filter((s) => s.origen === 'portal');
  const estado = (s) => s.estado === 'acceso' ? '🔑 Necesita que entres tú' : s.estado === 'error' ? '⚠️ No se pudo leer' : s.ultima ? '✅ ' + hora(s.ultima) : '⏳ Sin revisar';
  const palabras = palabrasBusqueda();
  return '<div class="tarjeta"><h3>Portales de empleo</h3>' +
    '<p class="suave">Busco por ti en estos portales' + (palabras.length ? ': <b>' + palabras.map(esc).join(', ') + '</b> en <b>' + esc(lugarBusqueda()) + '</b>' : '') +
    '. Lo que busco sale de «Qué busco» y del ámbito. Toca un portal para activarlo o desactivarlo.</p>' +
    '<div class="marcas">' + PORTALES.map((p) => '<button class="opcion marca' + (activos.has(p.id) ? ' marcada' : '') + '" data-accion="portal:' + p.id + '">' + p.nombre + '</button>').join('') + '</div>' +
    (!palabras.length ? '<p class="suave">Aún no sé qué puestos buscar. Sube tu CV y responde las preguntas, o añade puestos en «Qué busco».</p>' : '') +
    busquedas.map((s) => '<p style="margin:6px 0"><b>' + esc(s.nombre) + '</b><br><span class="suave">' + estado(s) + '</span>' +
      (s.estado === 'acceso' ? ' <button class="boton" style="min-height:40px;margin:4px 0" data-accion="entrar:' + s.id + '">Entrar</button>'
        : ' <button class="boton texto" style="min-height:32px;margin:0;width:auto;display:inline" data-accion="ver:' + esc((lleno(s.paginas)[0] || {}).url) + '">Ver</button>') + '</p>').join('') +
    '<button class="boton secundario" data-ir="busqueda">Cambiar qué busco</button></div>';
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion^="portal:"]');
  if (!el) return;
  const id = el.dataset.accion.slice(7);
  E.portales = E.portales || { activos: {} };
  E.portales.activos = E.portales.activos || {};
  E.portales.activos[id] = !portalesActivos().some((p) => p.id === id);
  guardar();
  pintar();
});
