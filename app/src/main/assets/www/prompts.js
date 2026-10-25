'use strict';
// Instrucciones que la app envía a la IA. Todo en español.

const SISTEMA =
  'Eres un experto en selección de personal y en redacción de currículums en España. ' +
  'Escribes siempre en español de España, claro, sencillo y profesional. ' +
  'Nunca inventas datos: solo usas lo que aparece en los documentos o lo que el candidato responde. ' +
  'Cuando se te pide JSON, respondes ÚNICAMENTE con JSON válido, sin texto antes ni después y sin bloques de código.';

const ESTRUCTURA_PERFIL =
  '{"nombre":"","telefono":"","email":"","localidad":"","resumen":"",' +
  '"experiencia":[{"puesto":"","empresa":"","lugar":"","inicio":"","fin":"","tareas":[""]}],' +
  '"formacion":[{"titulo":"","centro":"","inicio":"","fin":""}],' +
  '"idiomas":[{"idioma":"","nivel":""}],"informatica":[""],"habilidades":[""],"carnes":[""],"otros":[""]}';

function promptAnalisis(perfilPrevio) {
  return [
    'Analiza el currículum o los currículums adjuntos (pueden ser PDF o fotos). Son todos de la misma persona.',
    perfilPrevio
      ? 'Ya existía este perfil guardado de la misma persona. Combínalo con lo nuevo sin perder datos:\n' + JSON.stringify(perfilPrevio)
      : '',
    '',
    '1) Extrae todos sus datos en un único perfil, unificando lo repetido.',
    '2) Prepara entre 6 y 12 preguntas para completar o mejorar el CV y para orientar su búsqueda de empleo. Prioriza:',
    '   - datos que faltan o son confusos (fechas, nombres de puestos, empresas);',
    '   - logros concretos, mejor con números (personas atendidas, equipos a cargo, volumen de trabajo…);',
    '   - carné de conducir y vehículo propio, nivel real de idiomas;',
    '   - qué tipo de puestos busca, en qué zona o a qué distancia trabajaría, jornada, cuándo puede incorporarse y sueldo mínimo que aceptaría.',
    '   No preguntes lo que ya está claro en el CV. Preguntas cortas, en lenguaje sencillo y tuteando.',
    '',
    'Devuelve este JSON:',
    '{"perfil":' + ESTRUCTURA_PERFIL + ',',
    '"preguntas":[{"id":"p1","texto":"","ayuda":"","tipo":"texto","opciones":[]}]}',
    '',
    'En "tipo" usa "opciones" cuando haya respuestas típicas y solo se elige una, "multiple" si se pueden marcar varias, y "texto" para respuestas libres (en ese caso "opciones" vacío).',
    '"ayuda" es una pista breve opcional (por ejemplo, un ejemplo de respuesta). Deja vacío ("" o []) lo que no aparezca.'
  ].join('\n');
}

function promptRespuestas(perfil, preguntas, respuestas) {
  const lista = preguntas.map((p) => {
    const r = respuestas[p.id];
    return '- ' + p.texto + '\n  Respuesta: ' + (textoRespuesta(r) || '(sin responder)');
  }).join('\n');
  return [
    'Este es el perfil actual del candidato:',
    JSON.stringify(perfil),
    '',
    'Estas son sus respuestas a las preguntas:',
    lista,
    '',
    '1) Devuelve el perfil actualizado incorporando sus respuestas (misma estructura).',
    '2) Resume sus preferencias de búsqueda de empleo.',
    '3) Propón entre 2 y 4 orientaciones de CV distintas que tengan sentido con su experiencia y con lo que busca. Cada orientación destaca una parte diferente de su perfil (por ejemplo, un CV para logística y otro para atención al cliente).',
    '',
    'Devuelve este JSON:',
    '{"perfil":' + ESTRUCTURA_PERFIL + ',',
    '"preferencias":{"puestos":[""],"zona":"","jornada":"","disponibilidad":"","sueldo_minimo":"","vehiculo":"","otras":""},',
    '"orientaciones":[{"id":"o1","titulo":"","para_que":"","puestos_ejemplo":[""]}]}',
    '',
    '"titulo" es corto (por ejemplo "CV Logística y almacén"). "para_que" explica en una frase sencilla para qué ofertas sirve.'
  ].join('\n');
}

const ESTRUCTURA_CV =
  '{"titulo_profesional":"","resumen":"",' +
  '"experiencia":[{"puesto":"","empresa":"","lugar":"","fechas":"","puntos":[""]}],' +
  '"formacion":[{"titulo":"","centro":"","fechas":""}],' +
  '"idiomas":[""],"informatica":[""],"competencias":[""],"otros":[""]}';

function promptCv(perfil, preferencias, orientacion) {
  return [
    'Redacta el contenido de un currículum orientado a: "' + orientacion.titulo + '".',
    orientacion.para_que ? 'Objetivo: ' + orientacion.para_que : '',
    '',
    'Perfil del candidato:',
    JSON.stringify(perfil),
    '',
    'Sus preferencias de búsqueda:',
    JSON.stringify(preferencias || {}),
    '',
    'Reglas:',
    '- No inventes empresas, fechas, titulaciones ni logros. Puedes reordenar, resumir y redactar mejor para destacar lo que importa para este objetivo.',
    '- Experiencia de la más reciente a la más antigua. Como máximo 5 puntos por puesto, frases cortas que empiecen por un verbo.',
    '- Resumen de 3 o 4 líneas, en primera persona implícita (sin "yo"), pensado para este tipo de puesto.',
    '- "idiomas" como texto, por ejemplo "Inglés: nivel medio (B1)". En "otros" pon carné de conducir, vehículo y disponibilidad si los hay.',
    '- Debe caber en una página (dos como mucho si tiene muchísima experiencia).',
    '',
    'Devuelve este JSON:',
    ESTRUCTURA_CV
  ].join('\n');
}

function promptCambios(contenido, peticion) {
  return [
    'Este es el contenido de un currículum en JSON:',
    JSON.stringify(contenido),
    '',
    'El candidato pide estos cambios:',
    peticion,
    '',
    'Aplica los cambios. No inventes datos; si el propio candidato da un dato nuevo en su petición, sí puedes incluirlo.',
    'Devuelve el mismo JSON completo ya actualizado, con la misma estructura (incluido "contacto" si existe).'
  ].join('\n');
}

function textoRespuesta(r) {
  if (!r) return '';
  const partes = [];
  if (r.opciones && r.opciones.length) partes.push(r.opciones.join(', '));
  if (r.texto && r.texto.trim()) partes.push(r.texto.trim());
  return partes.join('. ');
}
