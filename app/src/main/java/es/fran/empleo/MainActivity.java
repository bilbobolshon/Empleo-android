package es.fran.empleo;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;

/**
 * Pantalla principal: la interfaz de la app es una página web local (assets/www)
 * mostrada dentro de un WebView. Aquí solo va lo que necesita el sistema Android:
 * elegir archivos, hacer fotos, imprimir/guardar PDF y compartir.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String INICIO = "https://" + HOST + "/assets/www/index.html";
    private static final int REQ_ARCHIVO = 1;
    private static final int REQ_CAMARA = 2;

    private WebView web;
    private WebView vistaImpresion; // se guarda para que no se libere mientras imprime
    private ValueCallback<Uri[]> esperaArchivos;
    private Uri fotoUri;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);

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

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (esperaArchivos != null) esperaArchivos.onReceiveValue(null);
                esperaArchivos = cb;
                try {
                    if (p.isCaptureEnabled()) {
                        File dir = new File(getCacheDir(), "fotos");
                        dir.mkdirs();
                        File f = new File(dir, "foto_" + System.currentTimeMillis() + ".jpg");
                        fotoUri = FileProvider.getUriForFile(MainActivity.this,
                                getPackageName() + ".fileprovider", f);
                        Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        i.putExtra(MediaStore.EXTRA_OUTPUT, fotoUri);
                        i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivityForResult(i, REQ_CAMARA);
                    } else {
                        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                        i.addCategory(Intent.CATEGORY_OPENABLE);
                        i.setType("*/*");
                        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/*"});
                        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                        startActivityForResult(Intent.createChooser(i, "Elige tu CV"), REQ_ARCHIVO);
                    }
                } catch (Exception e) {
                    esperaArchivos = null;
                    cb.onReceiveValue(null);
                    aviso("No se pudo abrir: " + e.getMessage());
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Puente(), "Android");

        if (estado != null) {
            web.restoreState(estado);
        } else {
            web.loadUrl(INICIO);
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
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
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

    /** Abre el diálogo de Android para guardar el CV como PDF (o imprimirlo). */
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

    /** Funciones que la página puede llamar con window.Android.xxx() */
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
        public String version() {
            return BuildConfig.VERSION_NAME;
        }
    }
}
