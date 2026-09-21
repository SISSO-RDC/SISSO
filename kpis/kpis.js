// ============================================================
// SISSO - KPIs: meta vs. valor real.
//
// CREADO en Auditoria N.19 (hallazgo GRAVE G19-08). El backend
// (migration_092 + kpisOrganizacionController.js) calcula meta, valor,
// desviacion, cumplimiento y tendencia, pero ninguna pantalla consumia
// /kpis-organizacion/comparativo: la funcion estaba anunciada y no era
// visible.
//
// Contrato usado:
//   GET  /kpis-organizacion/comparativo -> { kpis: [ { id, nombre, metaTexto,
//          estado, vinculo?, valorActual?, desviacion?, tendencia?, historial? } ] }
//        estado: sin_vinculo | sin_datos | no_disponible_para_su_rol | cumple | no_cumple
//   GET  /kpis-organizacion             -> { kpis: [...], indicadoresEnlazables: [{clave, descripcion}] }
//   PUT  /kpis-organizacion/:id/vinculo (admin) { indicadorClave, metaOperador, metaValor }
//                                         | { indicadorClave: null }  (retira el vinculo)
//   POST /kpis-organizacion/mediciones (admin/sso/medico) -> 201 { guardadas, omitidas }
//
// Reglas de presentacion (lo que pide la auditoria):
//  * "meta" en texto libre se muestra como DECLARADA, nunca como evaluada.
//  * Solo los estados cumple/no_cumple muestran un valor y un veredicto.
//  * sin_vinculo, sin_datos y no_disponible_para_su_rol se muestran con su
//    propio rotulo y SIN cifra alguna: jamas como "0 %" ni como "cumple".
// ============================================================
let esAdmin = false;
let puedeMedir = false;
let comparativo = [];
let indicadoresEnlazables = [];
let vinculosActuales = {}; // kpiId -> { indicador_clave, meta_operador, meta_valor } (solo admin)
let kpiEnEdicion = null;

const OPERADOR_SIMBOLO = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '=': '=' };

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('kpis', 'KPIs meta vs. real');
  const usuario = SissoSesion.obtenerUsuario();
  if (!usuario) return;
  esAdmin = usuario.rol === 'admin';
  puedeMedir = ['admin', 'sso', 'medico'].includes(usuario.rol);
  if (puedeMedir) document.getElementById('barra-acciones').style.display = 'flex';
  await cargar();
});

async function cargar() {
  try {
    const [comp, lista] = await Promise.all([
      sissoFetch('/kpis-organizacion/comparativo'),
      esAdmin ? sissoFetch('/kpis-organizacion') : Promise.resolve(null),
    ]);
    comparativo = Array.isArray(comp.kpis) ? comp.kpis : [];
    if (lista) {
      indicadoresEnlazables = Array.isArray(lista.indicadoresEnlazables) ? lista.indicadoresEnlazables : [];
      vinculosActuales = {};
      (lista.kpis || []).forEach((k) => { vinculosActuales[k.id] = k; });
    }
    renderizar();
  } catch (err) {
    document.getElementById('contenido').innerHTML =
      `<div class="sisso-vacio">Error al cargar los KPIs: ${escHtml(err.message)}</div>`;
  }
}

// ---------- Presentacion ----------

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? (Math.round(n * 10) / 10).toLocaleString('es-EC', { maximumFractionDigits: 1 }) : '—';
}

function chipEstado(estado) {
  switch (estado) {
    case 'cumple': return '<span class="sisso-chip verde">Cumple la meta</span>';
    case 'no_cumple': return '<span class="sisso-chip rojo">No cumple la meta</span>';
    case 'sin_datos': return '<span class="sisso-chip ambar">Sin datos</span>';
    case 'no_disponible_para_su_rol': return '<span class="sisso-chip gris">No disponible para su rol</span>';
    case 'sin_vinculo': return '<span class="sisso-chip gris">Sin vínculo — no evaluable</span>';
    default: return '<span class="sisso-chip gris">Estado desconocido</span>'; // nunca se asume "cumple"
  }
}

const TENDENCIAS = {
  mejora: '↗ Mejora respecto a la última medición previa',
  empeora: '↘ Empeora respecto a la última medición previa',
  estable: '→ Estable respecto a la última medición previa',
  sin_historial: 'Sin medición previa para comparar',
};

function cuerpoKpi(k) {
  const meta = k.vinculo
    ? `${escHtml(k.vinculo.indicador)}: meta ${escHtml(OPERADOR_SIMBOLO[k.vinculo.operador] || k.vinculo.operador)} ${num(k.vinculo.valorMeta)} %`
    : '';

  if (k.estado === 'cumple' || k.estado === 'no_cumple') {
    const desv = Number(k.desviacion);
    const desvTexto = Number.isFinite(desv) ? `${desv > 0 ? '+' : ''}${num(desv)} puntos porcentuales respecto a la meta` : '';
    const historial = Array.isArray(k.historial) && k.historial.length
      ? `<div class="kpi-historial" title="Mediciones registradas (más antigua → más reciente)">${k.historial.map((h) =>
        `<span class="kpi-punto ${h.cumple ? 'ok' : 'mal'}">${escHtml(String(h.fecha).slice(5))}: ${num(h.valor)} %</span>`).join('')}</div>`
      : '';
    return `
      <div class="kpi-valor ${k.estado === 'cumple' ? 'cumple' : 'no-cumple'}">${num(k.valorActual)} %</div>
      <div class="kpi-linea">${meta}</div>
      <div class="kpi-linea">${escHtml(desvTexto)}</div>
      <div class="kpi-linea">${escHtml(TENDENCIAS[k.tendencia] || '')}</div>
      ${historial}`;
  }

  // Estados sin cifra: se explica por que no hay veredicto.
  const explicacion = {
    sin_vinculo: 'Este KPI solo tiene una meta escrita en texto. Mientras no se vincule a un indicador calculado, no se evalúa su cumplimiento.',
    sin_datos: 'No hay base para calcular el indicador (por ejemplo, 0 trabajadores o 0 exámenes). No equivale a 0 % ni a cumplimiento.',
    no_disponible_para_su_rol: 'Su rol no tiene acceso a este indicador, por lo que tampoco se muestra su valor, desviación ni historial.',
  }[k.estado] || 'No se pudo determinar el estado de este KPI.';
  return `
    ${meta ? `<div class="kpi-linea">${meta}</div>` : ''}
    <div class="kpi-linea">${escHtml(explicacion)}</div>`;
}

function renderizar() {
  if (comparativo.length === 0) {
    document.getElementById('contenido').innerHTML =
      '<div class="sisso-vacio">La organización aún no tiene KPIs activos.</div>';
    return;
  }
  document.getElementById('contenido').innerHTML = `<div class="kpi-lista">${comparativo.map((k) => {
    const vinculado = k.estado !== 'sin_vinculo';
    const acciones = esAdmin
      ? `<div class="acciones-kpi">
           <button class="sisso-boton secundario pequeno" data-on-click="abrirVinculo('${escHtml(k.id)}')">${vinculado ? 'Cambiar vínculo' : 'Vincular a un indicador'}</button>
           ${vinculado ? `<button class="sisso-boton secundario pequeno" data-on-click="retirarVinculo('${escHtml(k.id)}')">Retirar vínculo</button>` : ''}
         </div>`
      : '';
    return `
      <div class="kpi-caja">
        <h3>${escHtml(k.nombre)}</h3>
        <div class="kpi-meta-texto">Meta declarada (texto, no evaluada): ${k.metaTexto ? escHtml(k.metaTexto) : 'sin meta escrita'}</div>
        <div style="margin-bottom:10px;">${chipEstado(k.estado)}</div>
        ${cuerpoKpi(k)}
        ${acciones}
      </div>`;
  }).join('')}</div>`;
}

// ---------- Vinculo (solo admin) ----------

function abrirVinculo(id) {
  if (!esAdmin) return;
  const kpi = comparativo.find((k) => k.id === id);
  if (!kpi) return;
  kpiEnEdicion = kpi;
  ocultarMensajes();
  ocultarError('error-vinculo');

  document.getElementById('vinculo-subtitulo').textContent = `KPI: ${kpi.nombre}`;
  const actual = vinculosActuales[id] || {};
  document.getElementById('k-indicador').innerHTML = indicadoresEnlazables.map((i) =>
    `<option value="${escHtml(i.clave)}"${i.clave === actual.indicador_clave ? ' selected' : ''}>${escHtml(i.descripcion)}</option>`).join('');
  document.getElementById('k-operador').value = actual.meta_operador || '>=';
  document.getElementById('k-meta').value = actual.meta_valor !== undefined && actual.meta_valor !== null ? Number(actual.meta_valor) : '';

  const panel = document.getElementById('panel-vinculo');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cerrarPanelVinculo() {
  kpiEnEdicion = null;
  document.getElementById('panel-vinculo').style.display = 'none';
  ocultarError('error-vinculo');
}

async function guardarVinculo() {
  if (!esAdmin || !kpiEnEdicion) return;
  ocultarError('error-vinculo');
  const indicadorClave = document.getElementById('k-indicador').value;
  const metaOperador = document.getElementById('k-operador').value;
  const crudo = document.getElementById('k-meta').value;
  const metaValor = crudo === '' ? NaN : Number(crudo);

  if (!indicadorClave) return mostrarError('error-vinculo', 'Elija el indicador al que se vincula el KPI.');
  if (!Number.isFinite(metaValor) || metaValor < 0 || metaValor > 100) {
    return mostrarError('error-vinculo', 'La meta debe ser un número entre 0 y 100 (los indicadores son porcentajes).');
  }

  const btn = document.getElementById('btn-guardar-vinculo');
  btn.disabled = true;
  try {
    await sissoFetch(`/kpis-organizacion/${encodeURIComponent(kpiEnEdicion.id)}/vinculo`, {
      method: 'PUT', body: { indicadorClave, metaOperador, metaValor },
    });
    const nombre = kpiEnEdicion.nombre;
    cerrarPanelVinculo();
    mostrarExito('exito-general', `KPI «${nombre}» vinculado. Registre una medición para ver su tendencia.`);
    await cargar();
  } catch (err) {
    mostrarError('error-vinculo', err.message || 'No se pudo guardar el vínculo.');
  } finally {
    btn.disabled = false;
  }
}

async function retirarVinculo(id) {
  if (!esAdmin) return;
  const kpi = comparativo.find((k) => k.id === id);
  if (!kpi) return;
  ocultarMensajes();
  const ok = window.confirm(`¿Retirar el vínculo del KPI «${kpi.nombre}»? Volverá a figurar como «Sin vínculo» y dejará de evaluarse.`);
  if (!ok) return;
  try {
    await sissoFetch(`/kpis-organizacion/${encodeURIComponent(id)}/vinculo`, { method: 'PUT', body: { indicadorClave: null } });
    mostrarExito('exito-general', `Se retiró el vínculo de «${kpi.nombre}».`);
    await cargar();
  } catch (err) {
    mostrarError('error-general', err.message || 'No se pudo retirar el vínculo.');
  }
}

// ---------- Medicion de hoy (admin / sso / medico) ----------

const MOTIVOS_OMITIDA = {
  sin_datos: 'sin datos',
  no_disponible_para_su_rol: 'no disponible para su rol',
  sin_vinculo: 'sin vínculo',
};

async function registrarMedicionHoy() {
  if (!puedeMedir) return;
  ocultarMensajes();
  const btn = document.getElementById('btn-medicion');
  btn.disabled = true;
  try {
    const r = await sissoFetch('/kpis-organizacion/mediciones', { method: 'POST' });
    const guardadas = (r.guardadas || []).length;
    const omitidas = r.omitidas || [];
    let msg = `Medición de hoy registrada para ${guardadas} KPI.`;
    if (omitidas.length) {
      msg += ` Omitidos: ${omitidas.map((o) => `${o.nombre} (${MOTIVOS_OMITIDA[o.motivo] || o.motivo})`).join('; ')}.`;
    }
    mostrarExito('exito-general', msg);
    await cargar();
  } catch (err) {
    mostrarError('error-general', err.message || 'No se pudo registrar la medición.');
  } finally {
    btn.disabled = false;
  }
}

// ---------- Mensajes ----------

function ocultarMensajes() {
  ocultarError('error-general');
  ocultarExito('exito-general');
}
function mostrarError(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
}
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
