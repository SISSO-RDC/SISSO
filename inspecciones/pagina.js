// ============================================================
// SISSO - Logica de la pagina (inspecciones/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let esGestor = false;
let usuariosOrganizacion = [];
let inspeccionActualId = null;
let hallazgoModalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('inspecciones', 'Inspecciones');

  const usuario = SissoSesion.obtenerUsuario();
  esGestor = ['admin', 'sso'].includes(usuario.rol);

  if (esGestor) {
    document.getElementById('caja-crear').style.display = 'block';
    await cargarUsuarios();
  }

  await cargarListado();
});

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/usuarios');
    usuariosOrganizacion = datos.usuarios || [];
    const opciones = '<option value="">Selecciona…</option>' +
      usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)} (${escHtml(u.rol)})</option>`).join('');
    document.getElementById('c-inspector').innerHTML = opciones;
    document.getElementById('m-responsable').innerHTML = opciones;
  } catch (err) {
    document.getElementById('c-inspector').innerHTML = '<option value="">Error al cargar</option>';
  }
}

async function crearInspeccion() {
  ocultarError('error-crear');
  ocultarExito('exito-crear');

  const tipo = document.getElementById('c-tipo').value;
  const fecha = document.getElementById('c-fecha').value;
  const area = document.getElementById('c-area').value.trim();
  const inspectorId = document.getElementById('c-inspector').value;

  if (!area) { mostrarError('error-crear', 'Indica el área o lugar.'); return; }
  if (!inspectorId) { mostrarError('error-crear', 'Selecciona un inspector.'); return; }

  const boton = document.getElementById('btn-crear');
  boton.disabled = true;
  boton.textContent = 'Programando…';

  try {
    await sissoFetch('/inspecciones', {
      method: 'POST', body: { tipo, area, fechaProgramada: fecha || undefined, inspectorId },
    });
    mostrarExito('exito-crear', 'Inspección programada.');
    document.getElementById('c-area').value = '';
    await cargarListado();
  } catch (err) {
    mostrarError('error-crear', err.message || 'Error al programar la inspección.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Programar inspección';
  }
}

async function cargarListado() {
  const cont = document.getElementById('lista-inspecciones');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  const estado = document.getElementById('f-estado').value;
  const tipo = document.getElementById('f-tipo').value;
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);
  if (tipo) parametros.set('tipo', tipo);

  try {
    const datos = await sissoFetch(`/inspecciones?${parametros.toString()}`);
    const inspecciones = datos.inspecciones || [];
    if (inspecciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay inspecciones con estos filtros.</div>';
      return;
    }
    cont.innerHTML = inspecciones.map(i => `
      <div class="insp-item" data-on-click="abrirDetalle('${i.id}')">
        <div class="insp-cabecera">
          <div>${chipDeTipo(i.tipo)}</div>
          ${chipDeEstado(i.estado)}
        </div>
        <div style="font-size:12.5px;color:var(--t2);margin-top:6px;">${escHtml(i.area)}</div>
        <div class="insp-meta">Inspector: ${escHtml(i.inspector_nombre || '—')}${i.fecha_programada ? ' · ' + formatearFecha(i.fecha_programada) : ''} · ${i.total_hallazgos} hallazgo(s)</div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// ======= Detalle =======
async function abrirDetalle(id) {
  inspeccionActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('form-item-caja').style.display = esGestor ? 'block' : 'none';
  document.getElementById('form-hallazgo-caja').style.display = esGestor ? 'block' : 'none';
  document.getElementById('cambiar-estado-caja').style.display = esGestor ? 'block' : 'none';
  await cargarDetalle();
}

function volverAlListado() {
  inspeccionActualId = null;
  document.getElementById('vista-listado').style.display = 'block';
  document.getElementById('vista-detalle').style.display = 'none';
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle');
  try {
    const datos = await sissoFetch(`/inspecciones/${inspeccionActualId}`);
    const i = datos.inspeccion;

    document.getElementById('resumen-inspeccion').innerHTML = `
      <div class="insp-cabecera">
        <div style="display:flex;gap:6px;">${chipDeTipo(i.tipo)} ${chipDeEstado(i.estado)}</div>
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.6;">
        <strong>Área:</strong> ${escHtml(i.area)}${i.nombre_puesto ? ' · ' + escHtml(i.nombre_puesto) : ''}<br>
        <strong>Inspector:</strong> ${escHtml(i.inspector_nombre || '—')}<br>
        ${i.fecha_programada ? `<strong>Programada:</strong> ${formatearFecha(i.fecha_programada)}<br>` : ''}
        ${i.fecha_ejecucion ? `<strong>Ejecutada:</strong> ${formatearFecha(i.fecha_ejecucion)}<br>` : ''}
        ${i.observaciones_generales ? `<strong>Observaciones:</strong> ${escHtml(i.observaciones_generales)}<br>` : ''}
      </div>`;
    document.getElementById('d-estado').value = i.estado;

    const items = datos.items || [];
    document.getElementById('lista-items').innerHTML = items.length === 0
      ? '<div class="sisso-vacio">Sin items todavía.</div>'
      : items.map(it => `
          <div class="item-fila">
            <span>${chipDeCumple(it.cumple)} ${escHtml(it.item)}${it.observacion ? ' — ' + escHtml(it.observacion) : ''}</span>
          </div>`).join('');

    const hallazgos = datos.hallazgos || [];
    document.getElementById('lista-hallazgos').innerHTML = hallazgos.length === 0
      ? '<div class="sisso-vacio">Sin hallazgos todavía.</div>'
      : hallazgos.map(h => `
          <div class="hallazgo-item">
            <div class="insp-cabecera">
              <span class="sisso-chip ${h.gravedad === 'alta' ? 'rojo' : (h.gravedad === 'media' ? 'ambar' : 'gris')}">${etiquetaGravedad(h.gravedad)}</span>
            </div>
            <div style="font-size:12.5px;color:var(--t2);margin-top:6px;">${escHtml(h.descripcion)}</div>
            ${h.capa_id
              ? '<div style="margin-top:6px;"><span class="sisso-chip verde">CAPA generada</span></div>'
              : (esGestor ? `<div style="margin-top:6px;"><button class="btn-mini" data-on-click="abrirModal('${h.id}')">Generar CAPA</button></div>` : '')}
          </div>`).join('');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar la inspección.');
  }
}

async function cambiarEstado() {
  ocultarError('error-detalle');
  ocultarExito('exito-detalle');
  const estado = document.getElementById('d-estado').value;
  try {
    await sissoFetch(`/inspecciones/${inspeccionActualId}`, { method: 'PUT', body: { estado } });
    mostrarExito('exito-detalle', 'Estado actualizado.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cambiar el estado.');
  }
}

async function agregarItem() {
  ocultarError('error-item');
  const item = document.getElementById('i-item').value.trim();
  const cumple = document.getElementById('i-cumple').value;
  const observacion = document.getElementById('i-observacion').value.trim();

  if (!item) { mostrarError('error-item', 'Escribe el item a verificar.'); return; }

  try {
    await sissoFetch(`/inspecciones/${inspeccionActualId}/items`, {
      method: 'POST', body: { item, cumple, observacion: observacion || undefined },
    });
    document.getElementById('i-item').value = '';
    document.getElementById('i-observacion').value = '';
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-item', err.message || 'Error al agregar el item.');
  }
}

async function agregarHallazgo() {
  ocultarError('error-hallazgo');
  const descripcion = document.getElementById('h-descripcion').value.trim();
  const gravedad = document.getElementById('h-gravedad').value;

  if (descripcion.length < 10) { mostrarError('error-hallazgo', 'La descripción debe tener al menos 10 caracteres.'); return; }

  try {
    await sissoFetch(`/inspecciones/${inspeccionActualId}/hallazgos`, {
      method: 'POST', body: { descripcion, gravedad },
    });
    document.getElementById('h-descripcion').value = '';
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-hallazgo', err.message || 'Error al agregar el hallazgo.');
  }
}

// ======= Modal generar CAPA =======
function abrirModal(hallazgoId) {
  hallazgoModalId = hallazgoId;
  ocultarError('error-modal');
  document.getElementById('modal-fondo').classList.add('visible');
}
function cerrarModal() {
  document.getElementById('modal-fondo').classList.remove('visible');
  hallazgoModalId = null;
}
async function confirmarGenerarCapa() {
  ocultarError('error-modal');
  const responsableId = document.getElementById('m-responsable').value;
  const fechaLimite = document.getElementById('m-fecha-limite').value;

  if (!responsableId) { mostrarError('error-modal', 'Selecciona un responsable.'); return; }
  if (!fechaLimite) { mostrarError('error-modal', 'Indica la fecha límite.'); return; }

  try {
    await sissoFetch(`/inspecciones/hallazgos/${hallazgoModalId}/generar-capa`, {
      method: 'POST', body: { responsableId, fechaLimite },
    });
    cerrarModal();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal', err.message || 'Error al generar la acción CAPA.');
  }
}

// ======= Utilidades =======
function chipDeTipo(tipo) {
  return `<span class="sisso-chip ${tipo === 'no_planeada' ? 'ambar' : 'teal'}">${tipo === 'no_planeada' ? 'No planeada' : 'Planeada'}</span>`;
}
function chipDeEstado(estado) {
  const mapa = { programada: 'gris', en_progreso: 'ambar', completada: 'verde' };
  const etiquetas = { programada: 'Programada', en_progreso: 'En progreso', completada: 'Completada' };
  return `<span class="sisso-chip ${mapa[estado] || 'gris'}">${etiquetas[estado] || estado}</span>`;
}
function chipDeCumple(cumple) {
  const mapa = { si: ['verde', '✓'], no: ['rojo', '✕'], no_aplica: ['gris', 'N/A'] };
  const [clase, label] = mapa[cumple] || ['gris', cumple];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function etiquetaGravedad(g) {
  return { baja: 'Baja', media: 'Media', alta: 'Alta' }[g] || g;
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
