package es.fran.empleo;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.security.KeyChain;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ClientCertRequest;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.lang.ref.WeakReference;
import java.util.Properties;

import javax.mail.AuthenticationFailedException;
import javax.mail.Message;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;

/**
 * Pantalla principal.
 * - "web": la interfaz de la app (página local en assets/www).
 * - "portal": navegador interno para LABORA, portales de empleo y webs de empresas.
 *   Funciona oculto mientras la app trabaja sola y se muestra, con una barra de
 *   instrucciones arriba, cuando necesita que el usuario haga algo (acceso, captcha…).
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String INICIO = "https://" + HOST + "/assets/www/index.html";
    private static final String CANAL = "avisos";
    private static final int REQ_ARCHIVO = 1;
    private static final int REQ_CAMARA = 2;
    private static final int PRIMARIO = Color.rgb(0x1F, 0x5F, 0xAD);

    private WebView web;
    private WebView portal;
    private LinearLayout panel;
    private TextView panelTexto;
    private LinearLayout panelBotones;
    private WebView vistaImpresion;
    private ValueCallback<Uri[]> esperaArchivos;
    private Uri fotoUri;
    private int numAviso = 100;
    private static WeakReference<MainActivity> instancia = new WeakReference<>(null);

    /** Lo llama la revisión de correo en segundo plano al terminar. */
    static void correoTerminado(String estado) {
        MainActivity a = instancia.get();
        if (a != null) a.avisarWeb("correoListo", estado, null);
    }

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        instancia = new WeakReference<>(this);

        FrameLayout raiz = new FrameLayout(this);
        web = new WebView(this);
        raiz.addView(web, new FrameLayout.LayoutParams(-1, -1));
        construirPanel(raiz);
        setContentView(raiz);

        configurar(web);
        final WebViewAssetLoader cargador = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return cargador.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                abrirFuera(u);
                return true;
            }
        });
        web.setWebChromeClient(new Selector());
        web.addJavascriptInterface(new Puente(), "Android");

        crearCanal();
        pedirPermisoAvisos();

        String ir = getIntent() != null ? getIntent().getStringExtra("ir") : null;
        if (estado != null) web.restoreState(estado);
        else web.loadUrl(ir != null ? INICIO + "#" + ir : INICIO);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String ir = intent.getStringExtra("ir");
        if (ir != null) avisarWeb("irA", ir, null);
    }

    @Override
    protected void onDestroy() {
        if (instancia.get() == this) instancia = new WeakReference<>(null);
        super.onDestroy();
    }

    // ---------- Navegador interno (portal) ----------

    private void construirPanel(FrameLayout raiz) {
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(Color.WHITE);
        panel.setVisibility(View.INVISIBLE);

        LinearLayout barra = new LinearLayout(this);
        barra.setOrientation(LinearLayout.VERTICAL);
        barra.setBackgroundColor(Color.rgb(0xFF, 0xF3, 0xDF));
        int p = dp(12);
        barra.setPadding(p, p, p, dp(6));

        panelTexto = new TextView(this);
        panelTexto.setTextColor(Color.rgb(0x1B, 0x24, 0x30));
        panelTexto.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        panelTexto.setTypeface(Typeface.DEFAULT_BOLD);
        barra.addView(panelTexto);

        panelBotones = new LinearLayout(this);
        panelBotones.setOrientation(LinearLayout.HORIZONTAL);
        panelBotones.setPadding(0, dp(6), 0, 0);
        barra.addView(panelBotones);

        View linea = new View(this);
        linea.setBackgroundColor(Color.rgb(0xC7, 0x77, 0x00));

        portal = new WebView(this);
        configurar(portal);
        String ua = portal.getSettings().getUserAgentString();
        portal.getSettings().setUserAgentString(ua.replace("; wv", ""));
        portal.getSettings().setSupportMultipleWindows(false);
        portal.getSettings().setLoadWithOverviewMode(true);
        portal.getSettings().setUseWideViewPort(true);
        portal.getSettings().setBuiltInZoomControls(true);
        portal.getSettings().setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(portal, true);

        portal.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String esquema = r.getUrl().getScheme();
                if ("http".equals(esquema) || "https".equals(esquema)) return false;
                abrirFuera(r.getUrl());
                return true;
            }

            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap icono) {
                avisarWeb("navEvento", "iniciada", url);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                CookieManager.getInstance().flush();
                avisarWeb("navEvento", "cargada", url);
            }

            @Override
            public void onReceivedClientCertRequest(WebView v, final ClientCertRequest req) {
                // Certificado digital instalado en el móvil (para LABORA, Cl@ve, etc.)
                KeyChain.choosePrivateKeyAlias(MainActivity.this, alias -> {
                    if (alias == null) { req.cancel(); return; }
                    new Thread(() -> {
                        try {
                            PrivateKey clave = KeyChain.getPrivateKey(MainActivity.this, alias);
                            X509Certificate[] cadena = KeyChain.getCertificateChain(MainActivity.this, alias);
                            if (clave != null && cadena != null) req.proceed(clave, cadena);
                            else req.cancel();
                        } catch (Exception e) {
                            req.cancel();
                        }
                    }).start();
                }, req.getKeyTypes(), req.getPrincipals(), req.getHost(), req.getPort(), null);
            }
        });
        portal.setWebChromeClient(new Selector());

        panel.addView(barra, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
        panel.addView(linea, new LinearLayout.LayoutParams(-1, dp(2)));
        panel.addView(portal, new LinearLayout.LayoutParams(-1, 0, 1f));
        raiz.addView(panel, new FrameLayout.LayoutParams(-1, -1));
    }

    private void mostrarPanel(String texto, String botonesJson) {
        panelTexto.setText(texto);
        panelBotones.removeAllViews();
        try {
            JSONArray lista = new JSONArray(botonesJson);
            for (int i = 0; i < lista.length(); i++) {
                JSONObject b = lista.getJSONObject(i);
                final String id = b.optString("id");
                boolean principal = b.optBoolean("principal", i == 0);
                Button boton = new Button(this);
                boton.setText(b.optString("texto"));
                boton.setAllCaps(false);
                boton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
                boton.setTextColor(principal ? Color.WHITE : PRIMARIO);
                boton.setBackgroundColor(principal ? PRIMARIO : Color.WHITE);
                boton.setOnClickListener(x -> avisarWeb("panelBoton", id, null));
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1f);
                lp.setMargins(dp(3), dp(3), dp(3), dp(3));
                panelBotones.addView(boton, lp);
            }
        } catch (Exception e) {
            // sin botones
        }
        panel.setVisibility(View.VISIBLE);
    }

    private void ocultarPanel() {
        panel.setVisibility(View.INVISIBLE);
        hideKeyboard();
    }

    private void hideKeyboard() {
        View v = getCurrentFocus();
        if (v != null) {
            android.view.inputmethod.InputMethodManager imm =
                    (android.view.inputmethod.InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            imm.hideSoftInputFromWindow(v.getWindowToken(), 0);
        }
    }

    /** Llama a una función de la interfaz: window.funcion(a, b) */
    private void avisarWeb(String funcion, String a, String b) {
        final String js = "window." + funcion + " && window." + funcion + "(" + JSONObject.quote(a) + ","
                + (b == null ? "null" : JSONObject.quote(b)) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    // ---------- Comunes ----------

    private void configurar(WebView v) {
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
    }

    private int dp(int valor) {
        return Math.round(valor * getResources().getDisplayMetrics().density);
    }

    /** Selector de archivos y cámara, usado por las dos vistas web. */
    private class Selector extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (esperaArchivos != null) esperaArchivos.onReceiveValue(null);
            esperaArchivos = cb;
            try {
                if (p.isCaptureEnabled()) {
                    File dir = new File(getCacheDir(), "fotos");
                    dir.mkdirs();
                    File f = new File(dir, "foto_" + System.currentTimeMillis() + ".jpg");
                    fotoUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", f);
                    Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    i.putExtra(MediaStore.EXTRA_OUTPUT, fotoUri);
                    i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(i, REQ_CAMARA);
                } else {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    if (v == web) {
                        i.setType("*/*");
                        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/*"});
                    } else {
                        i.setType("*/*");
                    }
                    i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                    startActivityForResult(Intent.createChooser(i, "Elige el archivo"), REQ_ARCHIVO);
                }
            } catch (Exception e) {
                esperaArchivos = null;
                cb.onReceiveValue(null);
                aviso("No se pudo abrir: " + e.getMessage());
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int req, int resultado, Intent datos) {
        super.onActivityResult(req, resultado, datos);
        if (esperaArchivos == null) return;
        Uri[] lista = null;
        if (resultado == RESULT_OK) {
            if (req == REQ_CAMARA) {
                lista = new Uri[]{fotoUri};
            } else if (datos != null) {
                ClipData clip = datos.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    lista = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) lista[i] = clip.getItemAt(i).getUri();
                } else if (datos.getData() != null) {
                    lista = new Uri[]{datos.getData()};
                }
            }
        }
        esperaArchivos.onReceiveValue(lista);
        esperaArchivos = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) avisarWeb("alVolver", "", null);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (panel.getVisibility() == View.VISIBLE) {
            if (portal.canGoBack()) portal.goBack();
            else avisarWeb("panelBoton", "__atras", null);
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void abrirFuera(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception e) {
            aviso("No hay ninguna app para abrir esto");
        }
    }

    private void aviso(String texto) {
        Toast.makeText(this, texto, Toast.LENGTH_LONG).show();
    }

    // ---------- Avisos (notificaciones) ----------

    private void crearCanal() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CANAL, "Avisos de empleo", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("Ofertas nuevas, accesos pendientes y respuestas de empresas");
            getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
    }

    private void pedirPermisoAvisos() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 9);
        }
    }

    private void notificar(String titulo, String texto) {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CANAL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new Notification.BigTextStyle().bigText(texto))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        try {
            getSystemService(NotificationManager.class).notify(numAviso++, n);
        } catch (SecurityException e) {
            // sin permiso de avisos
        }
    }

    // ---------- Impresión / PDF ----------

    private void imprimir(String html, String nombre) {
        final WebView v = new WebView(this);
        vistaImpresion = v;
        final boolean[] hecho = {false};
        v.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView vista, String url) {
                if (hecho[0]) return;
                hecho[0] = true;
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adaptador = vista.createPrintDocumentAdapter(nombre);
                PrintAttributes atributos = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();
                pm.print(nombre, adaptador, atributos);
            }
        });
        v.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    // ---------- Correo (IMAP para comprobar/leer, SMTP para enviar avisos) ----------

    private void tareaCorreo(final String id, final String accion, final String cfgJson,
                             final String para, final String asunto, final String cuerpo) {
        new Thread(() -> {
            String error = null;
            try {
                JSONObject c = new JSONObject(cfgJson);
                final String usuario = c.getString("usuario");
                final String clave = c.getString("clave").replace(" ", "");
                if ("probar".equals(accion)) {
                    String imap = c.optString("imap", "imap.gmail.com");
                    Properties p = new Properties();
                    p.put("mail.store.protocol", "imaps");
                    p.put("mail.imaps.host", imap);
                    p.put("mail.imaps.port", "993");
                    p.put("mail.imaps.ssl.enable", "true");
                    p.put("mail.imaps.connectiontimeout", "20000");
                    p.put("mail.imaps.timeout", "20000");
                    Store st = Session.getInstance(p).getStore("imaps");
                    st.connect(imap, 993, usuario, clave);
                    st.close();
                } else {
                    String smtp = c.optString("smtp", "smtp.gmail.com");
                    Properties p = new Properties();
                    p.put("mail.smtp.auth", "true");
                    p.put("mail.smtp.starttls.enable", "true");
                    p.put("mail.smtp.starttls.required", "true");
                    p.put("mail.smtp.host", smtp);
                    p.put("mail.smtp.port", "587");
                    p.put("mail.smtp.connectiontimeout", "20000");
                    p.put("mail.smtp.timeout", "20000");
                    Session s = Session.getInstance(p, new javax.mail.Authenticator() {
                        @Override
                        protected PasswordAuthentication getPasswordAuthentication() {
                            return new PasswordAuthentication(usuario, clave);
                        }
                    });
                    MimeMessage m = new MimeMessage(s);
                    m.setFrom(new InternetAddress(usuario, "Mi Empleo", "UTF-8"));
                    m.setRecipients(Message.RecipientType.TO, InternetAddress.parse(para));
                    m.setSubject(asunto, "UTF-8");
                    m.setText(cuerpo, "UTF-8");
                    Transport.send(m);
                }
            } catch (AuthenticationFailedException e) {
                error = "auth: " + e.getMessage();
            } catch (Throwable e) {
                error = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            String res;
            try {
                JSONObject r = new JSONObject();
                r.put("ok", error == null);
                if (error != null) r.put("error", error);
                res = r.toString();
            } catch (Exception e) {
                res = "{\"ok\":false}";
            }
            avisarWeb("correoResultado", id, res);
        }).start();
    }

    // ---------- Funciones que la interfaz puede llamar: window.Android.xxx() ----------

    private class Puente {
        @JavascriptInterface
        public void guardarPdf(final String html, final String nombre) {
            runOnUiThread(() -> imprimir(html, nombre));
        }

        @JavascriptInterface
        public void compartirTexto(final String texto) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, texto);
                startActivity(Intent.createChooser(i, "Compartir"));
            });
        }

        @JavascriptInterface
        public void abrirEnlace(final String url) {
            runOnUiThread(() -> abrirFuera(Uri.parse(url)));
        }

        @JavascriptInterface
        public void aviso(final String texto) {
            runOnUiThread(() -> MainActivity.this.aviso(texto));
        }

        @JavascriptInterface
        public void notificar(final String titulo, final String texto) {
            runOnUiThread(() -> MainActivity.this.notificar(titulo, texto));
        }

        @JavascriptInterface
        public void correo(String id, String accion, String cfg, String para, String asunto, String cuerpo) {
            tareaCorreo(id, accion, cfg, para, asunto, cuerpo);
        }

        // --- correo en segundo plano ---

        @JavascriptInterface
        public void guardarConfigFondo(String json) {
            getSharedPreferences(TrabajoCorreo.PREFS, MODE_PRIVATE).edit().putString("config", json).apply();
        }

        @JavascriptInterface
        public void programarCorreo(int minutos) {
            TrabajoCorreo.programar(getApplicationContext(), minutos);
        }

        @JavascriptInterface
        public void cancelarCorreo() {
            TrabajoCorreo.cancelar(getApplicationContext());
        }

        @JavascriptInterface
        public void correoRevisarAhora() {
            TrabajoCorreo.ahora(getApplicationContext());
        }

        @JavascriptInterface
        public String tomarCorreos() {
            return TrabajoCorreo.tomarCola(getApplicationContext());
        }

        @JavascriptInterface
        public String estadoCorreo() {
            return getSharedPreferences(TrabajoCorreo.PREFS, MODE_PRIVATE).getString("estado", "{}");
        }

        @JavascriptInterface
        public void reiniciarCorreo() {
            getSharedPreferences(TrabajoCorreo.PREFS, MODE_PRIVATE).edit().remove("ultimoUid").apply();
        }

        @JavascriptInterface
        public boolean sinAhorro() {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
        }

        @JavascriptInterface
        public void pedirSinAhorro() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    i.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                    } catch (Exception e2) {
                        MainActivity.this.aviso("Abre Ajustes > Batería y quita Mi Empleo del ahorro de energía");
                    }
                }
            });
        }

        @JavascriptInterface
        public void calendario(final String titulo, final double inicio, final String lugar, final String nota) {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_INSERT).setData(android.provider.CalendarContract.Events.CONTENT_URI);
                    i.putExtra(android.provider.CalendarContract.Events.TITLE, titulo);
                    if (inicio > 0) {
                        i.putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME, (long) inicio);
                        i.putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME, (long) inicio + 3600000L);
                    }
                    i.putExtra(android.provider.CalendarContract.Events.EVENT_LOCATION, lugar);
                    i.putExtra(android.provider.CalendarContract.Events.DESCRIPTION, nota);
                    startActivity(i);
                } catch (Exception e) {
                    MainActivity.this.aviso("No hay app de calendario");
                }
            });
        }

        @JavascriptInterface
        public void correoConAdjunto(final String id, final String cfg, final String para, final String asunto,
                                     final String cuerpo, final String adjuntoB64, final String nombre) {
            new Thread(() -> {
                String error = null;
                try {
                    Correo.enviar(new JSONObject(cfg), para, asunto, cuerpo, adjuntoB64, nombre);
                } catch (Throwable e) {
                    error = e.getClass().getSimpleName() + ": " + e.getMessage();
                }
                String res;
                try {
                    JSONObject r = new JSONObject();
                    r.put("ok", error == null);
                    if (error != null) r.put("error", error);
                    res = r.toString();
                } catch (Exception e) {
                    res = "{\"ok\":false}";
                }
                avisarWeb("correoResultado", id, res);
            }).start();
        }

        // --- CV originales guardados en el móvil ---

        private File archivoCv(String nombre) {
            File d = new File(getFilesDir(), "cvs");
            d.mkdirs();
            return new File(d, nombre.replaceAll("[^A-Za-z0-9_.-]", "_"));
        }

        @JavascriptInterface
        public boolean guardarArchivo(String nombre, String b64) {
            try (java.io.FileOutputStream o = new java.io.FileOutputStream(archivoCv(nombre))) {
                o.write(android.util.Base64.decode(b64, android.util.Base64.DEFAULT));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String leerArchivo(String nombre) {
            try {
                File f = archivoCv(nombre);
                byte[] datos = new byte[(int) f.length()];
                try (java.io.FileInputStream i = new java.io.FileInputStream(f)) {
                    int leidos = 0;
                    while (leidos < datos.length) {
                        int n = i.read(datos, leidos, datos.length - leidos);
                        if (n < 0) break;
                        leidos += n;
                    }
                }
                return android.util.Base64.encodeToString(datos, android.util.Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void borrarArchivo(String nombre) {
            //noinspection ResultOfMethodCallIgnored
            archivoCv(nombre).delete();
        }

        @JavascriptInterface
        public void abrirArchivo(final String nombre) {
            runOnUiThread(() -> {
                try {
                    Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", archivoCv(nombre));
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(u, "application/pdf");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Abrir CV"));
                } catch (Exception e) {
                    MainActivity.this.aviso("No hay ninguna app para abrir PDF");
                }
            });
        }

        @JavascriptInterface
        public void programarAviso(String id, double cuando, String titulo, String texto) {
            TrabajoAviso.programar(getApplicationContext(), id, (long) cuando, titulo, texto);
        }

        @JavascriptInterface
        public void cancelarAviso(String id) {
            TrabajoAviso.cancelar(getApplicationContext(), id);
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        // --- navegador interno ---

        @JavascriptInterface
        public void navAbrir(final String url) {
            runOnUiThread(() -> portal.loadUrl(url));
        }

        @JavascriptInterface
        public void navEjecutar(final String id, final String js) {
            runOnUiThread(() -> portal.evaluateJavascript(js, resultado -> {
                String r = resultado == null ? "null" : resultado;
                web.evaluateJavascript("window.navResultado && window.navResultado(" + JSONObject.quote(id) + "," + r + ")", null);
            }));
        }

        @JavascriptInterface
        public void navMostrar(final String texto, final String botonesJson) {
            runOnUiThread(() -> mostrarPanel(texto, botonesJson));
        }

        @JavascriptInterface
        public void navOcultar() {
            runOnUiThread(MainActivity.this::ocultarPanel);
        }

        @JavascriptInterface
        public void navParar() {
            runOnUiThread(() -> portal.stopLoading());
        }

        @JavascriptInterface
        public void navOlvidarSesiones() {
            runOnUiThread(() -> {
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                portal.clearCache(true);
            });
        }
    }
}
