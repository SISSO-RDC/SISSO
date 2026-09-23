// ============================================================
// SISSO - Logica de auditorias/index.html (Lote 2, Sep 2026).
// Gestion completa: admin, sso.
// ============================================================
let usuariosOrganizacion = [];
let auditoriaActualId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('auditorias', 'Auditorías');
  await cargarUsuarios();
  await cargarListado();
});

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/usuarios');
    usuariosOrganizacion = datos.usuarios || [];
  } catch (err) { usuariosOrganizacion = []; }
}

async function cargarListado() {
  const cont = document.getElementById('lista-auditorias');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  try {
    const datos = await sissoFetch('/auditorias');
    const auditorias = datos.auditorias || [];
    if (auditorias.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay auditorías registradas.</div>';
      return;
    }
    cont.innerHTML = auditorias.map(a => `
      <div class="au-item" data-on-click="abrirDetalle('${a.id}')">
        <div class="au-cabecera">
          <div><span class="sisso-chip ${a.tipo === 'interna' ? 'azul' : 'teal'}">${a.tipo === 'interna' ? 'Interna' : 'Externa'}</span>
          ${a.norma_referencia ? escHtml(a.norma_referencia) : 'Auditoría'}</div>
          ${chipEstadoAuditoria(a.estado)}
        </div>
        <div class="au-meta">
          Programada: ${formatearFecha(a.fecha_programada)} ${a.auditor_nombre ? '· Auditor: ' + escHtml(a.auditor_nombre) : ''}
          · ${a.total_hallazgos} hallazgo(s)${a.hallazgos_sin_capa > 0 ? ` (${a.hallazgos_sin_capa} sin CAPA)` : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escHtml(err.message || 'Error al cargar las auditorías.')}</div>`;
  }
}

async function abrirDetalle(id) {
  auditoriaActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  await cargarDetalle();
}
function volverAlListado() {
  document.getElementById('vista-detalle').style.display = 'none';
  document.getElementById('vista-listado').style.display = 'block';
  auditoriaActualId = null;
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle'); ocultarExito('exito-detalle');
  try {
    const datos = await sissoFetch(`/auditorias/${auditoriaActualId}`);
    const a = datos.auditoria;

    document.getElementById('resumen-auditoria').innerHTML = `
      <div class="au-cabecera">
        <div><span class="sisso-chip ${a.tipo === 'interna' ? 'azul' : 'teal'}">${a.tipo === 'interna' ? 'Interna' : 'Externa'}</span>
        <strong>${escHtml(a.norma_referencia || 'Auditoría')}</strong></div>
        ${chipEstadoAuditoria(a.estado)}
      </div>
      <div style="margin-top:8px;font-size:13px;color:var(--t2);line-height:1.6;">
        ${a.alcance ? '<strong>Alcance:</strong> ' + escHtml(a.alcance) + '<br>' : ''}
        ${a.auditor_nombre ? '<strong>Auditor:</strong> ' + escHtml(a.auditor_nombre) + '<br>' : ''}
        <strong>Programada:</strong> ${formatearFecha(a.fecha_programada)}<br>
        ${a.fecha_ejecucion ? '<strong>Ejecutada:</strong> ' + formatearFecha(a.fecha_ejecucion) + '<br>' : ''}
      </div>`;

    let acciones = '';
    if (a.estado === 'programada') acciones += '<button class="sisso-boton secundario" data-on-click="cambiarEstado(\'en_progreso\')">Marcar en progreso</button> ';
    if (a.estado !== 'completada') acciones += '<button class="sisso-boton" data-on-click="cambiarEstado(\'completada\')">Marcar completada</button>';
    document.getElementById('acciones-auditoria').innerHTML = acciones || '<div class="sisso-vacio">Auditoría completada.</div>';

    document.getElementById('lista-hallazgos').innerHTML = (datos.hallazgos || []).length === 0
      ? '<div class="sisso-vacio">Sin hallazgos registrados todavía.</div>'
      : datos.hallazgos.map(h => `
        <div class="hallazgo-item">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            ${chipTipoHallazgo(h.tipo)}
            ${h.capa_id ? '<span class="sisso-chip teal">Con CAPA</span>' : `<button class="btn-mini" data-on-click="abrirModalCapa('${h.id}')">Generar CAPA</button>`}
          </div>
          <div style="margin-top:6px;font-size:13px;">${escHtml(h.descripcion)}</div>
        </div>`).join('');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar la auditoría.');
  }
}

async function cambiarEstado(estado) {
  try {
    await sissoFetch(`/auditorias/${auditoriaActualId}/estado`, {
      method: 'PATCH', body: { estado, fechaEjecucion: estado === 'completada' ? new Date().toISOString().slice(0, 10) : undefined },
    });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al actualizar la auditoría.');
  }
}

// ======= Nueva auditoria =======
function abrirModalNuevaAuditoria() {
  ocultarError('error-modal-nueva');
  ['n-norma', 'n-alcance', 'n-auditor', 'n-fecha'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-nueva').classList.add('visible');
}
async function confirmarNuevaAuditoria() {
  ocultarError('error-modal-nueva');
  const tipo = document.getElementById('n-tipo').value;
  const normaReferencia = document.getElementById('n-norma').value.trim();
  const alcance = document.getElementById('n-alcance').value.trim();
  const auditorNombre = document.getElementById('n-auditor').value.trim();
  const fechaProgramada = document.getElementById('n-fecha').value;

  if (!fechaProgramada) { mostrarError('error-modal-nueva', 'Indica la fecha programada.'); return; }

  try {
    await sissoFetch('/auditorias', {
      method: 'POST',
      body: { tipo, normaReferencia: normaReferencia || undefined, alcance: alcance || undefined, auditorNombre: auditorNombre || undefined, fechaProgramada },
    });
    cerrarModales();
    await cargarListado();
  } catch (err) {
    mostrarError('error-modal-nueva', err.message || 'Error al guardar la auditoría.');
  }
}

// ======= Hallazgo =======
function abrirModalHallazgo() {
  ocultarError('error-modal-hallazgo');
  document.getElementById('h-descripcion').value = '';
  document.getElementById('modal-hallazgo').classList.add('visible');
}
async function confirmarHallazgo() {
  ocultarError('error-modal-hallazgo');
  const tipo = document.getElementById('h-tipo').value;
  const descripcion = document.getElementById('h-descripcion').value.trim();
  if (descripcion.length < 5) { mostrarError('error-modal-hallazgo', 'La descripción debe tener al menos 5 caracteres.'); return; }

  try {
    await sissoFetch(`/auditorias/${auditoriaActualId}/hallazgos`, { method: 'POST', body: { tipo, descripcion } });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-hallazgo', err.message || 'Error al agregar el hallazgo.');
  }
}

// ======= Generar CAPA =======
function abrirModalCapa(hallazgoId) {
  ocultarError('error-modal-capa');
  document.getElementById('c-hallazgo-id').value = hallazgoId;
  document.getElementById('c-responsable').innerHTML = '<option value="">Selecciona…</option>' +
    usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)}</option>`).join('');
  document.getElementById('c-fecha').value = '';
  document.getElementById('modal-capa').classList.add('visible');
}
async function confirmarGenerarCapa() {
  ocultarError('error-modal-capa');
  const hallazgoId = document.getElementById('c-hallazgo-id').value;
  const responsableId = document.getElementById('c-responsable').value;
  const fechaLimite = document.getElementById('c-fecha').value;
  if (!responsableId) { mostrarError('error-modal-capa', 'Selecciona un responsable.'); return; }
  if (!fechaLimite) { mostrarError('error-modal-capa', 'Indica la fecha límite.'); return; }

  try {
    await sissoFetch(`/auditorias/hallazgos/${hallazgoId}/generar-capa`, { method: 'POST', body: { responsableId, fechaLimite } });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-capa', err.message || 'Error al generar la acción CAPA.');
  }
}

function cerrarModales() {
  ['modal-nueva', 'modal-hallazgo', 'modal-capa'].forEach(id => document.getElementById(id).classList.remove('visible'));
}

// ======= Utilidades =======
function chipEstadoAuditoria(estado) {
  const mapa = { programada: ['azul', 'Programada'], en_progreso: ['ambar', 'En progreso'], completada: ['verde', 'Completada'] };
  const [clase, label] = mapa[estado] || ['gris', estado];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function chipTipoHallazgo(tipo) {
  const mapa = { no_conformidad: ['rojo', 'No conformidad'], observacion: ['ambar', 'Observación'], oportunidad_mejora: ['verde', 'Oportunidad de mejora'] };
  const [clase, label] = mapa[tipo] || ['gris', tipo];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
const escHtml = escaparHtml;
function mostrarError(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 5000); }
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
