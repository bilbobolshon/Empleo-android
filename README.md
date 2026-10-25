# Mi Empleo

App Android personal de búsqueda de empleo.

## Cómo instalar la última versión

1. Entra en la pestaña **Releases** de este repositorio (o en *Code → Releases → Última versión*).
2. Descarga **MiEmpleo.apk** y ábrelo en el móvil.
3. Si el móvil lo pide, permite "instalar apps de esta fuente".

Cada vez que se sube un cambio, GitHub compila la app solo y actualiza "Última versión" (tarda unos 5 minutos).
Las versiones nuevas se instalan encima de la anterior sin perder tus datos.

## Fases

1. ✅ Importar CV (PDF o foto), preguntas, «Qué busco» y creación de CV adaptados en PDF.
2. ✅ Navegador con traspaso de control (accesos, captchas, Cl@ve, certificado), LABORA (ofertas y cursos),
   empresas afines y añadidas a mano, valoración de ofertas, candidaturas con autorrelleno e historial.
3. ✅ Bienvenida (idioma, correo, avisos, ámbito) y lectura del correo cada 30 min, también con la app cerrada: ofertas, respuestas, teléfonos, entrevistas y calendario.

## Cómo está hecha (para quien la mantenga)

- `app/src/main/java/.../MainActivity.java`: parte nativa de Android (elegir archivos, cámara, guardar PDF).
- `app/src/main/assets/www/`: la interfaz (HTML/JS), con la lógica de la app y las instrucciones para la IA.
- La IA es Claude (API de Anthropic); la clave se introduce en *Ajustes* y solo se guarda en el móvil.
