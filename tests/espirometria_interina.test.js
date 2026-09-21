// ============================================================
// Auditoria N.19, G19-01: la espirometria usa ecuaciones interinas
// (ECSC/ERS 1993), no una implementacion validada GLI/ERS-ATS. La
// interfaz nunca debe presentarla como definitiva ni como
// "cumplimiento ERS/ATS", y debe mostrar siempre el aviso interino.
// Sin dependencias: `node --test tests/*.test.js`.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sinComentarios = (t) => t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

test('G19-01: la pagina de espirometria nunca se presenta como definitiva ni como cumplimiento ERS/ATS', () => {
  for (const f of ['espirometria/index.html', 'espirometria/pagina.js']) {
    const t = sinComentarios(leer(f)).replace(/esDefinitivo/g, '');
    assert.ok(!/definitiv/i.test(t), `${f}: no debe usar "definitivo/a"`);
    assert.ok(!/cumplimiento\s+(ers|ats)/i.test(t), `${f}: no debe afirmar cumplimiento ERS/ATS`);
  }
});

test('G19-01: el resultado y el historial muestran siempre el aviso INTERINO', () => {
  const js = leer('espirometria/pagina.js');
  const html = leer('espirometria/index.html');
  assert.ok(/AVISO_INTERINO_ESPIROMETRIA\s*=/.test(js), 'falta la constante del aviso interino');
  const uso = js.match(/\$\{AVISO_INTERINO_ESPIROMETRIA\}/g) || [];
  assert.ok(uso.length >= 1, 'mostrarResultado debe insertar el aviso incondicionalmente');
  assert.ok(/INTERINO/.test(html), 'el historial/pagina debe rotular los resultados como INTERINOS');
  assert.ok(/m[eé]dico ocupacional/i.test(js), 'el aviso debe remitir al medico ocupacional');
});
