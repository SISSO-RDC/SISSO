// ============================================================
// SISSO - Delegador de eventos compatible con CSP estricta.
//
// CREADO en Auditoria N.18 (hallazgos C18-02 y G18-08, P0/P1): las
// paginas usaban atributos de evento en linea (onclick=, onchange=,
// oninput=) y bloques <script> en linea, lo que obligaba a mantener
// `script-src 'unsafe-inline'` en la Content-Security-Policy de TODAS
// las paginas internas. Con 'unsafe-inline' la CSP no frena un XSS que
// logre inyectar un <script> o un onerror=, y ese XSS podria leer el
// access token de sessionStorage (ver docs/DECISIONES_SEGURIDAD_
// PENDIENTES.md). Retirar 'unsafe-inline' de script-src es la
// mitigacion compensatoria mas fuerte disponible sin cambiar la
// arquitectura de sesion.
//
// Como funciona: los atributos onclick/onchange/oninput se renombraron
// a data-on-click / data-on-change / data-on-input, con el MISMO texto
// de expresion. Este archivo escucha click/change/input en `document`
// (delegacion, asi tambien funciona para HTML generado dinamicamente
// con innerHTML) y ejecuta la expresion con un interprete MINIMO y
// cerrado -- NO usa eval(), new Function() ni setTimeout(string), que
// la CSP sin 'unsafe-eval' bloquearia de todos modos.
//
// Gramatica soportada (todo lo demas se rechaza y se registra en
// consola, sin ejecutar nada -- falla cerrado):
//
//   expresion  := sentencia { ';' sentencia } [';']
//   sentencia  := 'return false'
//               | 'event.stopPropagation()' | 'event.preventDefault()'
//               | ['return'] funcion '(' [argumento {',' argumento}] ')'
//   funcion    := identificador { '.' identificador }
//   argumento  := 'texto' | "texto" | numero | true | false | null
//               | undefined | this | this.value | this.checked | event
//
// Reglas de seguridad:
//  - La funcion se resuelve SOLO desde `window` y debe ser una funcion
//    escrita por la aplicacion: se rechazan las funciones nativas
//    (eval, alert, open, etc.) y los nombres peligrosos. Un atacante
//    que solo pudiera inyectar HTML (no scripts) no gana capacidad de
//    ejecucion arbitraria, solo podria invocar funciones de la propia
//    pagina, igual que ya podria con un enlace o boton legitimo.
//  - Semantica identica a los atributos en linea: `this` es el
//    elemento que lleva el atributo, `event` es el evento nativo, el
//    evento "burbujea" por los ancestros que tambien tengan
//    data-on-<tipo> (se respeta event.stopPropagation()), y
//    `return false` / una funcion que devuelve false cancelan la
//    accion por defecto (igual que `return false` en onclick).
//
// Este archivo debe cargarse en TODA pagina, antes que api.js.
// ============================================================
(function () {
  'use strict';

  const TIPOS = ['click', 'change', 'input'];
  const PROHIBIDOS = new Set([
    'eval', 'Function', 'setTimeout', 'setInterval', 'execScript',
    'constructor', 'prototype', '__proto__', 'document', 'location',
    'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest',
    'alert', 'confirm', 'prompt', 'open', 'print', 'close', 'postMessage',
    'importScripts', 'history', 'navigator', 'parent', 'top', 'opener',
  ]);
  const cache = new Map();

  // Convierte un literal de texto JS ('...' o "...") a su valor real,
  // interpretando los escapes que produce escaparValorOnclickJs
  // (\\ y \') mas los habituales (\", \n, \t, \uXXXX, \xXX).
  function leerTexto(src, i) {
    const comilla = src[i];
    let out = '';
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        const n = src[i + 1];
        if (n === 'n') { out += '\n'; i += 2; }
        else if (n === 't') { out += '\t'; i += 2; }
        else if (n === 'r') { out += '\r'; i += 2; }
        else if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(src.substr(i + 2, 4))) {
          out += String.fromCharCode(parseInt(src.substr(i + 2, 4), 16)); i += 6;
        } else if (n === 'x' && /^[0-9a-fA-F]{2}$/.test(src.substr(i + 2, 2))) {
          out += String.fromCharCode(parseInt(src.substr(i + 2, 2), 16)); i += 4;
        } else { out += n; i += 2; }
      } else if (c === comilla) {
        return { valor: out, fin: i + 1 };
      } else { out += c; i++; }
    }
    throw new Error('texto sin cerrar');
  }

  function saltarEspacios(src, i) {
    while (i < src.length && /\s/.test(src[i])) i++;
    return i;
  }

  // Devuelve una lista de sentencias ya analizadas.
  function analizar(src) {
    const sentencias = [];
    let i = saltarEspacios(src, 0);
    while (i < src.length) {
      if (src[i] === ';') { i = saltarEspacios(src, i + 1); continue; }
      let retorna = false;
      if (/^return\b/.test(src.slice(i))) {
        retorna = true;
        i = saltarEspacios(src, i + 6);
      }
      if (/^false\b/.test(src.slice(i)) && retorna) {
        sentencias.push({ tipo: 'return-false' });
        i = saltarEspacios(src, i + 5);
        continue;
      }
      const m = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(src.slice(i));
      if (!m) throw new Error('funcion esperada');
      const ruta = m[0].split('.');
      i = saltarEspacios(src, i + m[0].length);
      if (src[i] !== '(') throw new Error('se esperaba "("');
      i = saltarEspacios(src, i + 1);
      const args = [];
      while (src[i] !== ')') {
        if (i >= src.length) throw new Error('parentesis sin cerrar');
        if (args.length) {
          if (src[i] !== ',') throw new Error('se esperaba ","');
          i = saltarEspacios(src, i + 1);
        }
        const c = src[i];
        if (c === "'" || c === '"') {
          const t = leerTexto(src, i);
          args.push({ t: 'lit', v: t.valor });
          i = t.fin;
        } else {
          const n = /^(-?\d+(?:\.\d+)?|true|false|null|undefined|this\.value|this\.checked|this|event)(?![\w$.])/.exec(src.slice(i));
          if (!n) throw new Error('argumento no permitido');
          const tok = n[1];
          if (tok === 'this' || tok === 'event' || tok === 'this.value' || tok === 'this.checked') args.push({ t: tok });
          else if (tok === 'true') args.push({ t: 'lit', v: true });
          else if (tok === 'false') args.push({ t: 'lit', v: false });
          else if (tok === 'null') args.push({ t: 'lit', v: null });
          else if (tok === 'undefined') args.push({ t: 'lit', v: undefined });
          else args.push({ t: 'lit', v: Number(tok) });
          i += tok.length;
        }
        i = saltarEspacios(src, i);
      }
      i = saltarEspacios(src, i + 1);
      if (ruta.join('.') === 'event.stopPropagation' && !args.length) sentencias.push({ tipo: 'stop' });
      else if (ruta.join('.') === 'event.preventDefault' && !args.length) sentencias.push({ tipo: 'prevent' });
      else sentencias.push({ tipo: 'llamada', ruta, args, retorna });
      if (i < src.length && src[i] !== ';') throw new Error('se esperaba ";"');
    }
    return sentencias;
  }

  function resolver(ruta) {
    let obj = window;
    for (let k = 0; k < ruta.length; k++) {
      const nombre = ruta[k];
      if (PROHIBIDOS.has(nombre)) return null;
      if (obj === null || obj === undefined) return null;
      obj = obj[nombre];
    }
    if (typeof obj !== 'function') return null;
    // Rechaza funciones nativas del navegador (alert, open, eval...).
    if (/\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(obj))) return null;
    return obj;
  }

  function ejecutar(sentencias, el, evento) {
    for (const s of sentencias) {
      if (s.tipo === 'return-false') { evento.preventDefault(); continue; }
      if (s.tipo === 'stop') { evento.stopPropagation(); continue; }
      if (s.tipo === 'prevent') { evento.preventDefault(); continue; }
      const fn = resolver(s.ruta);
      if (!fn) {
        console.error('[SISSO][CSP] funcion no permitida o inexistente en manejador de evento:', s.ruta.join('.'));
        continue;
      }
      const args = s.args.map((a) => {
        if (a.t === 'lit') return a.v;
        if (a.t === 'this') return el;
        if (a.t === 'event') return evento;
        if (a.t === 'this.value') return el.value;
        return el.checked;
      });
      const r = fn.apply(el, args);
      if (s.retorna && r === false) evento.preventDefault();
    }
  }

  function manejar(evento) {
    const atributo = 'data-on-' + evento.type;
    let el = evento.target instanceof Element ? evento.target : (evento.target && evento.target.parentElement);
    while (el && el !== document) {
      const src = el.getAttribute && el.getAttribute(atributo);
      if (src) {
        let sentencias = cache.get(src);
        if (!sentencias) {
          try { sentencias = analizar(src); } catch (e) {
            console.error('[SISSO][CSP] expresion rechazada en ' + atributo + ':', src, '->', e.message);
            sentencias = [];
          }
          cache.set(src, sentencias);
        }
        ejecutar(sentencias, el, evento);
        // Igual que el burbujeo nativo: event.stopPropagation() en un
        // manejador impide que se ejecuten los de los ancestros.
        if (evento.cancelBubble) return;
      }
      el = el.parentElement;
    }
  }

  TIPOS.forEach((tipo) => document.addEventListener(tipo, manejar));

  // Expuesto solo para las pruebas estaticas (tests/csp.test.js), que
  // verifican que TODA expresion data-on-* del repo sea analizable.
  window.SissoCspEventos = { analizar, resolver, TIPOS };

  // ----------------------------------------------------------
  // Utilidades para los casos que antes eran expresiones de DOM en
  // linea (document.getElementById(...).click(), etc.).
  // ----------------------------------------------------------
  window.sissoClickEn = function sissoClickEn(id) {
    const el = document.getElementById(id);
    if (el) el.click();
  };
  window.sissoQuitarElemento = function sissoQuitarElemento(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  };
  window.sissoMostrarSi = function sissoMostrarSi(id, condicion, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = condicion ? (display || 'block') : 'none';
  };
})();
