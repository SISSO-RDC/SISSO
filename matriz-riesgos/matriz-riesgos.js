// ============================================================
// SISSO - Matriz de Riesgos (metodologia IPER)
// ============================================================

let catalogos = null;
let itemEditandoId = null;
let itemsActuales = [];

const COLORES_CLASIFICACION = {
  trivial:     { bg: '#dcfce7', fg: '#166534' },
  tolerable:   { bg: '#bbf7d0', fg: '#166534' },
  moderado:    { bg: '#fef08a', fg: '#854d0e' },
  importante:  { bg: '#fdba74', fg: '#9a3412' },
  intolerable: { bg: '#fca5a5', fg: '#991b1b' },
};
const ETIQUETAS_CLASIFICACION = {
  trivial: 'Trivial', tolerable: 'Tolerable', moderado: 'Moderado', importante: 'Importante', intolerable: 'Intolerable',
};
const ETIQUETAS_TIPO_PELIGRO = {
  fisico: 'Físico', mecanico: 'Mecánico', quimico: 'Químico', biologico: 'Biológico', ergonomico: 'Ergonómico', psicosocial: 'Psicosocial',
};

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('matriz', 'Matriz de Riesgos');
  await cargarCatalogos();
  poblarSelects();
  await cargarItems();
});

async function cargarCatalogos() {
  try {
    const datos = await sissoFetch('/matriz-riesgos/catalogos');
    catalogos = datos.catalogos;
  } catch (err) {
    mostrarError('error-lista', 'Error al cargar catálogos: ' + err.message);
  }
}

function poblarSelects() {
  const llenar = (id, etiquetas) => {
    const sel = document.getElementById(id);
    sel.innerHTML = Object.entries(etiquetas).map(([valor, texto]) => `<option value="${valor}">${valor} — ${texto}</option>`).join('');
  };
  llenar('m-probabilidad', catalogos.ETIQUETAS_PROBABILIDAD);
  llenar('m-consecuencia', catalogos.ETIQUETAS_CONSECUENCIA);
  actualizarPrevisualizacion();
}

function calcularNivelLocal(p, c) {
  const nivel = p * c;
  let clasificacion;
  if (nivel <= 2) clasificacion = 'trivial';
  else if (nivel <= 4) clasificacion = 'tolerable';
  else if (nivel <= 9) clasificacion = 'moderado';
  else if (nivel <= 16) clasificacion = 'importante';
  else clasificacion = 'intolerable';
  return { nivel, clasificacion };
}

function actualizarPrevisualizacion() {
  const p = parseInt(document.getElementById('m-probabilidad').value, 10);
  const c = parseInt(document.getElementById('m-consecuencia').value, 10);
  const { nivel, clasificacion } = calcularNivelLocal(p, c);
  const color = COLORES_CLASIFICACION[clasificacion];
  document.getElementById('previsualizacion-nivel').innerHTML = `
    <span class="nivel-chip" style="background:${color.bg};color:${color.fg};">
      Nivel de riesgo: ${nivel} — ${ETIQUETAS_CLASIFICACION[clasificacion]}
    </span>`;
}

async function cargarItems() {
  const tbody = document.getElementById('tabla-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="sisso-cargando">Cargando…</td></tr>';
  try {
    const datos = await sissoFetch('/matriz-riesgos');
    itemsActuales = datos.items || [];
    renderizarResumen(datos.resumen || {});
    renderizarHeatmap(itemsActuales);
    renderizarTabla(itemsActuales);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderizarResumen(resumen) {
  const orden = ['trivial', 'tolerable', 'moderado', 'importante', 'intolerable'];
  document.getElementById('resumen-grid').innerHTML = orden.map(c => {
    const color = COLORES_CLASIFICACION[c];
    return `<div class="resumen-item" style="background:${color.bg};">
      <div class="numero" style="color:${color.fg};">${resumen[c] || 0}</div>
      <div class="etiqueta" style="color:${color.fg};">${ETIQUETAS_CLASIFICACION[c]}</div>
    </div>`;
  }).join('');
}

function renderizarHeatmap(items) {
  // conteo[consecuencia][probabilidad]
  const conteo = {};
  for (let c = 1; c <= 5; c++) { conteo[c] = {}; for (let p = 1; p <= 5; p++) conteo[c][p] = 0; }
  items.forEach(it => { if (it.probabilidad && it.consecuencia) conteo[it.consecuencia][it.probabilidad]++; });

  let html = '<thead><tr><th></th><th colspan="5">Probabilidad →</th></tr><tr><th>Consecuencia ↓</th>' +
    [1, 2, 3, 4, 5].map(p => `<th>${p}</th>`).join('') + '</tr></thead><tbody>';

  for (let c = 5; c >= 1; c--) {
    html += `<tr><th>${c}</th>`;
    for (let p = 1; p <= 5; p++) {
      const { clasificacion } = calcularNivelLocal(p, c);
      const color = COLORES_CLASIFICACION[clasificacion];
      const n = conteo[c][p];
      html += `<td class="celda" style="background:${color.bg};color:${color.fg};" title="P${p} × C${c} = ${p * c} (${ETIQUETAS_CLASIFICACION[clasificacion]})">${n || ''}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  document.getElementById('heatmap').innerHTML = html;
}

function renderizarTabla(items) {
  const tbody = document.getElementById('tabla-tbody');
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="sisso-vacio">Aún no hay riesgos registrados en la matriz.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(it => {
    const color = COLORES_CLASIFICACION[it.clasificacion] || { bg: 'var(--bg3)', fg: 'var(--t2)' };
    return `
      <tr>
        <td style="font-weight:600;">${escHtml(it.peligro_especifico)}${it.riesgo_potencial ? `<div style="font-size:11px;color:var(--t3);font-weight:400;">${escHtml(it.riesgo_potencial)}</div>` : ''}</td>
        <td>${ETIQUETAS_TIPO_PELIGRO[it.tipo_peligro] || it.tipo_peligro}</td>
        <td style="color:var(--t3);">${escHtml(it.nombre_puesto || it.puesto_texto_libre || '—')}</td>
        <td style="text-align:center;">${it.probabilidad} × ${it.consecuencia}</td>
        <td><span class="nivel-chip" style="background:${color.bg};color:${color.fg};">${it.nivel_riesgo} — ${ETIQUETAS_CLASIFICACION[it.clasificacion] || ''}</span></td>
        <td style="color:var(--t3);font-size:11.5px;">${escHtml(it.responsable_control || '—')}${it.plazo_control ? '<br>' + formatearFecha(it.plazo_control) : ''}</td>
        <td>
          <button class="btn-mini" onclick="abrirModal('${it.id}')">✎</button>
          <button class="btn-mini" onclick="eliminarItem('${it.id}')">🗑</button>
        </td>
      </tr>`;
  }).join('');
}

async function abrirModal(id) {
  itemEditandoId = id || null;
  document.getElementById('error-modal').classList.remove('visible');
  document.getElementById('titulo-modal').textContent = id ? 'Editar riesgo' : 'Nuevo riesgo';

  ['m-puesto', 'm-proceso', 'm-actividad', 'm-expuestos', 'm-peligro', 'm-riesgo-potencial',
    'm-controles-existentes', 'm-controles-adicionales', 'm-responsable', 'm-plazo'].forEach(id2 => document.getElementById(id2).value = '');
  document.getElementById('m-tipo-peligro').value = 'fisico';
  document.getElementById('m-probabilidad').value = '1';
  document.getElementById('m-consecuencia').value = '1';
  actualizarPrevisualizacion();

  if (id) {
    try {
      const datos = await sissoFetch(`/matriz-riesgos/${id}`);
      const it = datos.item;
      document.getElementById('m-puesto').value = it.puesto_texto_libre || '';
      document.getElementById('m-proceso').value = it.proceso || '';
      document.getElementById('m-actividad').value = it.actividad || '';
      document.getElementById('m-tipo-peligro').value = it.tipo_peligro;
      document.getElementById('m-expuestos').value = it.trabajadores_expuestos ?? '';
      document.getElementById('m-peligro').value = it.peligro_especifico || '';
      document.getElementById('m-riesgo-potencial').value = it.riesgo_potencial || '';
      document.getElementById('m-probabilidad').value = it.probabilidad;
      document.getElementById('m-consecuencia').value = it.consecuencia;
      document.getElementById('m-controles-existentes').value = it.controles_existentes || '';
      document.getElementById('m-controles-adicionales').value = it.controles_adicionales || '';
      document.getElementById('m-responsable').value = it.responsable_control || '';
      document.getElementById('m-plazo').value = it.plazo_control ? it.plazo_control.split('T')[0] : '';
      actualizarPrevisualizacion();
    } catch (err) {
      mostrarErrorModal(err.message);
    }
  }

  document.getElementById('modal-item').classList.add('visible');
}

function cerrarModal() {
  document.getElementById('modal-item').classList.remove('visible');
  itemEditandoId = null;
}

async function guardarItem() {
  document.getElementById('error-modal').classList.remove('visible');

  const peligroEspecifico = document.getElementById('m-peligro').value.trim();
  if (!peligroEspecifico) { mostrarErrorModal('El peligro específico es obligatorio.'); return; }

  const cuerpo = {
    puestoTextoLibre: document.getElementById('m-puesto').value.trim() || undefined,
    proceso: document.getElementById('m-proceso').value.trim() || undefined,
    actividad: document.getElementById('m-actividad').value.trim() || undefined,
    tipoPeligro: document.getElementById('m-tipo-peligro').value,
    peligroEspecifico,
    riesgoPotencial: document.getElementById('m-riesgo-potencial').value.trim() || undefined,
    trabajadoresExpuestos: document.getElementById('m-expuestos').value ? parseInt(document.getElementById('m-expuestos').value, 10) : undefined,
    probabilidad: parseInt(document.getElementById('m-probabilidad').value, 10),
    consecuencia: parseInt(document.getElementById('m-consecuencia').value, 10),
    controlesExistentes: document.getElementById('m-controles-existentes').value.trim() || undefined,
    controlesAdicionales: document.getElementById('m-controles-adicionales').value.trim() || undefined,
    responsableControl: document.getElementById('m-responsable').value.trim() || undefined,
    plazoControl: document.getElementById('m-plazo').value || undefined,
  };

  const boton = document.getElementById('btn-guardar-modal');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    if (itemEditandoId) {
      await sissoFetch(`/matriz-riesgos/${itemEditandoId}`, { method: 'PUT', body: cuerpo });
    } else {
      await sissoFetch('/matriz-riesgos', { method: 'POST', body: cuerpo });
    }
    cerrarModal();
    mostrarExito('exito-lista', 'Riesgo guardado correctamente.');
    await cargarItems();
  } catch (err) {
    mostrarErrorModal(err.message || 'Error al guardar.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

async function eliminarItem(id) {
  if (!confirm('¿Eliminar este riesgo de la matriz?')) return;
  try {
    await sissoFetch(`/matriz-riesgos/${id}`, { method: 'DELETE' });
    mostrarExito('exito-lista', 'Riesgo eliminado.');
    await cargarItems();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// ------- Utilidades -------
function formatearFecha(fecha) {
  if (!fecha) return '';
  return new Date(fecha.split('T')[0] + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function mostrarErrorModal(msg) { mostrarError('error-modal', msg); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 4000); }
