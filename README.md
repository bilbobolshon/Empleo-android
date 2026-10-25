# Mi Empleo

App Android personal de búsqueda de empleo.

## Cómo instalar la última versión

1. Entra en la pestaña **Releases** de este repositorio (o en *Code → Releases → Última versión*).
2. Descarga **MiEmpleo.apk** y ábrelo en el móvil.
3. Si el móvil lo pide, permite "instalar apps de esta fuente".

Cada vez que se sube un cambio, GitHub compila la app solo y actualiza "Última versión" (tarda unos 5 minutos).
Las versiones nuevas se instalan encima de la anterior sin perder tus datos.

## Fases

1. ✅ Importar CV (PDF o foto), preguntas y creación de CV adaptados en PDF.
2. ⏳ Leer Gmail y avisar de ofertas, respuestas y entrevistas.
3. ⏳ Navegador con autorrelleno y paso a manual (inicios de sesión, captchas) + historial de candidaturas.
4. ⏳ Búsqueda de ofertas y elección automática del CV más adecuado.

## Cómo está hecha (para quien la mantenga)

- `app/src/main/java/.../MainActivity.java`: parte nativa de Android (elegir archivos, cámara, guardar PDF).
- `app/src/main/assets/www/`: la interfaz (HTML/JS), con la lógica de la app y las instrucciones para la IA.
- La IA es Claude (API de Anthropic); la clave se introduce en *Ajustes* y solo se guarda en el móvil.
