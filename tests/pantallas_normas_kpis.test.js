// ============================================================
// Auditoria N.19, G19-07 y G19-08: las funciones del backend de verificacion
// normativa y del comparativo de KPI ya tienen pantalla. Estas pruebas cargan
// el JS real de cada pagina en un contexto aislado con un DOM minimo y
// comprueban las reglas de presentacion que exige la auditoria.
// Sin dependencias: `node --test tests/*.test.js`.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// escHtml REAL (el de shared/layout.js), no una copia de la prueba.
function extraerEscape() {
  const src = leer('shared/layout.js');
  const m = src.match(/function escaparHtml\(valor\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, 'no se encontro escaparHtml en layout.js');
  return m[0];
}

function elemento() {
  return {
    innerHTML: '', textContent: '', value: '', disabled: false, style: {},
    classList: { add() {}, remove() {} }, scrollIntoView() {},
  };
}

function cargarPagina(archivo, { rol, respuestas = {} }) {
  const elementos = {};
  const llamadas = [];
  const ctx = {
    console,
    document: {
      addEventListener() {},
      getElementById(id) { return elementos[id] || (elementos[id] = elemento()); },
    },
    window: { confirm: () => true },
    SissoLayout: { iniciar: async () => {} },
    SissoSesion: { obtenerUsuario: () => ({ rol, id: 'u1' }) },
    sissoFetch: async (ruta, opc) => {
      llamadas.push({ ruta, opc });
      const clave = `${(opc && opc.method) || 'GET'} ${ruta}`;
      if (!(clave in respuestas)) throw new Error(`sin respuesta simulada para ${clave}`);
      return respuestas[clave];
    },
    encodeURIComponent, Number, Math, String, Array, JSON, Promise, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(extraerEscape() + '\nconst escHtml = escaparHtml;', ctx);
  vm.runInContext(leer(archivo), ctx);
  return { ctx, elementos, llamadas };
}

// `let` de nivel superior no cuelga del contexto: se lee/escribe con runInContext.
const evaluar = (ctx, codigo) => vm.runInContext(codigo, ctx);

// ---------- Estructura ----------

test('G19-07/G19-08: las paginas existen, estan en el menu y cargan sus scripts', () => {
  for (const [dir, js, id] of [['normas-examenes', 'normas-examenes.js', 'normas-examenes'], ['kpis', 'kpis.js', 'kpis']]) {
    const html = leer(`${dir}/index.html`);
    assert.ok(html.includes(`<script src="${js}"></script>`), `${dir}: falta cargar ${js}`);
    assert.ok(html.includes('../shared/csp-eventos.js') && html.includes('../shared/layout.js'));
    assert.ok(leer('shared/layout.js').includes(`id: '${id}'`), `${id}: falta en el menu`);
    assert.ok(leer(`${dir}/${js}`).includes(`SissoLayout.iniciar('${id}'`), `${dir}: el id del menu debe coincidir`);
  }
});

test('G19-07/G19-08: usan exactamente los endpoints del backend', () => {
  const n = leer('normas-examenes/normas-examenes.js');
  assert.ok(n.includes("'/examenes-organizacion'"));
  assert.ok(/\/examenes-organizacion\/\$\{encodeURIComponent\([^)]*\)\}\/verificacion/.test(n));
  const k = leer('kpis/kpis.js');
  for (const ruta of ["'/kpis-organizacion/comparativo'", "'/kpis-organizacion'", "'/kpis-organizacion/mediciones'"]) {
    assert.ok(k.includes(ruta), `kpis.js debe usar ${ruta}`);
  }
  assert.ok(/\/kpis-organizacion\/\$\{encodeURIComponent\([^)]*\)\}\/vinculo/.test(k));
});

// ---------- G19-08: KPIs ----------

const KPIS = [
  { id: 'k1', nombre: 'Meta solo texto', metaTexto: 'Cumplir 100 % de EMO', estado: 'sin_sindicar', vinculo: null },
  { id: 'k2', nombre: 'Sin vinculo', metaTexto: 'Reducir accidentes', estado: 'sin_vinculo', vinculo: null },
  { id: 'k3', nombre: 'Sin denominador', metaTexto: '90 %', estado: 'sin_datos', vinculo: { indicador: 'Cobertura de EMO vigente (%)', operador: '>=', valorMeta: 90 } },
  { id: 'k4', nombre: 'Otro rol', metaTexto: '', estado: 'no_disponible_para_su_rol', vinculo: { indicador: 'Audiometrías con hallazgo anormal (%)', operador: '<=', valorMeta: 5 } },
  { id: 'k5', nombre: 'Cumple', metaTexto: '90 %', estado: 'cumple', vinculo: { indicador: 'Cobertura de EMO vigente (%)', operador: '>=', valorMeta: 90 }, valorActual: 95, desviacion: 5, tendencia: 'mejora', historial: [{ fecha: '2026-09-01', valor: 91, cumple: true }] },
  { id: 'k6', nombre: 'No cumple', metaTexto: '', estado: 'no_cumple', vinculo: { indicador: 'Trabajadores aptos (%)', operador: '>=', valorMeta: 80 }, valorActual: 60, desviacion: -20, tendencia: 'empeora', historial: [] },
];

function paginaKpis(rol) {
  const p = cargarPagina('kpis/kpis.js', { rol });
  evaluar(p.ctx, `comparativo = ${JSON.stringify(KPIS)}; esAdmin = ${rol === 'admin'}; renderizar();`);
  return p.elementos.contenido.innerHTML;
}

function cajaDe(html, nombre) {
  const trozos = html.split('<div class="kpi-caja">').slice(1);
  const caja = trozos.find((t) => t.includes(`<h3>${nombre}</h3>`));
  assert.ok(caja, `no se dibujo la caja de "${nombre}"`);
  return caja;
}

test('G19-08: un estado desconocido o sin vinculo jamas se muestra como cumplido ni con cifra', () => {
  const html = paginaKpis('sso');
  for (const nombre of ['Meta solo texto', 'Sin vinculo']) {
    const c = cajaDe(html, nombre);
    assert.ok(!/Cumple la meta/.test(c), `${nombre} no debe figurar como cumplido`);
    assert.ok(!/class="kpi-valor/.test(c), `${nombre} no debe mostrar un valor`);
  }
  assert.ok(/Sin vínculo — no evaluable/.test(cajaDe(html, 'Sin vinculo')));
  assert.ok(/Estado desconocido/.test(cajaDe(html, 'Meta solo texto')));
});

test('G19-08: sin_datos y no_disponible_para_su_rol tienen su rotulo y ninguna cifra', () => {
  const html = paginaKpis('sso');
  const sinDatos = cajaDe(html, 'Sin denominador');
  assert.ok(/Sin datos/.test(sinDatos) && !/class="kpi-valor/.test(sinDatos));
  const otroRol = cajaDe(html, 'Otro rol');
  assert.ok(/No disponible para su rol/.test(otroRol) && !/class="kpi-valor/.test(otroRol));
});

test('G19-08: cumple / no cumple muestran valor, meta, desviacion y tendencia', () => {
  const html = paginaKpis('sso');
  const ok = cajaDe(html, 'Cumple');
  assert.ok(/Cumple la meta/.test(ok) && /kpi-valor cumple/.test(ok));
  assert.ok(/≥ 90 %/.test(ok) && /\+5 puntos porcentuales/.test(ok) && /Mejora/.test(ok));
  const mal = cajaDe(html, 'No cumple');
  assert.ok(/No cumple la meta/.test(mal) && /kpi-valor no-cumple/.test(mal) && /-20 puntos porcentuales/.test(mal));
});

test('G19-08: la meta en texto se rotula como declarada, no evaluada', () => {
  assert.ok(/Meta declarada \(texto, no evaluada\)/.test(paginaKpis('sso')));
});

test('G19-08: solo el admin ve los controles de vinculo', () => {
  assert.ok(!/abrirVinculo/.test(paginaKpis('sso')));
  const admin = paginaKpis('admin');
  assert.ok(/abrirVinculo\('k2'\)/.test(admin));
  assert.ok(/retirarVinculo\('k5'\)/.test(admin) && !/retirarVinculo\('k2'\)/.test(admin));
});

test('G19-08: el texto de KPI/meta del servidor se escapa (sin XSS)', () => {
  const p = cargarPagina('kpis/kpis.js', { rol: 'sso' });
  evaluar(p.ctx, `comparativo = ${JSON.stringify([{ id: 'x', nombre: '<img src=x onerror=alert(1)>', metaTexto: '<script>1</script>', estado: 'sin_vinculo' }])}; renderizar();`);
  const html = p.elementos.contenido.innerHTML;
  assert.ok(!/<img|<script/i.test(html), html);
  assert.ok(html.includes('&lt;img'));
});

test('G19-08: guardar un vinculo valida la meta 0-100 y envia el cuerpo que espera el backend', async () => {
  const p = cargarPagina('kpis/kpis.js', {
    rol: 'admin',
    respuestas: {
      'PUT /kpis-organizacion/k2/vinculo': { kpi: {} },
      'GET /kpis-organizacion/comparativo': { kpis: KPIS },
      'GET /kpis-organizacion': { kpis: [], indicadoresEnlazables: [] },
    },
  });
  evaluar(p.ctx, "esAdmin = true; kpiEnEdicion = { id: 'k2', nombre: 'Sin vinculo' };");
  p.elementos['k-indicador'] = { ...elemento(), value: 'cobertura_emo_vigente_pct' };
  p.elementos['k-operador'] = { ...elemento(), value: '>=' };
  p.elementos['k-meta'] = { ...elemento(), value: '150' };
  await evaluar(p.ctx, 'guardarVinculo()');
  assert.equal(p.llamadas.length, 0, 'meta fuera de rango: no debe llamar al backend');
  p.elementos['k-meta'].value = '85';
  await evaluar(p.ctx, 'guardarVinculo()');
  const put = p.llamadas.find((l) => l.opc && l.opc.method === 'PUT');
  assert.ok(put, 'debio enviar el PUT');
  // Se compara via JSON: el objeto nace en otro contexto de vm (prototipo distinto).
  assert.deepStrictEqual(JSON.parse(JSON.stringify(put.opc.body)), { indicadorClave: 'cobertura_emo_vigente_pct', metaOperador: '>=', metaValor: 85 });
});

// ---------- G19-07: normas de examenes ----------

const EXAMENES = [
  { id: 'e1', nombre: 'Audiometría', tipo: 'periodico', frecuencia: 'anual', origen: 'sectorial', estado_verificacion: 'no_verificada', vigencia_norma: 'no_verificada' },
  { id: 'e2', nombre: 'Espirometría', tipo: 'periodico', frecuencia: 'anual', estado_verificacion: 'verificada', vigencia_norma: 'verificada_vigente', fuente_norma: 'Reglamento X 2020', jurisdiccion: 'Ecuador', articulo_referencia: 'Art. 5', fecha_validacion: '2026-01-10', vigente_hasta: '2027-01-10', verificado_por_nombre: 'Dra. Prueba' },
  { id: 'e3', nombre: 'Visiometría', tipo: 'periodico', frecuencia: 'bienal', estado_verificacion: 'verificada', vigencia_norma: 'verificada_vencida', fuente_norma: 'Norma Y', jurisdiccion: 'Ecuador', articulo_referencia: 'Art. 9', fecha_validacion: '2024-01-10', vigente_hasta: '2025-01-10' },
  { id: 'e4', nombre: 'Rara', estado_verificacion: 'verificada', vigencia_norma: 'valor_nuevo_del_backend' },
];

function paginaNormas(rol) {
  const p = cargarPagina('normas-examenes/normas-examenes.js', { rol });
  evaluar(p.ctx, `examenes = ${JSON.stringify(EXAMENES)}; esMedico = ${rol === 'medico'}; renderizar();`);
  return p.elementos;
}

test('G19-07: no verificada se rotula como sugerencia; vigente y vencida tienen distintivo propio', () => {
  const html = paginaNormas('sso').contenido.innerHTML;
  assert.ok(/sisso-chip gris">No verificada \(sugerencia\)/.test(html));
  assert.ok(/sisso-chip verde">Verificada — vigente/.test(html));
  assert.ok(/sisso-chip ambar">Verificada — vencida/.test(html));
});

test('G19-07: un estado desconocido del backend nunca se presenta como norma verificada', () => {
  const html = paginaNormas('sso').contenido.innerHTML;
  const fila = html.split('<tr>').find((t) => t.includes('<strong>Rara</strong>'));
  assert.ok(fila && /No verificada \(sugerencia\)/.test(fila) && !/sisso-chip verde/.test(fila));
});

test('G19-07: se muestran fuente, jurisdiccion, articulo, fecha de validacion, vigencia y verificador', () => {
  const html = paginaNormas('sso').contenido.innerHTML;
  for (const texto of ['Reglamento X 2020', 'Ecuador', 'Art. 5', '10/01/2026', '10/01/2027', 'Dra. Prueba']) {
    assert.ok(html.includes(texto), `falta "${texto}"`);
  }
});

test('G19-07: el resumen cuenta vigentes, vencidos y sin verificar', () => {
  const r = paginaNormas('sso').resumen.innerHTML;
  assert.ok(/Verificados vigentes: 1/.test(r) && /Verificados vencidos: 1/.test(r) && /Sin verificar: 2/.test(r));
});

test('G19-07: solo el medico ve las acciones de verificar/retirar', () => {
  assert.ok(!/abrirVerificacion|retirarVerificacion/.test(paginaNormas('admin').contenido.innerHTML));
  const m = paginaNormas('medico').contenido.innerHTML;
  assert.ok(/abrirVerificacion\('e1'\)/.test(m) && /Verificar norma/.test(m));
  assert.ok(/abrirVerificacion\('e2'\)/.test(m) && /Revalidar/.test(m));
  assert.ok(/retirarVerificacion\('e2'\)/.test(m) && !/retirarVerificacion\('e1'\)/.test(m));
});

test('G19-07: guardar valida los campos obligatorios y envia el cuerpo del backend', async () => {
  const p = cargarPagina('normas-examenes/normas-examenes.js', {
    rol: 'medico',
    respuestas: {
      'PUT /examenes-organizacion/e1/verificacion': { examen: {} },
      'GET /examenes-organizacion': { examenes: EXAMENES },
    },
  });
  evaluar(p.ctx, `esMedico = true; examenEnEdicion = { id: 'e1', nombre: 'Audiometría' };`);
  const campo = (v) => ({ ...elemento(), value: v });
  Object.assign(p.elementos, {
    'v-fuente': campo('Reglamento X'), 'v-jurisdiccion': campo(''), 'v-articulo': campo('Art. 1'),
    'v-fecha-validacion': campo('2026-09-21'), 'v-vigente-hasta': campo(''), 'v-frecuencia': campo(''),
    'btn-guardar-verificacion': elemento(),
  });
  await evaluar(p.ctx, 'guardarVerificacion()');
  assert.equal(p.llamadas.length, 0, 'sin jurisdiccion no debe llamar al backend');

  p.elementos['v-jurisdiccion'].value = 'Ecuador';
  p.elementos['v-vigente-hasta'].value = '2026-01-01'; // anterior a la validacion
  await evaluar(p.ctx, 'guardarVerificacion()');
  assert.equal(p.llamadas.length, 0, 'vigencia anterior a la validacion: no debe llamar al backend');

  p.elementos['v-vigente-hasta'].value = '2027-09-21';
  p.elementos['v-frecuencia'].value = 'anual';
  await evaluar(p.ctx, 'guardarVerificacion()');
  const put = p.llamadas.find((l) => l.opc && l.opc.method === 'PUT');
  assert.ok(put, 'debio enviar el PUT');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(put.opc.body)), {
    verificada: true, fuenteNorma: 'Reglamento X', jurisdiccion: 'Ecuador', articuloReferencia: 'Art. 1',
    fechaValidacion: '2026-09-21', vigenteHasta: '2027-09-21', frecuencia: 'anual',
  });
});

test('G19-07: el texto de examenes del servidor se escapa (sin XSS)', () => {
  const p = cargarPagina('normas-examenes/normas-examenes.js', { rol: 'sso' });
  evaluar(p.ctx, `examenes = ${JSON.stringify([{ id: 'x', nombre: '<img src=x onerror=alert(1)>', estado_verificacion: 'verificada', vigencia_norma: 'verificada_vigente', fuente_norma: '<script>1</script>' }])}; renderizar();`);
  const html = p.elementos.contenido.innerHTML;
  assert.ok(!/<img|<script/i.test(html), html);
});
