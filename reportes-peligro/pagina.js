// ============================================================
// SISSO - Logica de la pagina (reportes-peligro/index.html).
// Panel interno de triage del canal publico de reporte de peligros
// (ver ../reporte-peligro/, sin login). Lote 1 del plan de cierre de
// brechas frente a plataformas EHS globales (Sep 2026).
// ============================================================
let usuariosOrganizacion = [];
let reporteActualId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('reportes-peligro', 'Reportes de peligro');
  await cargarUsuarios();
  await cargarListado();
});

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/usuarios');
    usuariosOrganizacion = datos.usuarios || [];
  } catch (err) {
    usuariosOrganizacion = [];
  }
}

async function cargarListado() {
  const cont = document.getElementById('lista-reportes');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  const estado = document.getElementById('f-estado').value;
  const clasificacion = document.getElementById('f-clasificacion').value;
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);
  if (clasificacion) parametros.set('clasificacion', clasificacion);

  try {
    const datos = await sissoFetch(`/reportes-peligro?${parametros.toString()}`);
    const reportes = datos.reportes || [];
    if (reportes.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay reportes con estos filtros.</div>';
      return;
    }
    cont.innerHTML = reportes.map(r => `
      <div class="rp-item ${r.estado === 'nuevo' ? 'nuevo' : ''}" data-on-click="abrirDetalle('${r.id}')">
        <div class="rp-cabecera">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${chipDeClasificacion(r.clasificacion)} ${chipDeEstado(r.estado)}</div>
          <span class="rp-meta">${formatearFecha(r.creado_en)}</span>
        </div>
        <div style="margin-top:8px;font-size:13px;color:var(--t2);">${escHtml(recortar(r.descripcion, 140))}</div>
        <div class="rp-meta">
          ${r.area ? escHtml(r.area) + ' · ' : ''}${r.anonimo ? 'Anónimo' : escHtml(r.reportante_nombre || '—')}
          ${r.total_evidencias > 0 ? ' · 📷 ' + r.total_evidencias : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escHtml(err.message || 'Error al cargar los reportes.')}</div>`;
  }
}

async function abrirDetalle(id) {
  reporteActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  await cargarDetalle();
}

function volverAlListado() {
  document.getElementById('vista-detalle').style.display = 'none';
  document.getElementById('vista-listado').style.display = 'block';
  reporteActualId = null;
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle');
  ocultarExito('exito-detalle');
  document.getElementById('img-evidencia').style.display = 'none';

  try {
    const datos = await sissoFetch(`/reportes-peligro/${reporteActualId}`);
    const r = datos.reporte;

    document.getElementById('resumen-reporte').innerHTML = `
      <div class="rp-cabecera">
        <div style="display:flex;gap:6px;">${chipDeClasificacion(r.clasificacion)} ${chipDeEstado(r.estado)}</div>
        <span class="rp-meta">${formatearFecha(r.creado_en)}</span>
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.6;">
        <strong>Descripción:</strong> ${escHtml(r.descripcion)}<br>
        ${r.area ? `<strong>Área:</strong> ${escHtml(r.area)}<br>` : ''}
        ${r.ubicacion_texto ? `<strong>Ubicación:</strong> ${escHtml(r.ubicacion_texto)}<br>` : ''}
        <strong>Reportante:</strong> ${r.anonimo ? 'Anónimo' : escHtml(r.reportante_nombre || '—')}<br>
        ${r.nota_triage ? `<strong>Nota de triage:</strong> ${escHtml(r.nota_triage)}<br>` : ''}
        ${r.revisado_por_nombre ? `<strong>Revisado por:</strong> ${escHtml(r.revisado_por_nombre)}<br>` : ''}
      </div>`;

    const evidencias = datos.evidencias || [];
    if (evidencias.length > 0) {
      await mostrarPrimeraEvidencia(evidencias[0].id);
    }

    document.getElementById('acciones-triage').innerHTML = construirAccionesTriage(r);
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar el reporte.');
  }
}

async function mostrarPrimeraEvidencia(evidenciaId) {
  try {
    const datos = await sissoFetch(`/reportes-peligro/evidencias/${evidenciaId}/url`);
    const img = document.getElementById('img-evidencia');
    img.src = datos.url;
    img.style.display = 'block';
  } catch (err) {
    // No es critico si la evidencia no carga; el resto del detalle sigue visible.
  }
}

function construirAccionesTriage(r) {
  if (r.estado === 'con_capa') {
    return '<div class="sisso-vacio">Este reporte ya generó una acción CAPA.</div>';
  }
  if (['descartado', 'cerrado'].includes(r.estado)) {
    return '<div class="sisso-vacio">Este reporte ya fue cerrado.</div>';
  }
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${r.estado === 'nuevo' ? '<button class="sisso-boton secundario" data-on-click="marcarEnRevision()">Marcar en revisión</button>' : ''}
      <button class="sisso-boton secundario" data-on-click="abrirModalDescartar()">Descartar</button>
      <button class="sisso-boton secundario" data-on-click="marcarCerrado()">Cerrar sin CAPA</button>
      <button class="sisso-boton" data-on-click="abrirModalCapa()">Generar CAPA</button>
    </div>`;
}

async function marcarEnRevision() {
  try {
    await sissoFetch(`/reportes-peligro/${reporteActualId}/triage`, { method: 'PATCH', body: { estado: 'en_revision' } });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al actualizar el reporte.');
  }
}

async function marcarCerrado() {
  try {
    await sissoFetch(`/reportes-peligro/${reporteActualId}/triage`, { method: 'PATCH', body: { estado: 'cerrado' } });
    mostrarExito('exito-detalle', 'Reporte cerrado.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cerrar el reporte.');
  }
}

// ======= Modal descartar =======
function abrirModalDescartar() {
  ocultarError('error-modal-descartar');
  document.getElementById('d-nota').value = '';
  document.getElementById('modal-descartar').classList.add('visible');
}
async function confirmarDescartar() {
  ocultarError('error-modal-descartar');
  const nota = document.getElementById('d-nota').value.trim();
  if (nota.length < 5) { mostrarError('error-modal-descartar', 'El motivo debe tener al menos 5 caracteres.'); return; }

  try {
    await sissoFetch(`/reportes-peligro/${reporteActualId}/triage`, {
      method: 'PATCH', body: { estado: 'descartado', notaTriage: nota },
    });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-descartar', err.message || 'Error al descartar el reporte.');
  }
}

// ======= Modal generar CAPA =======
function abrirModalCapa() {
  ocultarError('error-modal-capa');
  const opciones = '<option value="">Selecciona…</option>' +
    usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)} (${escHtml(u.rol)})</option>`).join('');
  document.getElementById('m-responsable').innerHTML = opciones;
  document.getElementById('m-fecha-limite').value = '';
  document.getElementById('modal-capa').classList.add('visible');
}
async function confirmarGenerarCapa() {
  ocultarError('error-modal-capa');
  const responsableId = document.getElementById('m-responsable').value;
  const fechaLimite = document.getElementById('m-fecha-limite').value;

  if (!responsableId) { mostrarError('error-modal-capa', 'Selecciona un responsable.'); return; }
  if (!fechaLimite) { mostrarError('error-modal-capa', 'Indica la fecha límite.'); return; }

  try {
    await sissoFetch(`/reportes-peligro/${reporteActualId}/generar-capa`, {
      method: 'POST', body: { responsableId, fechaLimite },
    });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-capa', err.message || 'Error al generar la acción CAPA.');
  }
}

function cerrarModales() {
  document.getElementById('modal-descartar').classList.remove('visible');
  document.getElementById('modal-capa').classList.remove('visible');
}

// ======= Utilidades =======
function chipDeClasificacion(c) {
  const mapa = {
    condicion_insegura: ['ambar', 'Condición insegura'],
    acto_inseguro: ['rojo', 'Acto inseguro'],
    casi_accidente: ['rojo', 'Casi accidente'],
    observacion_positiva: ['verde', 'Observación positiva'],
    sugerencia: ['azul', 'Sugerencia'],
  };
  const [clase, label] = mapa[c] || ['gris', c];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function chipDeEstado(estado) {
  const mapa = { nuevo: 'azul', en_revision: 'ambar', con_capa: 'teal', descartado: 'gris', cerrado: 'verde' };
  const etiquetas = { nuevo: 'Nuevo', en_revision: 'En revisión', con_capa: 'Con CAPA', descartado: 'Descartado', cerrado: 'Cerrado' };
  return `<span class="sisso-chip ${mapa[estado] || 'gris'}">${etiquetas[estado] || estado}</span>`;
}
function recortar(texto, max) {
  if (!texto) return '';
  return texto.length > max ? texto.slice(0, max) + '…' : texto;
}
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

const escHtml = escaparHtml;
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
  setTimeout(() => el.classList.remove('visible'), 5000);
}
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
