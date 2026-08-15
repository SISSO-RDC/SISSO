// ============================================================
// SISSO - Puestos de Trabajo
// ============================================================

let catalogos = null;
let puestoEditandoId = null;

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('puestos', 'Puestos de Trabajo');
  await cargarCatalogos();
  renderizarMatricesRiesgo();
  await cargarPuestos();
});

async function cargarCatalogos() {
  try {
    const datos = await sissoFetch('/puestos-trabajo/catalogos');
    catalogos = datos.catalogos;
  } catch (err) {
    console.error('Error al cargar catálogos:', err);
  }
}

function renderizarMatricesRiesgo() {
  if (!catalogos) return;
  const categorias = [
    ['riesgosFisicos', 'Riesgos físicos', catalogos.RIESGOS_FISICOS],
    ['riesgosMecanicos', 'Riesgos mecánicos', catalogos.RIESGOS_MECANICOS],
    ['riesgosQuimicos', 'Riesgos químicos', catalogos.RIESGOS_QUIMICOS],
    ['riesgosBiologicos', 'Riesgos biológicos', catalogos.RIESGOS_BIOLOGICOS],
    ['riesgosErgonomicos', 'Riesgos ergonómicos', catalogos.RIESGOS_ERGONOMICOS],
    ['riesgosPsicosociales', 'Riesgos psicosociales', catalogos.RIESGOS_PSICOSOCIALES],
  ];
  document.getElementById('matrices-riesgo').innerHTML = categorias.map(([campo, titulo, valores]) => `
    <div class="matriz-riesgo">
      <div class="matriz-riesgo-titulo">${titulo}</div>
      <div class="chips-checkbox">
        ${valores.map(v => `
          <label class="chip-checkbox">
            <input type="checkbox" data-categoria="${campo}" data-valor="${v}"> ${v.replace(/_/g, ' ')}
          </label>`).join('')}
      </div>
    </div>`).join('');
}

function leerMatricesRiesgo() {
  const resultado = {};
  document.querySelectorAll('#matrices-riesgo input[type=checkbox]:checked').forEach(cb => {
    const cat = cb.dataset.categoria;
    if (!resultado[cat]) resultado[cat] = [];
    resultado[cat].push(cb.dataset.valor);
  });
  return resultado;
}

function marcarMatricesRiesgo(factoresRiesgo) {
  document.querySelectorAll('#matrices-riesgo input[type=checkbox]').forEach(cb => { cb.checked = false; });
  if (!factoresRiesgo) return;
  Object.entries(factoresRiesgo).forEach(([categoria, valores]) => {
    (valores || []).forEach(v => {
      const cb = document.querySelector(`#matrices-riesgo input[data-categoria="${categoria}"][data-valor="${v}"]`);
      if (cb) cb.checked = true;
    });
  });
}

async function cargarPuestos() {
  const tbody = document.getElementById('tabla-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="sisso-cargando">Cargando puestos…</td></tr>';
  try {
    const datos = await sissoFetch('/puestos-trabajo');
    const puestos = datos.puestos || [];

    if (puestos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="sisso-vacio">Aún no hay puestos de trabajo registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = puestos.map(p => `
      <tr>
        <td style="font-weight:600;">${escHtml(p.nombre_puesto)}</td>
        <td style="color:var(--t3);">${escHtml(p.area || '—')}</td>
        <td style="color:var(--t3);">${escHtml(p.codigo_ciuo || '—')}</td>
        <td>${p.numero_trabajadores_estimado ?? '—'}</td>
        <td>
          <button class="btn-mini" onclick="abrirModal('${p.id}')">✎ Editar</button>
          <button class="btn-mini" onclick="eliminarPuesto('${p.id}', '${escAttr(p.nombre_puesto)}')">🗑 Desactivar</button>
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</td></tr>`;
  }
}

async function abrirModal(id) {
  puestoEditandoId = id || null;
  document.getElementById('error-modal').classList.remove('visible');
  document.getElementById('titulo-modal').textContent = id ? 'Editar puesto de trabajo' : 'Nuevo puesto de trabajo';

  ['m-nombre', 'm-area', 'm-ciuo', 'm-numero-trabajadores', 'm-actividades', 'm-epp', 'm-medidas'].forEach(campoId => {
    document.getElementById(campoId).value = '';
  });
  marcarMatricesRiesgo(null);

  if (id) {
    try {
      const datos = await sissoFetch(`/puestos-trabajo/${id}`);
      const p = datos.puesto;
      document.getElementById('m-nombre').value = p.nombre_puesto || '';
      document.getElementById('m-area').value = p.area || '';
      document.getElementById('m-ciuo').value = p.codigo_ciuo || '';
      document.getElementById('m-numero-trabajadores').value = p.numero_trabajadores_estimado ?? '';
      document.getElementById('m-actividades').value = p.descripcion_actividades || '';
      document.getElementById('m-epp').value = p.epp_requerido || '';
      document.getElementById('m-medidas').value = p.medidas_preventivas || '';
      marcarMatricesRiesgo(p.factores_riesgo);
    } catch (err) {
      mostrarErrorModal(err.message || 'Error al cargar el puesto de trabajo.');
    }
  }

  document.getElementById('modal-puesto').classList.add('visible');
}

function cerrarModal() {
  document.getElementById('modal-puesto').classList.remove('visible');
  puestoEditandoId = null;
}

async function guardarPuesto() {
  document.getElementById('error-modal').classList.remove('visible');

  const nombrePuesto = document.getElementById('m-nombre').value.trim();
  if (!nombrePuesto) { mostrarErrorModal('El nombre del puesto es obligatorio.'); return; }

  const cuerpo = {
    nombrePuesto,
    area: document.getElementById('m-area').value.trim() || undefined,
    codigoCiuo: document.getElementById('m-ciuo').value.trim() || undefined,
    numeroTrabajadoresEstimado: document.getElementById('m-numero-trabajadores').value ? parseInt(document.getElementById('m-numero-trabajadores').value, 10) : undefined,
    descripcionActividades: document.getElementById('m-actividades').value.trim() || undefined,
    factoresRiesgo: leerMatricesRiesgo(),
    eppRequerido: document.getElementById('m-epp').value.trim() || undefined,
    medidasPreventivas: document.getElementById('m-medidas').value.trim() || undefined,
  };

  const boton = document.getElementById('btn-guardar-modal');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    if (puestoEditandoId) {
      await sissoFetch(`/puestos-trabajo/${puestoEditandoId}`, { method: 'PUT', body: cuerpo });
    } else {
      await sissoFetch('/puestos-trabajo', { method: 'POST', body: cuerpo });
    }
    cerrarModal();
    mostrarExito('exito-lista', 'Puesto de trabajo guardado correctamente.');
    await cargarPuestos();
  } catch (err) {
    mostrarErrorModal(err.message || 'Error al guardar el puesto de trabajo.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar puesto';
  }
}

async function eliminarPuesto(id, nombre) {
  if (!confirm(`¿Desactivar el puesto "${nombre}"? Podrás seguir viéndolo en registros existentes, pero no aparecerá para nuevas asignaciones.`)) return;
  try {
    await sissoFetch(`/puestos-trabajo/${id}`, { method: 'DELETE' });
    mostrarExito('exito-lista', 'Puesto de trabajo desactivado.');
    await cargarPuestos();
  } catch (err) {
    alert('Error al desactivar: ' + err.message);
  }
}

// ------- Utilidades -------
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
function mostrarErrorModal(msg) {
  const el = document.getElementById('error-modal');
  el.textContent = msg;
  el.classList.add('visible');
}
function mostrarExito(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 4000);
}
