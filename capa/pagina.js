// ============================================================
// SISSO - Logica de la pagina (capa/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let esGestor = false;
let usuariosOrganizacion = [];
let capaActualId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('capa', 'CAPA');

  const usuario = SissoSesion.obtenerUsuario();
  esGestor = ['admin', 'sso', 'medico'].includes(usuario.rol);

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
    const sel = document.getElementById('c-responsable');
    sel.innerHTML = '<option value="">Selecciona un responsable…</option>' +
      usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)} (${escHtml(u.rol)})</option>`).join('');
  } catch (err) {
    document.getElementById('c-responsable').innerHTML = '<option value="">Error al cargar usuarios</option>';
  }
}

async function crearCapa() {
  ocultarError('error-crear');
  ocultarExito('exito-crear');

  const origenTipo = document.getElementById('c-origen-tipo').value;
  const tipo = document.getElementById('c-tipo').value;
  const origenDescripcion = document.getElementById('c-origen-descripcion').value.trim();
  const hallazgo = document.getElementById('c-hallazgo').value.trim();
  const accion = document.getElementById('c-accion').value.trim();
  const responsableId = document.getElementById('c-responsable').value;
  const fechaLimite = document.getElementById('c-fecha-limite').value;
  const fechaEficacia = document.getElementById('c-fecha-eficacia').value;

  if (hallazgo.length < 10) { mostrarError('error-crear', 'El hallazgo debe tener al menos 10 caracteres.'); return; }
  if (accion.length < 5) { mostrarError('error-crear', 'La acción debe tener al menos 5 caracteres.'); return; }
  if (!responsableId) { mostrarError('error-crear', 'Selecciona un responsable.'); return; }
  if (!fechaLimite) { mostrarError('error-crear', 'Indica la fecha límite.'); return; }

  const boton = document.getElementById('btn-crear');
  boton.disabled = true;
  boton.textContent = 'Creando…';

  try {
    await sissoFetch('/capa', {
      method: 'POST',
      body: {
        origenTipo, tipo, origenDescripcion: origenDescripcion || undefined, hallazgo, descripcionAccion: accion,
        responsableId, fechaLimite, fechaRevisionEficacia: fechaEficacia || undefined,
      },
    });
    mostrarExito('exito-crear', 'Acción CAPA creada.');
    document.getElementById('c-origen-descripcion').value = '';
    document.getElementById('c-hallazgo').value = '';
    document.getElementById('c-accion').value = '';
    await cargarListado();
  } catch (err) {
    mostrarError('error-crear', err.message || 'Error al crear la acción CAPA.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Crear acción CAPA';
  }
}

async function cargarListado() {
  const cont = document.getElementById('lista-capa');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  const estado = document.getElementById('f-estado').value;
  const origen = document.getElementById('f-origen').value;
  const vencidas = document.getElementById('f-vencidas').checked;
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);
  if (origen) parametros.set('origenTipo', origen);
  if (vencidas) parametros.set('vencidas', 'true');

  try {
    const datos = await sissoFetch(`/capa?${parametros.toString()}`);
    const acciones = datos.acciones || [];
    if (acciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay acciones CAPA con estos filtros.</div>';
      return;
    }
    cont.innerHTML = acciones.map(a => `
      <div class="capa-item ${a.esta_vencida ? 'vencida' : ''}" data-on-click="abrirDetalle('${a.id}')">
        <div class="capa-cabecera">
          <div>${chipDeOrigen(a.origen_tipo)} ${chipDeTipo(a.tipo)}</div>
          ${chipDeEstado(a.estado)}
        </div>
        <div style="font-size:12.5px;color:var(--t2);margin-top:6px;">${escHtml(a.hallazgo)}</div>
        <div class="capa-meta">Responsable: ${escHtml(a.responsable_nombre || '—')} · Límite: ${formatearFecha(a.fecha_limite)}${a.esta_vencida ? ' · <strong style="color:var(--red2);">Vencida</strong>' : ''}</div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// ======= Detalle =======
async function abrirDetalle(id) {
  capaActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await cargarDetalle();
}

function volverAlListado() {
  capaActualId = null;
  document.getElementById('vista-listado').style.display = 'block';
  document.getElementById('vista-detalle').style.display = 'none';
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle');
  try {
    const datos = await sissoFetch(`/capa/${capaActualId}`);
    const c = datos.capa;

    document.getElementById('resumen-capa').innerHTML = `
      <div class="capa-cabecera">
        <div style="display:flex;gap:6px;">${chipDeOrigen(c.origen_tipo)} ${chipDeTipo(c.tipo)} ${chipDeEstado(c.estado)}</div>
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.6;">
        ${c.origen_descripcion ? `<strong>Origen:</strong> ${escHtml(c.origen_descripcion)}<br>` : ''}
        <strong>Hallazgo:</strong> ${escHtml(c.hallazgo)}<br>
        <strong>Acción:</strong> ${escHtml(c.descripcion_accion)}<br>
        <strong>Responsable:</strong> ${escHtml(c.responsable_nombre || '—')}<br>
        <strong>Fecha límite:</strong> ${formatearFecha(c.fecha_limite)}<br>
        ${c.fecha_implementacion ? `<strong>Implementada:</strong> ${formatearFecha(c.fecha_implementacion)}<br>` : ''}
        ${c.fecha_verificacion ? `<strong>Verificada:</strong> ${formatearFecha(c.fecha_verificacion)} por ${escHtml(c.verificado_por_nombre || '—')}${c.nota_verificacion ? ' — ' + escHtml(c.nota_verificacion) : ''}<br>` : ''}
        ${c.fecha_evaluacion_eficacia ? `<strong>Eficacia evaluada:</strong> ${formatearFecha(c.fecha_evaluacion_eficacia)} por ${escHtml(c.evaluado_por_nombre || '—')} — ${escHtml(c.nota_eficacia || '')}<br>` : ''}
      </div>`;

    // Flujo visual
    const pasos = ['pendiente', 'implementada', 'verificada', 'eficaz', 'cerrada'];
    const indiceActual = c.estado === 'no_eficaz' ? 3 : pasos.indexOf(c.estado === 'en_progreso' ? 'pendiente' : c.estado);
    document.getElementById('flujo-pasos').innerHTML = pasos.map((p, i) => {
      const clase = c.estado === 'no_eficaz' && p === 'eficaz' ? 'activo' : (i < indiceActual ? 'hecho' : (i === indiceActual ? 'activo' : ''));
      const etiqueta = p === 'eficaz' && c.estado === 'no_eficaz' ? 'No eficaz' : etiquetaEstado(p);
      return `<span class="flujo-paso ${clase}">${i + 1}. ${etiqueta}</span>`;
    }).join('');

    // Acciones de transicion segun estado y rol
    const cont = document.getElementById('acciones-transicion');
    if (!esGestor) { cont.innerHTML = ''; return; }

    if (['pendiente', 'en_progreso'].includes(c.estado)) {
      cont.innerHTML = `<button class="sisso-boton" data-on-click="marcarImplementada()">✓ Marcar como implementada</button>`;
    } else if (c.estado === 'implementada') {
      cont.innerHTML = `
        <div class="sisso-campo"><label class="sisso-etiqueta" for="t-nota-verif">Nota de verificación</label>
          <textarea id="t-nota-verif" class="sisso-textarea"></textarea></div>
        <button class="sisso-boton" data-on-click="marcarVerificada()">✓✓ Verificar implementación</button>`;
    } else if (c.estado === 'verificada') {
      cont.innerHTML = `
        <div class="sisso-campo"><label class="sisso-etiqueta" for="t-nota-eficacia">Nota de evaluación de eficacia * <span style="color:var(--t3);font-weight:400;">(¿el problema volvió a ocurrir?)</span></label>
          <textarea id="t-nota-eficacia" class="sisso-textarea"></textarea></div>
        <div style="display:flex;gap:8px;">
          <button class="sisso-boton" data-on-click="evaluarEficacia(true)">✓ Fue eficaz</button>
          <button class="sisso-boton secundario" data-on-click="evaluarEficacia(false)">✕ No fue eficaz</button>
        </div>`;
    } else if (c.estado === 'eficaz') {
      cont.innerHTML = `<button class="sisso-boton" data-on-click="cerrarCapa()">Cerrar acción CAPA</button>`;
    } else if (c.estado === 'no_eficaz') {
      cont.innerHTML = `<div class="sisso-vacio">La acción no fue eficaz. Abre una nueva acción CAPA para atacar el hallazgo desde el listado.</div>`;
    } else {
      cont.innerHTML = '';
    }
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar la acción CAPA.');
  }
}

async function marcarImplementada() {
  try {
    await sissoFetch(`/capa/${capaActualId}/implementar`, { method: 'PUT' });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al marcar como implementada.');
  }
}

async function marcarVerificada() {
  const nota = document.getElementById('t-nota-verif').value.trim();
  try {
    await sissoFetch(`/capa/${capaActualId}/verificar`, { method: 'PUT', body: { notaVerificacion: nota || undefined } });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al verificar.');
  }
}

async function evaluarEficacia(eficaz) {
  const nota = document.getElementById('t-nota-eficacia').value.trim();
  if (nota.length < 5) { mostrarError('error-detalle', 'La nota de eficacia debe tener al menos 5 caracteres.'); return; }
  try {
    await sissoFetch(`/capa/${capaActualId}/evaluar-eficacia`, { method: 'PUT', body: { eficaz, notaEficacia: nota } });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al evaluar la eficacia.');
  }
}

async function cerrarCapa() {
  try {
    await sissoFetch(`/capa/${capaActualId}/cerrar`, { method: 'PUT' });
    mostrarExito('exito-detalle', 'Acción CAPA cerrada.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cerrar.');
  }
}

// ======= Utilidades =======
function chipDeOrigen(origen) {
  const mapa = {
    manual: 'Manual', accidente: 'Accidente', casi_accidente: 'Casi accidente', matriz_riesgo: 'Matriz de riesgos',
    inspeccion: 'Inspección', enfermedad_profesional: 'Enfermedad profesional', auditoria: 'Auditoría',
  };
  return `<span class="sisso-chip gris">${mapa[origen] || origen}</span>`;
}
function chipDeTipo(tipo) {
  return `<span class="sisso-chip ${tipo === 'preventiva' ? 'teal' : 'azul'}">${tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}</span>`;
}
function etiquetaEstado(estado) {
  const mapa = {
    pendiente: 'Pendiente', en_progreso: 'En progreso', implementada: 'Implementada',
    verificada: 'Verificada', eficaz: 'Eficaz', no_eficaz: 'No eficaz', cerrada: 'Cerrada',
  };
  return mapa[estado] || estado;
}
function chipDeEstado(estado) {
  const mapa = {
    pendiente: 'gris', en_progreso: 'ambar', implementada: 'teal',
    verificada: 'azul', eficaz: 'verde', no_eficaz: 'rojo', cerrada: 'verde',
  };
  return `<span class="sisso-chip ${mapa[estado] || 'gris'}">${etiquetaEstado(estado)}</span>`;
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
