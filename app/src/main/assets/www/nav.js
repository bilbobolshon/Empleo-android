'use strict';
// Navegador interno: abre páginas, las lee, detecta accesos (inicio de sesión, captcha,
// Cl@ve, códigos) y pasa el control al usuario con una barra de instrucciones.

const Nav = (() => {
  let esperasCarga = [];
  const resultados = {};
  let esperaBoton = null;
  let botonSuelto = null;   // botón pulsado cuando nadie estaba esperando
  let contador = 0;
  let ultimaUrl = '';
  let cadena = Promise.resolve();
  let ocupado = 0;

  // Llamadas desde Android
  window.navEvento = (tipo, url) => {
    ultimaUrl = url || ultimaUrl;
    if (tipo === 'cargada') {
      const w = esperasCarga;
      esperasCarga = [];
      w.forEach((f) => f(url));
    }
  };
  window.navResultado = (id, r) => {
    const f = resultados[id];
    delete resultados[id];
    if (f) f(r);
  };
  window.panelBoton = (id) => {
    if (id === '__atras') id = 'cancelar';
    const f = esperaBoton;
    esperaBoton = null;
    if (f) f(id); else botonSuelto = id;
  };

  const disponible = () => !!(window.Android && window.Android.navAbrir);
  const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

  function comprobar() {
    if (!disponible()) throw new Error('El navegador interno solo funciona dentro de la app del móvil.');
  }

  async function abrir(url, espera) {
    comprobar();
    const p = new Promise((ok) => { esperasCarga.push(ok); setTimeout(() => ok(null), espera || 40000); });
    window.Android.navAbrir(url);
    const r = await p;
    await dormir(2500); // da tiempo a que la web termine de pintar su contenido
    return r;
  }

  function ejecutar(js, espera) {
    comprobar();
    return new Promise((ok) => {
      const id = 'r' + (++contador);
      resultados[id] = ok;
      setTimeout(() => { if (resultados[id]) { delete resultados[id]; ok(null); } }, espera || 15000);
      window.Android.navEjecutar(id, js);
    });
  }

  async function ejecutarJson(js) {
    const r = await ejecutar(js);
    if (typeof r !== 'string') return null;
    try { return JSON.parse(r); } catch (e) { return null; }
  }

  // Muestra el navegador con una barra de instrucciones y botones (no espera)
  function panel(texto, botones) {
    comprobar();
    window.Android.navMostrar(texto, JSON.stringify(botones || []));
  }

  // Espera a que el usuario pulse un botón de la barra
  function esperarBoton() {
    if (esperaBoton) esperaBoton('cancelar');
    if (botonSuelto) { const b = botonSuelto; botonSuelto = null; return Promise.resolve(b); }
    return new Promise((ok) => { esperaBoton = ok; });
  }

  function tomarBotonSuelto() { const b = botonSuelto; botonSuelto = null; return b; }

  function ocultar() {
    if (disponible()) window.Android.navOcultar();
    botonSuelto = null;
  }

  // Espera a que termine de cargar una página nueva (tras pulsar un botón o enlace)
  async function esperarCarga(espera) {
    const r = await new Promise((ok) => { esperasCarga.push(ok); setTimeout(() => ok(null), espera || 12000); });
    await dormir(2000);
    return r;
  }

  async function analizar() {
    return (await ejecutarJson(JS_ANALIZAR)) || { url: ultimaUrl, titulo: '', texto: '', obstaculo: null, enlaces: [], campos: 0 };
  }

  // Ejecuta las tareas del navegador de una en una
  function cola(fn) {
    ocupado++;
    const p = cadena.then(fn);
    cadena = p.catch(() => {}).then(() => { ocupado--; });
    return p;
  }

  return {
    disponible, abrir, ejecutar, ejecutarJson, panel, esperarBoton, tomarBotonSuelto, ocultar, analizar, cola, esperarCarga,
    get ocupado() { return ocupado > 0; },
    get url() { return ultimaUrl; }
  };
})();

// ---------- Scripts que se ejecutan dentro de la web visitada ----------

const JS_ANALIZAR = `(function(){
  function vis(e){ try{ var r=e.getBoundingClientRect(), s=getComputedStyle(e);
    return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; }catch(x){ return false; } }
  var todo=[].slice.call.bind([].slice);
  var texto=(document.body && (document.body.innerText || document.body.textContent)) || '';
  var host=location.host;
  var obst=null;
  if(/clave\\.gob\\.es/i.test(host)) obst='clave';
  if(!obst && todo(document.querySelectorAll('input[type=password]')).some(vis)) obst='login';
  var cap=document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="turnstile"],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile');
  if(cap && vis(cap)) obst='captcha';
  if(!obst && /verify you are human|no soy un robot|comprobando que eres humano|checking your browser|verifica que eres humano/i.test(texto.slice(0,3000))) obst='captcha';
  if(!obst && todo(document.querySelectorAll('input[autocomplete="one-time-code"],input[name*="otp" i],input[id*="otp" i],input[name*="codigo" i]')).some(vis)) obst='codigo';
  var enl=todo(document.querySelectorAll('a[href]')).filter(vis).slice(0,400).map(function(a){
    return { t:(a.innerText||a.textContent||a.title||'').trim().replace(/\\s+/g,' ').slice(0,120), h:a.href };
  }).filter(function(x){ return x.t && /^https?:/.test(x.h); });
  var campos=todo(document.querySelectorAll('input,select,textarea')).filter(function(e){
    return vis(e) && !/hidden|submit|button|image|reset/.test(e.type); }).length;
  return JSON.stringify({ url:location.href, titulo:document.title,
    texto:texto.replace(/\\n{3,}/g,'\\n\\n').slice(0,40000), obstaculo:obst, enlaces:enl, campos:campos });
})()`;

const JS_FORMULARIO = `(function(){
  function vis(e){ try{ var r=e.getBoundingClientRect(), s=getComputedStyle(e);
    return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; }catch(x){ return false; } }
  function etiqueta(e){
    var t='';
    if(e.id){ try{ var l=document.querySelector('label[for="'+CSS.escape(e.id)+'"]'); if(l) t=l.innerText||l.textContent; }catch(x){} }
    if(!t){ var p=e.closest('label'); if(p) t=p.innerText||p.textContent; }
    if(!t) t=e.getAttribute('aria-label')||e.placeholder||e.title||'';
    if(!t){ var c=e.closest('div,td,li,p,fieldset'); if(c) t=c.innerText||c.textContent; }
    return (t||'').trim().replace(/\\s+/g,' ').slice(0,150);
  }
  var lista=[], n=0, grupos={};
  [].slice.call(document.querySelectorAll('input,select,textarea')).forEach(function(e){
    var tipo = e.tagName==='SELECT' ? 'select' : (e.tagName==='TEXTAREA' ? 'textarea' : (e.type||'text'));
    if(/hidden|submit|button|image|reset|password|search/.test(tipo)) return;
    if(tipo!=='radio' && tipo!=='checkbox' && tipo!=='file' && !vis(e)) return;
    if(e.disabled) return;
    if(tipo==='radio'){
      var g=e.name||('radio'+n), op=etiqueta(e)||e.value;
      e.setAttribute('data-me-op', op);
      if(grupos[g]!==undefined){ lista[grupos[g]].opciones.push(op); e.setAttribute('data-me-i', grupos[g]); return; }
      grupos[g]=n;
      var fs=e.closest('fieldset'), pregunta=fs&&fs.querySelector('legend') ? (fs.querySelector('legend').innerText||fs.querySelector('legend').textContent||'').trim() : '';
      lista.push({ i:n, tipo:'radio', nombre:e.name||'', etiqueta:pregunta||op, opciones:[op], requerido:!!e.required });
      e.setAttribute('data-me-i', n); n++; return;
    }
    var c={ i:n, tipo:tipo, nombre:e.name||e.id||'', etiqueta:etiqueta(e), requerido:!!e.required };
    if(tipo==='checkbox') c.valor=e.checked; else if(tipo!=='file') c.valor=e.value;
    if(tipo==='select') c.opciones=[].slice.call(e.options).map(function(o){ return o.text.trim(); }).slice(0,80);
    e.setAttribute('data-me-i', n);
    lista.push(c); n++;
  });
  return JSON.stringify(lista.slice(0,120));
})()`;

function jsRellenar(valores) {
  return `(function(v){
  var n=0;
  function poner(e,val){
    var proto = e.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var d=Object.getOwnPropertyDescriptor(proto,'value');
    if(d && d.set) d.set.call(e,val); else e.value=val;
    ['input','change','blur'].forEach(function(t){ e.dispatchEvent(new Event(t,{bubbles:true})); });
  }
  v.forEach(function(x){
    var els=document.querySelectorAll('[data-me-i="'+x.i+'"]'); if(!els.length) return;
    var e=els[0], val=String(x.valor==null?'':x.valor), bajo=val.toLowerCase().trim();
    try{
      if(e.tagName==='SELECT'){
        var ops=[].slice.call(e.options);
        var o=ops.find(function(o){ return o.text.trim().toLowerCase()===bajo; }) ||
              ops.find(function(o){ return bajo && o.text.toLowerCase().indexOf(bajo)>=0; });
        if(o){ e.value=o.value; e.dispatchEvent(new Event('change',{bubbles:true})); n++; }
      } else if(e.type==='radio'){
        var r=[].slice.call(els).find(function(r){ return (r.getAttribute('data-me-op')||'').toLowerCase().trim()===bajo; });
        if(r){ r.click(); n++; }
      } else if(e.type==='checkbox'){
        var q = x.valor===true || /^(s[ií]|true|1)$/i.test(val);
        if(e.checked!==q) e.click(); n++;
      } else if(e.type!=='file' && val){
        poner(e,val); n++;
      }
    }catch(err){}
  });
  return JSON.stringify({ rellenados:n });
})(${JSON.stringify(valores || [])})`;
}

// ---------- Textos para pasar el control ----------

function textoObstaculo(tipo, nombre, intento) {
  const donde = nombre ? ' en ' + nombre : '';
  const base = {
    clave: 'Te toca: identifícate con Cl@ve o con tu certificado digital' + donde + '.',
    login: 'Te toca: inicia sesión' + donde + ' (o crea tu cuenta si aún no la tienes).',
    captcha: 'Te toca: resuelve la verificación («no soy un robot»)' + donde + '.',
    codigo: 'Te toca: escribe el código que te han enviado por SMS o correo' + donde + '.'
  }[tipo] || 'Te toca: completa este paso' + donde + '.';
  return (intento ? 'Parece que aún falta un paso. ' : '') + base +
    '\nCuando termines, pulsa «Ya está, continúa» y sigo yo.';
}

const BOTONES_ACCESO = [
  { id: 'continuar', texto: 'Ya está, continúa', principal: true },
  { id: 'cancelar', texto: 'Ahora no' }
];

function mismaPagina(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    return x.host === y.host && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '');
  } catch (e) { return false; }
}

// Se asegura de que no hay ningún acceso pendiente en la página actual.
// Si lo hay, pasa el control al usuario y lo recupera cuando pulsa «Ya está, continúa».
// Si se indica url, al terminar vuelve a esa página.
async function resolverAcceso(url, nombre, forzar) {
  let a = await Nav.analizar();
  if (!a.obstaculo && !forzar) return true;
  const tipo = a.obstaculo || 'login';
  for (let intento = 0; intento < 6; intento++) {
    Nav.panel(textoObstaculo(a.obstaculo || tipo, nombre, intento), BOTONES_ACCESO);
    const r = await Nav.esperarBoton();
    if (r !== 'continuar') return false;
    Nav.panel('Comprobando que ya estás dentro…', []);
    a = await Nav.analizar();
    if (a.obstaculo) continue;
    if (url && !mismaPagina(a.url, url)) {
      await Nav.abrir(url);
      a = await Nav.analizar();
      if (a.obstaculo) continue;
    }
    return true;
  }
  return false;
}
