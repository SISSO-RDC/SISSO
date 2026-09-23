// ============================================================
// SISSO - Logica de obligaciones-legales/index.html (Lote 2, Sep 2026).
// Gestion completa: admin, sso.
// ============================================================
let usuariosOrganizacion = [];
let obligacionActualId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('obligaciones-legales', 'Obligaciones legales');
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
  const cont = document.getElementById('lista-obligaciones');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  const estado = document.getElementById('f-estado').value;
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);

  try {
    const datos = await sissoFetch(`/obligaciones-legales?${parametros.toString()}`);
    const obligaciones = datos.obligaciones || [];
    if (obligaciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay obligaciones con este filtro.</div>';
      return;
    }
    cont.innerHTML = obligaciones.map(o => `
      <div class="ol-item ${o.vencida ? 'vencida' : ''}" data-on-click="abrirDetalle('${o.id}')">
        <div class="ol-cabecera">
          <div><strong>${escHtml(o.titulo)}</strong></div>
          ${o.vencida ? '<span class="sisso-chip rojo">Vencida</span>' : chipEstadoCumplimiento(o.estado_cumplimiento)}
        </div>
        <div class="ol-meta">
          ${escHtml(etiquetaFrecuencia(o.frecuencia))} · Vence: ${formatearFecha(o.proxima_fecha_vencimiento)}
          · Responsable: ${escHtml(o.responsable_nombre || '—')}
          · ${o.estado_verificacion === 'verificada' ? '<span class="sisso-chip teal">Ref. verificada</span>' : '<span class="sisso-chip gris">Ref. sin verificar</span>'}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escHtml(err.message || 'Error al cargar las obligaciones.')}</div>`;
  }
}

async function abrirDetalle(id) {
  obligacionActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  await cargarDetalle();
}
function volverAlListado() {
  document.getElementById('vista-detalle').style.display = 'none';
  document.getElementById('vista-listado').style.display = 'block';
  obligacionActualId = null;
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle'); ocultarExito('exito-detalle');
  try {
    const datos = await sissoFetch(`/obligaciones-legales/${obligacionActualId}`);
    const o = datos.obligacion;
    const vencida = o.estado_cumplimiento === 'pendiente' && new Date(o.proxima_fecha_vencimiento) < new Date();

    document.getElementById('resumen-obligacion').innerHTML = `
      <div class="ol-cabecera">
        <strong style="font-size:14px;">${escHtml(o.titulo)}</strong>
        ${vencida ? '<span class="sisso-chip rojo">Vencida</span>' : chipEstadoCumplimiento(o.estado_cumplimiento)}
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.7;">
        ${o.descripcion ? escHtml(o.descripcion) + '<br>' : ''}
        <strong>Jurisdicción:</strong> ${escHtml(o.jurisdiccion || '—')}<br>
        <strong>Frecuencia:</strong> ${etiquetaFrecuencia(o.frecuencia)}<br>
        <strong>Responsable:</strong> ${escHtml(o.responsable_nombre || '—')}<br>
        <strong>Próximo vencimiento:</strong> ${formatearFecha(o.proxima_fecha_vencimiento)}<br>
        ${o.ultimo_cumplimiento_en ? `<strong>Último cumplimiento:</strong> ${formatearFecha(o.ultimo_cumplimiento_en)} ${o.ultimo_cumplimiento_nota ? '— ' + escHtml(o.ultimo_cumplimiento_nota) : ''}<br>` : ''}
        <strong>Referencia normativa:</strong> ${o.estado_verificacion === 'verificada'
          ? `verificada — ${escHtml(o.fuente_norma)} (${escHtml(o.articulo_referencia)}), validada ${formatearFecha(o.fecha_validacion)} por ${escHtml(o.verificado_por_nombre || '—')}`
          : 'sin verificar todavía'}
      </div>`;

    let acciones = '';
    if (o.estado_verificacion !== 'verificada') {
      acciones += '<button class="sisso-boton secundario" data-on-click="abrirModalVerificar()">Verificar referencia normativa</button> ';
    }
    if (o.estado_cumplimiento === 'pendiente') {
      acciones += '<button class="sisso-boton" data-on-click="marcarCumplida()">Marcar cumplida</button> ';
      if (!o.capa_id) acciones += '<button class="sisso-boton secundario" data-on-click="abrirModalCapa()">Generar CAPA</button>';
      else acciones += '<span class="sisso-chip teal">Ya tiene CAPA</span>';
    }
    document.getElementById('acciones-obligacion').innerHTML = acciones || '<div class="sisso-vacio">Sin acciones pendientes.</div>';
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar la obligación.');
  }
}

// ======= Nueva obligacion =======
function abrirModalNueva() {
  ocultarError('error-modal-nueva');
  ['n-titulo', 'n-descripcion', 'n-jurisdiccion', 'n-vencimiento'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('n-responsable').innerHTML = '<option value="">Selecciona…</option>' +
    usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)}</option>`).join('');
  document.getElementById('modal-nueva').classList.add('visible');
}
async function confirmarNuevaObligacion() {
  ocultarError('error-modal-nueva');
  const titulo = document.getElementById('n-titulo').value.trim();
  const descripcion = document.getElementById('n-descripcion').value.trim();
  const jurisdiccion = document.getElementById('n-jurisdiccion').value.trim();
  const frecuencia = document.getElementById('n-frecuencia').value;
  const responsableId = document.getElementById('n-responsable').value;
  const proximaFechaVencimiento = document.getElementById('n-vencimiento').value;

  if (!titulo) { mostrarError('error-modal-nueva', 'Ingresa el título.'); return; }
  if (!responsableId) { mostrarError('error-modal-nueva', 'Selecciona un responsable.'); return; }
  if (!proximaFechaVencimiento) { mostrarError('error-modal-nueva', 'Indica la fecha de vencimiento.'); return; }

  try {
    await sissoFetch('/obligaciones-legales', {
      method: 'POST',
      body: { titulo, descripcion: descripcion || undefined, jurisdiccion: jurisdiccion || undefined, frecuencia, responsableId, proximaFechaVencimiento },
    });
    cerrarModales();
    await cargarListado();
  } catch (err) {
    mostrarError('error-modal-nueva', err.message || 'Error al guardar la obligación.');
  }
}

// ======= Verificar =======
function abrirModalVerificar() {
  ocultarError('error-modal-verificar');
  ['v-fuente', 'v-jurisdiccion', 'v-articulo', 'v-fecha'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-verificar').classList.add('visible');
}
async function confirmarVerificar() {
  ocultarError('error-modal-verificar');
  const fuenteNorma = document.getElementById('v-fuente').value.trim();
  const jurisdiccion = document.getElementById('v-jurisdiccion').value.trim();
  const articuloReferencia = document.getElementById('v-articulo').value.trim();
  const fechaValidacion = document.getElementById('v-fecha').value;

  if (!fuenteNorma || !jurisdiccion || !articuloReferencia || !fechaValidacion) {
    mostrarError('error-modal-verificar', 'Todos los campos son obligatorios para verificar.'); return;
  }

  try {
    await sissoFetch(`/obligaciones-legales/${obligacionActualId}/verificar`, {
      method: 'PATCH', body: { fuenteNorma, jurisdiccion, articuloReferencia, fechaValidacion },
    });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-verificar', err.message || 'Error al verificar la referencia normativa.');
  }
}

// ======= Cumplir =======
async function marcarCumplida() {
  try {
    await sissoFetch(`/obligaciones-legales/${obligacionActualId}/cumplir`, { method: 'POST', body: {} });
    mostrarExito('exito-detalle', 'Obligación marcada como cumplida.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al marcar como cumplida.');
  }
}

// ======= Generar CAPA =======
function abrirModalCapa() {
  ocultarError('error-modal-capa');
  document.getElementById('c-responsable').innerHTML = '<option value="">Selecciona…</option>' +
    usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)}</option>`).join('');
  document.getElementById('c-fecha').value = '';
  document.getElementById('modal-capa').classList.add('visible');
}
async function confirmarGenerarCapa() {
  ocultarError('error-modal-capa');
  const responsableId = document.getElementById('c-responsable').value;
  const fechaLimite = document.getElementById('c-fecha').value;
  if (!responsableId) { mostrarError('error-modal-capa', 'Selecciona un responsable.'); return; }
  if (!fechaLimite) { mostrarError('error-modal-capa', 'Indica la fecha límite.'); return; }

  try {
    await sissoFetch(`/obligaciones-legales/${obligacionActualId}/generar-capa`, { method: 'POST', body: { responsableId, fechaLimite } });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-capa', err.message || 'Error al generar la acción CAPA.');
  }
}

function cerrarModales() {
  ['modal-nueva', 'modal-verificar', 'modal-capa'].forEach(id => document.getElementById(id).classList.remove('visible'));
}

// ======= Utilidades =======
function chipEstadoCumplimiento(estado) {
  return estado === 'cumplida' ? '<span class="sisso-chip verde">Cumplida</span>' : '<span class="sisso-chip azul">Pendiente</span>';
}
function etiquetaFrecuencia(f) {
  const mapa = { unica: 'Única', mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
  return mapa[f] || f;
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
