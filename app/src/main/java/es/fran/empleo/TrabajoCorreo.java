package es.fran.empleo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Revisa el correo en segundo plano (también con la app cerrada):
 * lee los correos nuevos, descarta los que no tienen que ver con empleo,
 * pide a la IA que los clasifique, guarda el resultado para la app y avisa.
 */
public class TrabajoCorreo extends Worker {

    static final String PREFS = "fondo";
    static final String CANAL = "avisos";
    private static final Object CERROJO = new Object();

    private static final Pattern EMPLEO = Pattern.compile(
            "empleo|oferta|vacante|candidat|entrevista|selecci[oó]n|curr[ií]cul|\\bcv\\b|puesto|trabajo|contrataci|"
                    + "recursos humanos|rrhh|inscripci|labora|servef|sepe|infojobs|linkedin|indeed|infoempleo|jobandtalent|"
                    + "adecco|randstad|manpower|eurofirms|gi group|hays|michael page|job|career|hiring|interview|application|"
                    + "formaci[oó]n|curso", Pattern.CASE_INSENSITIVE);

    public TrabajoCorreo(@NonNull Context c, @NonNull WorkerParameters p) {
        super(c, p);
    }

    // ---------- Programación ----------

    static void programar(Context ctx, int minutos) {
        Constraints red = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(TrabajoCorreo.class, Math.max(15, minutos), TimeUnit.MINUTES)
                .setConstraints(red).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("correo", ExistingPeriodicWorkPolicy.UPDATE, r);
    }

    static void cancelar(Context ctx) {
        WorkManager.getInstance(ctx).cancelUniqueWork("correo");
    }

    static void ahora(Context ctx) {
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(TrabajoCorreo.class).build();
        WorkManager.getInstance(ctx).enqueueUniqueWork("correo-ahora", ExistingWorkPolicy.REPLACE, r);
    }

    /** Entrega a la app los correos ya procesados y vacía la cola. */
    static String tomarCola(Context ctx) {
        synchronized (CERROJO) {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String cola = p.getString("cola", "[]");
            p.edit().putString("cola", "[]").apply();
            return cola;
        }
    }

    // ---------- Trabajo ----------

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject estado = new JSONObject();
        int relevantes = 0;
        try {
            String cfgTxt = p.getString("config", null);
            if (cfgTxt == null) return Result.success();
            JSONObject cfg = new JSONObject(cfgTxt);
            JSONObject correo = cfg.optJSONObject("correo");
            if (correo == null || correo.optString("clave").isEmpty()) return Result.success();

            long ultimo = p.getLong("ultimoUid", 0);
            Correo.Lectura l = Correo.leer(correo, ultimo, 10, 40);

            // Filtro previo: solo lo que parece de empleo (lo personal y la publicidad no se envía a la IA)
            String propio = correo.optString("usuario").toLowerCase(Locale.ROOT);
            JSONArray dominios = cfg.optJSONArray("dominios");
            JSONArray candidatos = new JSONArray();
            for (int i = 0; i < l.correos.length(); i++) {
                JSONObject m = l.correos.getJSONObject(i);
                String de = m.optString("de").toLowerCase(Locale.ROOT);
                String asunto = m.optString("asunto");
                if (de.contains(propio) && asunto.startsWith("Mi Empleo")) continue; // nuestros propios avisos
                String todo = de + " " + asunto + " " + m.optString("texto");
                boolean empresa = false;
                if (dominios != null) {
                    for (int k = 0; k < dominios.length(); k++) {
                        String d = dominios.optString(k).toLowerCase(Locale.ROOT);
                        if (!d.isEmpty() && de.contains(d)) { empresa = true; break; }
                    }
                }
                if (empresa || EMPLEO.matcher(todo).find()) candidatos.put(m);
            }

            if (candidatos.length() > 0) {
                JSONArray clasificados = clasificar(cfg, candidatos);
                synchronized (CERROJO) {
                    JSONArray cola = new JSONArray(p.getString("cola", "[]"));
                    for (int i = 0; i < clasificados.length(); i++) {
                        JSONObject c = clasificados.getJSONObject(i);
                        if (!c.optBoolean("relevante", false)) continue;
                        JSONObject original = buscar(candidatos, c.optLong("uid"));
                        if (original != null) {
                            c.put("de", original.optString("de"));
                            c.put("asunto", original.optString("asunto"));
                            c.put("fecha", original.optLong("fecha"));
                        }
                        cola.put(c);
                        relevantes++;
                    }
                    while (cola.length() > 200) cola.remove(0);
                    p.edit().putString("cola", cola.toString()).apply();
                }
                avisar(ctx, cfg, clasificados, candidatos);
            }

            p.edit().putLong("ultimoUid", l.ultimoUid).apply();
            estado.put("ok", true);
            estado.put("leidos", l.correos.length());
            estado.put("revisados", candidatos.length());
            estado.put("relevantes", relevantes);
        } catch (Throwable e) {
            try {
                estado.put("ok", false);
                estado.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            } catch (Exception ignorada) { /* nada */ }
        }
        try { estado.put("hora", System.currentTimeMillis()); } catch (Exception ignorada) { /* nada */ }
        p.edit().putString("estado", estado.toString()).apply();
        MainActivity.correoTerminado(estado.toString());
        return estado.optBoolean("ok", false) ? Result.success() : Result.retry();
    }

    private static JSONObject buscar(JSONArray lista, long uid) {
        for (int i = 0; i < lista.length(); i++) {
            JSONObject o = lista.optJSONObject(i);
            if (o != null && o.optLong("uid") == uid) return o;
        }
        return null;
    }

    /** Llama a la IA (Claude) con las instrucciones que prepara la app y los correos. */
    private static JSONArray clasificar(JSONObject cfg, JSONArray correos) throws Exception {
        JSONObject cuerpo = new JSONObject();
        cuerpo.put("model", cfg.optString("modelo", "claude-sonnet-5-5"));
        cuerpo.put("max_tokens", 8000);
        cuerpo.put("system", cfg.optString("sistema"));
        JSONArray mensajes = new JSONArray();
        JSONObject usuario = new JSONObject();
        usuario.put("role", "user");
        usuario.put("content", cfg.optString("instrucciones") + "\n\nCORREOS NUEVOS:\n" + correos.toString());
        mensajes.put(usuario);
        cuerpo.put("messages", mensajes);

        HttpURLConnection con = (HttpURLConnection) new URL("https://api.anthropic.com/v1/messages").openConnection();
        con.setConnectTimeout(20000);
        con.setReadTimeout(120000);
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setRequestProperty("content-type", "application/json");
        con.setRequestProperty("x-api-key", cfg.optString("apiKey"));
        con.setRequestProperty("anthropic-version", "2023-06-01");
        try (OutputStream os = con.getOutputStream()) {
            os.write(cuerpo.toString().getBytes(StandardCharsets.UTF_8));
        }
        int codigo = con.getResponseCode();
        String respuesta = leerTodo(codigo >= 400 ? con.getErrorStream() : con.getInputStream());
        if (codigo >= 400) throw new Exception("IA " + codigo + ": " + respuesta);

        JSONObject d = new JSONObject(respuesta);
        StringBuilder t = new StringBuilder();
        JSONArray contenido = d.optJSONArray("content");
        if (contenido != null) {
            for (int i = 0; i < contenido.length(); i++) {
                JSONObject b = contenido.getJSONObject(i);
                if ("text".equals(b.optString("type"))) t.append(b.optString("text"));
            }
        }
        String s = t.toString();
        int a = s.indexOf('{'), z = s.lastIndexOf('}');
        if (a < 0 || z < a) throw new Exception("Respuesta de la IA sin datos");
        JSONObject r = new JSONObject(s.substring(a, z + 1));
        JSONArray lista = r.optJSONArray("correos");
        return lista == null ? new JSONArray() : lista;
    }

    private static String leerTodo(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        in.close();
        return b.toString("UTF-8");
    }

    // ---------- Avisos ----------

    private static void avisar(Context ctx, JSONObject cfg, JSONArray clasificados, JSONArray originales) {
        String modo = cfg.optString("avisos", "ambos");
        StringBuilder resumen = new StringBuilder();
        int n = 0;
        for (int i = 0; i < clasificados.length(); i++) {
            JSONObject c = clasificados.optJSONObject(i);
            if (c == null || !c.optBoolean("relevante", false)) continue;
            String tipo = c.optString("tipo");
            String empresa = c.optString("empresa");
            String titulo;
            switch (tipo) {
                case "entrevista": titulo = "📅 Te piden entrevista" + (empresa.isEmpty() ? "" : ": " + empresa); break;
                case "respuesta": titulo = "✉️ Te ha respondido " + (empresa.isEmpty() ? "una empresa" : empresa); break;
                case "rechazo": titulo = "Respuesta de " + (empresa.isEmpty() ? "una empresa" : empresa); break;
                case "curso": titulo = "🎓 Novedad sobre un curso"; break;
                default: titulo = "🔎 Oferta de empleo en tu correo"; break;
            }
            StringBuilder texto = new StringBuilder(c.optString("resumen"));
            if (!c.optString("telefono").isEmpty()) texto.append("\nTeléfono: ").append(c.optString("telefono"));
            if (!c.optString("siguiente_paso").isEmpty()) texto.append("\n➜ ").append(c.optString("siguiente_paso"));
            if (!"correo".equals(modo)) notificar(ctx, titulo, texto.toString());
            resumen.append("■ ").append(titulo).append("\n").append(texto).append("\n\n");
            n++;
        }
        if (n > 0 && !"movil".equals(modo)) {
            try {
                JSONObject correo = cfg.getJSONObject("correo");
                String para = cfg.optString("avisosA", correo.optString("usuario"));
                Correo.enviar(correo, para, n == 1 ? "Mi Empleo: novedad en tu correo" : "Mi Empleo: " + n + " novedades en tu correo",
                        "Hola,\n\nHe encontrado esto en tu correo:\n\n" + resumen + "Abre la app Mi Empleo para ver los detalles y el siguiente paso.\n");
            } catch (Exception e) {
                // si falla el correo, al menos ya está el aviso del móvil
            }
        }
    }

    static void notificar(Context ctx, String titulo, String texto) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CANAL, "Avisos de empleo", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(c);
        }
        Intent abrir = new Intent(ctx, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        abrir.putExtra("ir", "correo");
        PendingIntent pi = PendingIntent.getActivity(ctx, 1, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(ctx, CANAL)
                .setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new Notification.BigTextStyle().bigText(texto))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        try {
            nm.notify((int) (System.currentTimeMillis() % 100000) + 1000, n);
        } catch (SecurityException e) {
            // sin permiso de avisos
        }
    }
}
