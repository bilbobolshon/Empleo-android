package es.fran.empleo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Properties;

import javax.mail.BodyPart;
import javax.mail.FetchProfile;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Multipart;
import javax.mail.Part;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.UIDFolder;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;
import javax.mail.search.ComparisonTerm;
import javax.mail.search.ReceivedDateTerm;

import com.sun.mail.imap.IMAPFolder;

/** Operaciones de correo: comprobar acceso, enviar avisos y leer los correos nuevos de la bandeja. */
final class Correo {

    private Correo() {}

    static Store abrir(JSONObject c) throws Exception {
        String imap = c.optString("imap", "imap.gmail.com");
        Properties p = new Properties();
        p.put("mail.store.protocol", "imaps");
        p.put("mail.imaps.host", imap);
        p.put("mail.imaps.port", "993");
        p.put("mail.imaps.ssl.enable", "true");
        p.put("mail.imaps.connectiontimeout", "20000");
        p.put("mail.imaps.timeout", "30000");
        Store st = Session.getInstance(p).getStore("imaps");
        st.connect(imap, 993, c.getString("usuario"), c.getString("clave").replace(" ", ""));
        return st;
    }

    static void probar(JSONObject c) throws Exception {
        abrir(c).close();
    }

    static void enviar(JSONObject c, String para, String asunto, String cuerpo) throws Exception {
        final String usuario = c.getString("usuario");
        final String clave = c.getString("clave").replace(" ", "");
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

    /** Resultado de leer la bandeja: correos nuevos y el último número de correo visto. */
    static final class Lectura {
        final JSONArray correos = new JSONArray();
        long ultimoUid;
    }

    /**
     * Lee (sin marcar como leídos, sin mover nada) los correos de la bandeja de entrada
     * posteriores a ultimoUid. La primera vez (ultimoUid = 0) mira los últimos días.
     */
    static Lectura leer(JSONObject c, long ultimoUid, int diasPrimeraVez, int maximo) throws Exception {
        Lectura res = new Lectura();
        Store st = abrir(c);
        try {
            IMAPFolder f = (IMAPFolder) st.getFolder("INBOX");
            f.open(Folder.READ_ONLY);
            long siguiente = f.getUIDNext();
            Message[] msgs;
            if (ultimoUid <= 0) {
                Date desde = new Date(System.currentTimeMillis() - diasPrimeraVez * 86400000L);
                msgs = f.search(new ReceivedDateTerm(ComparisonTerm.GE, desde));
            } else {
                msgs = f.getMessagesByUID(ultimoUid + 1, UIDFolder.LASTUID);
            }
            FetchProfile fp = new FetchProfile();
            fp.add(FetchProfile.Item.ENVELOPE);
            fp.add(UIDFolder.FetchProfileItem.UID);
            f.fetch(msgs, fp);

            List<Message> lista = new ArrayList<>(Arrays.asList(msgs));
            lista.sort(Comparator.comparingLong(m -> uid(f, m)));
            if (lista.size() > maximo) lista = lista.subList(lista.size() - maximo, lista.size());

            long mayor = ultimoUid;
            for (Message m : lista) {
                long u = uid(f, m);
                if (u <= ultimoUid) continue;
                mayor = Math.max(mayor, u);
                JSONObject o = new JSONObject();
                o.put("uid", u);
                o.put("de", m.getFrom() != null && m.getFrom().length > 0 ? m.getFrom()[0].toString() : "");
                o.put("asunto", m.getSubject() == null ? "" : m.getSubject());
                Date fecha = m.getReceivedDate() != null ? m.getReceivedDate() : m.getSentDate();
                o.put("fecha", fecha == null ? 0 : fecha.getTime());
                o.put("texto", recortar(texto(m), 2500));
                res.correos.put(o);
            }
            res.ultimoUid = Math.max(mayor, siguiente > 0 ? siguiente - 1 : mayor);
            f.close(false);
        } finally {
            st.close();
        }
        return res;
    }

    private static long uid(IMAPFolder f, Message m) {
        try { return f.getUID(m); } catch (Exception e) { return 0; }
    }

    private static String recortar(String t, int max) {
        if (t == null) return "";
        t = t.replaceAll("[ \\t]+", " ").replaceAll("\\n\\s*\\n+", "\n").trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** Texto del correo: prefiere texto plano; si solo hay HTML, le quita las etiquetas. */
    static String texto(Part p) {
        try {
            if (p.isMimeType("text/plain")) return String.valueOf(p.getContent());
            if (p.isMimeType("text/html")) return quitarHtml(String.valueOf(p.getContent()));
            if (p.isMimeType("multipart/*")) {
                Multipart mp = (Multipart) p.getContent();
                String html = null;
                for (int i = 0; i < mp.getCount(); i++) {
                    BodyPart b = mp.getBodyPart(i);
                    if (Part.ATTACHMENT.equalsIgnoreCase(b.getDisposition())) continue;
                    if (b.isMimeType("text/plain")) return String.valueOf(b.getContent());
                    if (b.isMimeType("text/html") && html == null) html = quitarHtml(String.valueOf(b.getContent()));
                    if (b.isMimeType("multipart/*")) {
                        String t = texto(b);
                        if (t != null && !t.isEmpty()) return t;
                    }
                }
                return html == null ? "" : html;
            }
        } catch (Exception e) {
            // cuerpo ilegible
        }
        return "";
    }

    private static String quitarHtml(String h) {
        return h.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", " ")
                .replaceAll("(?i)<br\\s*/?>|</p>|</div>|</tr>|</li>", "\n")
                .replaceAll("(?i)<a [^>]*href=\"([^\"]+)\"[^>]*>", " [$1] ")
                .replaceAll("<[^>]+>", " ")
                .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&#39;", "'");
    }
}
