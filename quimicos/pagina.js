// ============================================================
// SISSO - Logica de quimicos/index.html (Lote 4, Sep 2026).
// Gestion completa: admin, sso.
// ============================================================
let quimicoActualId = null;
let sdsNuevoBase64 = null;
let sdsActualizarBase64 = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('quimicos', 'Químicos y SDS');
  await cargarListado();
});

function leerArchivo(evento, asignar) {
  const archivo = evento.target.files[0];
  asignar(null);
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = (e) => asignar(e.target.result);
  lector.readAsDataURL(archivo);
}
document.addEventListener('change', (evento) => {
  if (evento.target.id === 'n-sds-archivo') leerArchivo(evento, (v) => { sdsNuevoBase64 = v; });
  if (evento.target.id === 's-archivo') leerArchivo(evento, (v) => { sdsActualizarBase64 = v; });
});

async function cargarListado() {
  const cont = document.getElementById('lista-quimicos');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  const parametros = new URLSearchParams();
  const estado = document.getElementById('f-estado').value;
  const sinSds = document.getElementById('f-sds').value;
  if (estado) parametros.set('estado', estado);
  if (sinSds) parametros.set('sinSds', sinSds);

  try {
    const datos = await sissoFetch(`/quimicos?${parametros.toString()}`);
    const quimicos = datos.quimicos || [];
    if (quimicos.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay químicos con este filtro.</div>';
      return;
    }
    cont.innerHTML = quimicos.map(q => `
      <div class="qm-item" data-on-click="abrirDetalle('${q.id}')">
        <div class="qm-cabecera">
          <div><strong>${escaparHtml(q.nombre_comercial)}</strong>${q.numero_cas ? ' · CAS ' + escaparHtml(q.numero_cas) : ''}</div>
          <div>${q.tiene_sds ? '<span class="sisso-chip verde">SDS cargada</span>' : '<span class="sisso-chip rojo">Sin SDS</span>'} ${chipEstado(q.estado)}</div>
        </div>
        <div class="qm-meta">
          ${escaparHtml(q.area)}
          ${q.cantidad_almacenada ? ' · ' + escaparHtml(String(q.cantidad_almacenada)) + ' ' + escaparHtml(q.unidad_medida || '') : ''}
          ${(q.clasificacion_ghs || []).length ? ' · GHS: ' + q.clasificacion_ghs.map(escaparHtml).join(', ') : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escaparHtml(err.message || 'Error al cargar el inventario.')}</div>`;
  }
}

async function abrirDetalle(id) {
  quimicoActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  await cargarDetalle();
}
function volverAlListado() {
  document.getElementById('vista-detalle').style.display = 'none';
  document.getElementById('vista-listado').style.display = 'block';
  quimicoActualId = null;
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle'); ocultarExito('exito-detalle');
  try {
    const q = (await sissoFetch(`/quimicos/${quimicoActualId}`)).quimico;
    document.getElementById('resumen-quimico').innerHTML = `
      <div class="qm-cabecera">
        <strong style="font-size:14px;">${escaparHtml(q.nombre_comercial)}</strong>
        ${chipEstado(q.estado)}
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.7;">
        <strong>Nombre químico:</strong> ${escaparHtml(q.nombre_quimico || '—')}<br>
        <strong>CAS:</strong> ${escaparHtml(q.numero_cas || '—')} · <strong>Fabricante:</strong> ${escaparHtml(q.fabricante || '—')}<br>
        <strong>Área:</strong> ${escaparHtml(q.area)}<br>
        <strong>Cantidad:</strong> ${q.cantidad_almacenada ? escaparHtml(String(q.cantidad_almacenada)) + ' ' + escaparHtml(q.unidad_medida || '') : '—'}<br>
        <strong>Clasificación GHS:</strong> ${(q.clasificacion_ghs || []).length ? q.clasificacion_ghs.map(escaparHtml).join(', ') : '—'}<br>
        <strong>Frases H:</strong> ${escaparHtml(q.frases_h || '—')}<br>
        <strong>SDS vigente:</strong> ${q.sds_public_id
          ? `versión ${escaparHtml(q.sds_version || '—')}, emitida ${formatearFecha(q.sds_fecha_emision)} (${escaparHtml(q.sds_idioma || 'es')})`
          : '<span class="sisso-chip rojo">No cargada</span>'}
      </div>`;

    let acciones = '<button class="sisso-boton secundario" data-on-click="abrirModalSds()">Actualizar SDS</button> ';
    if (q.estado !== 'activo') acciones += `<button class="sisso-boton secundario" data-on-click="cambiarEstado('activo')">Marcar activo</button> `;
    if (q.estado !== 'agotado') acciones += `<button class="sisso-boton secundario" data-on-click="cambiarEstado('agotado')">Marcar agotado</button> `;
    if (q.estado !== 'dado_de_baja') acciones += `<button class="sisso-boton secundario" data-on-click="cambiarEstado('dado_de_baja')">Dar de baja</button>`;
    document.getElementById('acciones-quimico').innerHTML = acciones;
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar el químico.');
  }
}

async function cambiarEstado(estado) {
  try {
    await sissoFetch(`/quimicos/${quimicoActualId}/estado`, { method: 'PATCH', body: { estado } });
    mostrarExito('exito-detalle', 'Estado actualizado.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cambiar el estado.');
  }
}

// ======= Nuevo quimico =======
function abrirModalNuevo() {
  ocultarError('error-modal-nuevo');
  sdsNuevoBase64 = null;
  ['n-comercial', 'n-quimico', 'n-cas', 'n-fabricante', 'n-area', 'n-cantidad', 'n-unidad', 'n-ghs', 'n-frases-h', 'n-sds-version', 'n-sds-fecha']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('n-sds-archivo').value = '';
  document.getElementById('modal-nuevo').classList.add('visible');
}
async function confirmarNuevo() {
  ocultarError('error-modal-nuevo');
  const nombreComercial = document.getElementById('n-comercial').value.trim();
  const area = document.getElementById('n-area').value.trim();
  if (!nombreComercial) { mostrarError('error-modal-nuevo', 'Ingresa el nombre comercial.'); return; }
  if (!area) { mostrarError('error-modal-nuevo', 'Ingresa el área.'); return; }

  const ghsTexto = document.getElementById('n-ghs').value.trim();
  const cantidad = document.getElementById('n-cantidad').value;

  try {
    await sissoFetch('/quimicos', {
      method: 'POST',
      body: {
        nombreComercial, area,
        nombreQuimico: document.getElementById('n-quimico').value.trim() || undefined,
        numeroCas: document.getElementById('n-cas').value.trim() || undefined,
        fabricante: document.getElementById('n-fabricante').value.trim() || undefined,
        cantidadAlmacenada: cantidad ? parseFloat(cantidad) : undefined,
        unidadMedida: document.getElementById('n-unidad').value.trim() || undefined,
        clasificacionGhs: ghsTexto ? ghsTexto.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        frasesH: document.getElementById('n-frases-h').value.trim() || undefined,
        sdsVersion: document.getElementById('n-sds-version').value.trim() || undefined,
        sdsFechaEmision: document.getElementById('n-sds-fecha').value || undefined,
        sdsArchivoBase64: sdsNuevoBase64 || undefined,
      },
    });
    cerrarModales();
    await cargarListado();
  } catch (err) {
    mostrarError('error-modal-nuevo', err.message || 'Error al guardar el químico.');
  }
}

// ======= Actualizar SDS =======
function abrirModalSds() {
  ocultarError('error-modal-sds');
  sdsActualizarBase64 = null;
  ['s-version', 's-fecha'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('s-archivo').value = '';
  document.getElementById('modal-sds').classList.add('visible');
}
async function confirmarActualizarSds() {
  ocultarError('error-modal-sds');
  if (!sdsActualizarBase64) { mostrarError('error-modal-sds', 'Adjunta el archivo PDF de la SDS.'); return; }
  try {
    await sissoFetch(`/quimicos/${quimicoActualId}/sds`, {
      method: 'PATCH',
      body: {
        sdsArchivoBase64: sdsActualizarBase64,
        sdsVersion: document.getElementById('s-version').value.trim() || undefined,
        sdsFechaEmision: document.getElementById('s-fecha').value || undefined,
      },
    });
    cerrarModales();
    mostrarExito('exito-detalle', 'SDS actualizada.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-sds', err.message || 'Error al actualizar la SDS.');
  }
}

function cerrarModales() {
  ['modal-nuevo', 'modal-sds'].forEach(id => document.getElementById(id).classList.remove('visible'));
}

// ======= Utilidades =======
function chipEstado(e) {
  const mapa = { activo: '<span class="sisso-chip verde">Activo</span>', agotado: '<span class="sisso-chip ambar">Agotado</span>', dado_de_baja: '<span class="sisso-chip gris">Dado de baja</span>' };
  return mapa[e] || e;
}
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
function mostrarError(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 5000); }
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
