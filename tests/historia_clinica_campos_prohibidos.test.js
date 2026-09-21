// ============================================================
// Prueba estatica anti-regresion (Auditoria N.19, C19-01 y M19-06).
// Sin dependencias: `node --test tests/*.test.js`.
//
// Contexto: el backend descarta religion, habitos toxicos y los
// antecedentes gineco-obstetricos/reproductivos (Sentencia 59-19-IN/24
// de la Corte Constitucional). Pero el frontend seguia PIDIENDO esos
// datos, lo que contradice la minimizacion en el primer punto del
// tratamiento. Esta prueba falla si cualquiera de esos campos vuelve a
// aparecer en la interfaz (HTML/JS), sin importar que el backend los
// descarte.
//
// Solo se inspecciona codigo ejecutable y marcado real: los comentarios
// HTML/JS se descartan antes de buscar, de modo que se puede documentar
// por que se retiraron sin disparar la prueba.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function listar(dir, exts, salida = []) {
  for (const f of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'lib', 'tests'].includes(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) listar(p, exts, salida);
    else if (exts.some((e) => f.endsWith(e))) salida.push(p);
  }
  return salida;
}

// Minusculas y sin tildes, para que "Religión" y "religion" cuenten igual.
const normalizar = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function quitarComentariosHtml(t) {
  return t.replace(/<!--[\s\S]*?-->/g, ' ');
}

// Quita comentarios // y /* */ respetando cadenas '...', "..." y `...`.
// No es un parser completo de JS (no distingue literales regex), pero es
// suficiente para una guarda estatica y no tiene dependencias.
function quitarComentariosJs(t) {
  let salida = '';
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    const d = t[i + 1];
    if (c === '/' && d === '/') {
      while (i < t.length && t[i] !== '\n') i++;
    } else if (c === '/' && d === '*') {
      const fin = t.indexOf('*/', i + 2);
      i = fin === -1 ? t.length : fin + 2;
      salida += ' ';
    } else if (c === '\'' || c === '"' || c === '`') {
      const comilla = c;
      salida += c;
      i++;
      while (i < t.length && t[i] !== comilla) {
        if (t[i] === '\\') { salida += t[i]; i++; }
        if (comilla !== '`' && t[i] === '\n') break; // cadena mal cerrada / regex
        salida += t[i];
        i++;
      }
      if (i < t.length) { salida += t[i]; i++; }
    } else {
      salida += c;
      i++;
    }
  }
  return salida;
}

const paginasHtml = listar(ROOT, ['.html']);
const scriptsJs = listar(ROOT, ['.js']).filter((p) => !p.endsWith('shared/csp-eventos.js'));
const enHistoriaClinica = (p) => rel(p).startsWith('historia-clinica/');

// Terminos prohibidos EN TODA la interfaz (Sentencia 59-19-IN/24 y N.19).
const PROHIBIDOS_GLOBALES = [
  ['religion', /religi/],
  ['orientacion sexual', /orientacion[ _-]?sexual/],
  ['identidad de genero', /identidad[ _-]?de?[ _-]?genero/],
  ['antecedentes gineco-obstetricos', /gineco|obstetric/],
  ['antecedentes reproductivos', /reproductiv/],
  ['menarquia / menstruacion', /menarqu|menstru/],
  ['papanicolau / mamografia', /papanicolau|mamograf/],
  ['habitos toxicos', /habitos?[ _-]?toxicos?|habitostoxicos/],
];

// Terminos adicionales prohibidos SOLO dentro de Historia Clinica (en otros
// modulos pueden aparecer con sentido legitimo, p. ej. agentes quimicos).
const PROHIBIDOS_HISTORIA_CLINICA = [
  ['tabaco', /tabaco/],
  ['alcohol', /alcohol/],
  ['drogas', /droga/],
  ['antigeno / eco prostatico', /antigeno prostatic|eco[ _-]?prostatic/],
  ['metodo de planificacion', /metodo[ _-]?de[ _-]?planificacion|metodoplanificacion/],
  ['gestas / partos / cesareas / abortos', /\bgestas\b|\bpartos\b|\bcesareas\b|\babortos\b/],
  ['hijos vivos / fallecidos', /hijos[ _-]?(vivos|fallecidos|muertos)|hijos(vivos|muertos)/],
];

function buscar(texto, lista) {
  const t = normalizar(texto);
  return lista.filter(([, re]) => re.test(t)).map(([nombre]) => nombre);
}

test('C19-01: ninguna pagina ni script del frontend solicita campos prohibidos', () => {
  assert.ok(paginasHtml.length >= 30, 'no se encontraron las paginas esperadas');
  const hallazgos = [];
  for (const h of paginasHtml) {
    for (const n of buscar(quitarComentariosHtml(leer(h)), PROHIBIDOS_GLOBALES)) {
      hallazgos.push(`${rel(h)}: ${n}`);
    }
  }
  for (const j of scriptsJs) {
    for (const n of buscar(quitarComentariosJs(leer(j)), PROHIBIDOS_GLOBALES)) {
      hallazgos.push(`${rel(j)}: ${n}`);
    }
  }
  assert.deepStrictEqual(hallazgos, [], 'campos prohibidos reintroducidos:\n' + hallazgos.join('\n'));
});

test('C19-01: Historia Clinica no captura habitos, antecedentes reproductivos ni religion', () => {
  const archivos = [...paginasHtml, ...scriptsJs].filter(enHistoriaClinica);
  assert.ok(archivos.length >= 2, 'no se encontraron los archivos de historia-clinica');
  const hallazgos = [];
  for (const a of archivos) {
    const crudo = leer(a);
    const limpio = a.endsWith('.html') ? quitarComentariosHtml(crudo) : quitarComentariosJs(crudo);
    for (const n of buscar(limpio, PROHIBIDOS_HISTORIA_CLINICA)) {
      hallazgos.push(`${rel(a)}: ${n}`);
    }
  }
  assert.deepStrictEqual(hallazgos, [], 'campos prohibidos reintroducidos:\n' + hallazgos.join('\n'));
});

test('C19-01: el cuerpo enviado al guardar no incluye propiedades prohibidas', () => {
  const js = normalizar(quitarComentariosJs(leer(path.join(ROOT, 'historia-clinica/historia-clinica.js'))));
  for (const prop of [
    'religion:', 'habitostoxicos', 'antecedentesginecobstetricos',
    'antecedentesginecologicosexamenes', 'antecedentesreproductivosmasculinos',
  ]) {
    assert.ok(!js.includes(prop), `historia-clinica.js vuelve a enviar "${prop}"`);
  }
});

test('Historia Clinica: todo id leido por el JS existe en el HTML (evita undefined/null al quitar campos)', () => {
  const html = quitarComentariosHtml(leer(path.join(ROOT, 'historia-clinica/index.html')));
  const js = quitarComentariosJs(leer(path.join(ROOT, 'historia-clinica/historia-clinica.js')));
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  // Ids creados dinamicamente por el propio JS (no estan en el HTML estatico).
  const dinamicos = new Set(['contenido-detalle']);
  const usados = [...js.matchAll(/(?:getElementById|\bval|\bnum)\('([^']+)'\)/g)].map((m) => m[1]);
  const faltantes = [...new Set(usados)].filter((id) => !ids.has(id) && !dinamicos.has(id));
  assert.deepStrictEqual(faltantes, [], `ids usados en JS que no existen en el HTML: ${faltantes.join(', ')}`);
});

test('Historia Clinica: se conserva el bloque de estilo de vida (no se retiro de mas)', () => {
  const html = leer(path.join(ROOT, 'historia-clinica/index.html'));
  assert.ok(html.includes('id="c-actividad-fisica"'));
  assert.ok(html.includes('id="c-medicacion-habitual"'));
});
