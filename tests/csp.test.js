// ============================================================
// Pruebas estaticas de la CSP del frontend (Auditoria N.18,
// hallazgos C18-02 y G18-08). Sin dependencias: `node --test tests/*.test.js`.
//
// Garantizan, para TODAS las paginas, que:
//   1. la CSP es identica y no permite scripts en linea ni eval;
//   2. no hay <script> en linea ni atributos on*= ni javascript: URLs;
//   3. toda pagina carga shared/csp-eventos.js antes que api.js;
//   4. toda expresion data-on-* es analizable por el delegador;
//   5. toda funcion invocada desde data-on-* esta definida en un
//      script que la pagina realmente carga (evita botones muertos).
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CSP_CANONICA = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://res.cloudinary.com; font-src 'self' data:; connect-src 'self' https://sissso-backend.onrender.com https://res.cloudinary.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';";

function listar(dir, exts, salida = []) {
  for (const f of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'lib', 'tests'].includes(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) listar(p, exts, salida);
    else if (exts.some((e) => f.endsWith(e))) salida.push(p);
  }
  return salida;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const htmls = listar(ROOT, ['.html']);
const jss = listar(ROOT, ['.js']).filter((p) => !p.endsWith('shared/csp-eventos.js'));
const leer = (p) => fs.readFileSync(p, 'utf8');

// Carga el delegador en un contexto aislado para reutilizar su analizador real.
const ctx = { console, document: { addEventListener() {} }, Element: function () {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(leer(path.join(ROOT, 'shared/csp-eventos.js')), ctx);
const { analizar, resolver } = ctx.SissoCspEventos;

test('CSP: las paginas tienen exactamente la misma politica canonica', () => {
  assert.ok(htmls.length >= 30, 'no se encontraron las paginas esperadas');
  for (const h of htmls) {
    const metas = [...leer(h).matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/g)];
    assert.strictEqual(metas.length, 1, `${rel(h)}: debe tener exactamente 1 meta CSP`);
    assert.strictEqual(metas[0][1], CSP_CANONICA, `${rel(h)}: CSP distinta de la canonica`);
  }
});

test('CSP: script-src no admite unsafe-inline ni unsafe-eval', () => {
  const scriptSrc = /script-src ([^;]*);/.exec(CSP_CANONICA)[1];
  assert.strictEqual(scriptSrc, "'self'");
});

test('CSP: sin <script> en linea, sin atributos on*= y sin javascript: URLs', () => {
  for (const h of htmls) {
    const t = leer(h);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(t), `${rel(h)}: tiene <script> en linea`);
  }
  for (const f of [...htmls, ...jss]) {
    const t = leer(f);
    const m = /(?<![.\w-])on[a-z]+=\s*[\\"']/.exec(t);
    assert.ok(!m, `${rel(f)}: atributo de evento en linea (${m && m[0]}); usar data-on-click/change/input`);
    assert.ok(!/href=\\?["']javascript:/i.test(t), `${rel(f)}: URL javascript:`);
  }
});

test('CSP: toda pagina (salvo la raiz) carga csp-eventos.js antes que api.js', () => {
  for (const h of htmls) {
    const t = leer(h);
    if (!t.includes('shared/api.js')) continue;
    const a = t.indexOf('shared/csp-eventos.js');
    const b = t.indexOf('shared/api.js');
    assert.ok(a !== -1 && a < b, `${rel(h)}: falta csp-eventos.js antes de api.js`);
  }
});

// --- expresiones data-on-* ---
const RE_ON = /data-on-(click|change|input)=(\\?)(["'])(.*?)\2\3/gs;
function expresiones(texto) {
  // Se ignoran las lineas de comentario (//), que documentan el patron.
  texto = texto.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const out = [];
  let m;
  RE_ON.lastIndex = 0;
  while ((m = RE_ON.exec(texto))) out.push(m[4]);
  return out;
}
// Simula lo que produce la plantilla en tiempo de ejecucion: cada ${...}
// se reemplaza por un valor plausible (texto entre comillas, numero o boolean).
function simular(expr) {
  const decodificada = expr.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const candidatos = ['X', '1', '"x"', 'true'];
  let ultimoError;
  for (const c of candidatos) {
    try { return analizar(decodificada.replace(/\$\{[^}]*\}/g, c)); } catch (e) { ultimoError = e; }
  }
  throw ultimoError;
}

test('delegador: toda expresion data-on-* del repositorio es analizable', () => {
  let total = 0;
  for (const f of [...htmls, ...jss]) {
    for (const e of expresiones(leer(f))) {
      total++;
      assert.doesNotThrow(() => simular(e), `${rel(f)}: expresion no soportada: ${e}`);
    }
  }
  assert.ok(total > 300, `se esperaban >300 expresiones, hay ${total}`);
});

function definiciones(texto) {
  const nombres = new Set();
  for (const m of texto.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) nombres.add(m[1]);
  for (const m of texto.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) nombres.add(m[1]);
  return nombres;
}

test('delegador: toda funcion invocada desde data-on-* esta definida en un script cargado por la pagina', () => {
  const scriptsDe = (h) => {
    const dir = path.dirname(h);
    const srcs = [...leer(h).matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => path.normalize(path.join(dir, m[1])));
    return srcs.filter((s) => fs.existsSync(s));
  };
  const propias = { 'shared/csp-eventos.js': true };
  void propias;
  const definidasCsp = definiciones(leer(path.join(ROOT, 'shared/csp-eventos.js')));
  for (const h of htmls) {
    const scripts = scriptsDe(h);
    const definidas = new Set([...definidasCsp, ...definiciones(leer(h))]);
    for (const s of scripts) definiciones(leer(s)).forEach((n) => definidas.add(n));
    const fuentes = [h, ...scripts];
    for (const f of fuentes) {
      for (const e of expresiones(leer(f))) {
        for (const st of simular(e)) {
          if (st.tipo !== 'llamada') continue;
          assert.ok(definidas.has(st.ruta[0]), `${rel(h)}: '${st.ruta[0]}' (usada en ${rel(f)}) no esta definida como funcion global ni window.${st.ruta[0]}`);
        }
      }
    }
  }
});

// --- comportamiento del analizador ---
test('analizador: literales, escapes y argumentos permitidos', () => {
  const [s] = analizar("verItem('O\\'Brien', 7, true, null, this, this.value, this.checked, event)");
  assert.strictEqual(s.tipo, 'llamada');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.args.map((a) => a.t))), ['lit', 'lit', 'lit', 'lit', 'this', 'this.value', 'this.checked', 'event']);
  assert.strictEqual(s.args[0].v, "O'Brien");
  const [j] = analizar('elegir("a\\"b\\\\c")');
  assert.strictEqual(j.args[0].v, 'a"b\\c');
  const varias = analizar("event.stopPropagation(); ir('x', '#')");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(varias.map((x) => x.tipo))), ['stop', 'llamada']);
  assert.strictEqual(analizar('return false;')[0].tipo, 'return-false');
});

test('analizador: rechaza codigo arbitrario', () => {
  for (const malo of [
    "x = 1", "a(b)", "a(document.cookie)", "a(b.c)", "a(1 + 1)", "a()()", "a('x'", "(function(){})()",
    "a(this.parentNode)", "a() + b()", "a(`x`)", "a(function(){})", "a(){}",
  ]) {
    assert.throws(() => analizar(malo), undefined, `debio rechazar: ${malo}`);
  }
});

test('resolver: rechaza funciones nativas y nombres peligrosos', () => {
  ctx.propia = function propia() { return 1; };
  assert.ok(resolver(['propia']));
  for (const n of ['eval', 'alert', 'open', 'setTimeout', 'fetch', 'document', 'constructor']) {
    assert.strictEqual(resolver([n]), null, n);
  }
});
