'use strict';
// Renovación de la demanda de empleo (LABORA): fecha, recordatorios y aviso en el inicio.

const INTERVALOS_DEMANDA = [
  { m: 0, t: 'No se repite' },
  { m: 1, t: 'Cada mes' },
  { m: 2, t: 'Cada 2 meses' },
  { m: 3, t: 'Cada 3 meses' },
  { m: 6, t: 'Cada 6 meses' }
];

function demanda() {
  return E.demanda || { fecha: '', cadaMeses: 3 };
}

const fechaLocal = (iso, h) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d, h || 9, 0, 0); };
const fechaBonita = (iso) => fechaLocal(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const diasHasta = (iso) => Math.round((fechaLocal(iso, 0) - new Date(new Date().toDateString())) / 86400000);

function sumarMeses(iso, meses) {
  const f = fechaLocal(iso);
  f.setMonth(f.getMonth() + meses);
  return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
}

// Programa los avisos del móvil: la víspera a las 10:00 y el mismo día a las 9:00
function programarAvisosDemanda() {
  if (!nativo || !nativo.programarAviso) return;
  const d = demanda();
  if (!d.fecha) { nativo.cancelarAviso('demanda-antes'); nativo.cancelarAviso('demanda-dia'); return; }
  const dia = fechaLocal(d.fecha, 9).getTime();
  const victima = dia - 23 * 3600000; // víspera a las 10:00
  const texto = 'Te toca renovar la demanda de empleo el ' + fechaBonita(d.fecha) + '. Abre Mi Empleo → LABORA → «Renovar ahora».';
  if (victima > Date.now()) nativo.programarAviso('demanda-antes', victima, 'Mañana renuevas la demanda de empleo', texto);
  else nativo.cancelarAviso('demanda-antes');
  if (dia > Date.now()) nativo.programarAviso('demanda-dia', dia, 'Hoy renuevas la demanda de empleo', texto);
  else nativo.cancelarAviso('demanda-dia');
}

function marcarRenovada() {
  const d = demanda();
  if (d.cadaMeses && d.fecha) {
    let nueva = d.fecha;
    do { nueva = sumarMeses(nueva, d.cadaMeses); } while (diasHasta(nueva) <= 0);
    E.demanda = Object.assign({}, d, { fecha: nueva, ultima: Date.now() });
  } else {
    E.demanda = Object.assign({}, d, { fecha: '', ultima: Date.now() });
  }
  guardar();
  programarAvisosDemanda();
  mensaje(E.demanda.fecha ? 'Anotado. Te avisaré para la próxima renovación: ' + fechaBonita(E.demanda.fecha) + '.' : 'Anotado.',
    [{ texto: 'Entendido', accion: () => pintar() }]);
}

function htmlDemanda() {
  const d = demanda();
  const ops = INTERVALOS_DEMANDA.map((x) => '<option value="' + x.m + '"' + (x.m === Number(d.cadaMeses) ? ' selected' : '') + '>' + x.t + '</option>').join('');
  return '<div class="tarjeta"><h3>Renovación de la demanda de empleo</h3>' +
    '<p class="suave">Pon la fecha que aparece en tu tarjeta de demanda (DARDE). Te avisaré la víspera y el mismo día.</p>' +
    '<label class="campo" for="demanda-fecha">Próxima renovación</label>' +
    '<input type="date" id="demanda-fecha" value="' + esc(d.fecha) + '">' +
    '<label class="campo" for="demanda-cada">Se repite</label><select id="demanda-cada">' + ops + '</select>' +
    '<button class="boton secundario" data-accion="demanda-guardar">Guardar fecha</button>' +
    (d.fecha ? '<div class="fila"><button class="boton" data-accion="demanda-renovar">Renovar ahora</button>' +
      '<button class="boton secundario" data-accion="demanda-hecha">Ya la he renovado</button></div>' +
      '<button class="boton texto" data-accion="demanda-calendario">📅 Añadir al calendario</button>' : '') +
    (d.ultima ? '<p class="suave">Última renovación anotada: ' + hora(d.ultima) + '</p>' : '') +
    '</div>';
}

function urgentesDemanda() {
  const d = demanda();
  if (!d.fecha) return '';
  const n = diasHasta(d.fecha);
  if (n > 3) return '';
  const cuando = n < 0 ? 'Se pasó el ' + fechaBonita(d.fecha) : n === 0 ? 'Es hoy' : n === 1 ? 'Es mañana' : 'Es el ' + fechaBonita(d.fecha);
  return '<div class="tarjeta urgente"><div class="etiqueta">Pendiente de ti</div><h3>Renueva tu demanda de empleo</h3>' +
    '<p class="suave">' + cuando + '.' + (n < 0 ? ' Hazlo cuanto antes o llama a tu oficina de LABORA.' : '') + '</p>' +
    '<div class="fila"><button class="boton" data-accion="demanda-renovar">Renovar ahora</button>' +
    '<button class="boton secundario" data-accion="demanda-hecha">Ya está</button></div></div>';
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion^="demanda-"]');
  if (!el) return;
  const a = el.dataset.accion;
  if (a === 'demanda-guardar') {
    const f = $('#demanda-fecha').value;
    E.demanda = Object.assign({}, demanda(), { fecha: f, cadaMeses: Number($('#demanda-cada').value) });
    guardar();
    programarAvisosDemanda();
    mensaje(f ? 'Guardado. Te avisaré la víspera y el ' + fechaBonita(f) + '.' : 'Fecha borrada: no habrá avisos.', [{ texto: 'Entendido', accion: () => pintar() }]);
  } else if (a === 'demanda-hecha') {
    preguntar('¿Has renovado ya la demanda de empleo?', 'Sí, ya está', marcarRenovada);
  } else if (a === 'demanda-renovar') {
    const s = asegurarLabora();
    verWeb(s.inicio || LABORA_URL, 'Renueva tu demanda en LABORA (entra en tu área personal). Cuando termines, pulsa Cerrar y luego «Ya la he renovado».');
  } else if (a === 'demanda-calendario') {
    const d = demanda();
    if (d.fecha && nativo && nativo.calendario) {
      nativo.calendario('Renovar la demanda de empleo (LABORA)', fechaLocal(d.fecha, 9).getTime(), '', 'Se puede hacer en la web de LABORA, en tu área personal.');
    }
  }
});
