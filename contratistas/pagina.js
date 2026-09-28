// ============================================================
// SISSO - Logica de contratistas/index.html (Lote 3, Sep 2026).
// Gestion completa: admin, sso.
// ============================================================
let contratistaActualId = null;
let documentoArchivoBase64 = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('contratistas', 'Contratistas');
  await cargarListado();
});

document.addEventListener('change', (evento) => {
  if (evento.target.id === 'd-archivo') {
    const archivo = evento.target.files[0];
    documentoArchivoBase64 = null;
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (e) => { documentoArchivoBase64 = e.target.result; };
    lector.readAsDataURL(archivo);
  }
});

async function cargarListado() {
  const cont = document.getElementById('lista-contratistas');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  const estado = document.getElementById('f-estado').value;
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);

  try {
    const datos = await sissoFetch(`/contratistas?${parametros.toString()}`);
    const contratistas = datos.contratistas || [];
    if (contratistas.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay contratistas con este filtro.</div>';
      return;
    }
    cont.innerHTML = contratistas.map(c => `
      <div class="ct-item" data-on-click="abrirDetalle('${c.id}')">
        <div class="ct-cabecera">
          <div><strong>${escaparHtml(c.razon_social)}</strong> · ${escaparHtml(c.ruc)}</div>
          ${chipSemaforo(c.semaforo)}
        </div>
        <div class="ct-meta">
          ${escaparHtml(c.actividad || 'Sin actividad registrada')} · ${chipEstadoContratista(c.estado)}
          ${c.proximo_vencimiento ? ` · Próximo vencimiento: ${formatearFecha(c.proximo_vencimiento)}` : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escaparHtml(err.message || 'Error al cargar los contratistas.')}</div>`;
  }
}

async function abrirDetalle(id) {
  contratistaActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  await cargarDetalle();
}
function volverAlListado() {
  document.getElementById('vista-detalle').style.display = 'none';
  document.getElementById('vista-listado').style.display = 'block';
  contratistaActualId = null;
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle'); ocultarExito('exito-detalle');
  try {
    const datos = await sissoFetch(`/contratistas/${contratistaActualId}`);
    const c = datos.contratista;

    document.getElementById('resumen-contratista').innerHTML = `
      <div class="ct-cabecera">
        <strong style="font-size:14px;">${escaparHtml(c.razon_social)}</strong>
        ${chipEstadoContratista(c.estado)}
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.7;">
        <strong>RUC:</strong> ${escaparHtml(c.ruc)}<br>
        <strong>Representante legal:</strong> ${escaparHtml(c.representante_legal || '—')}<br>
        <strong>Contacto:</strong> ${escaparHtml(c.telefono_contacto || '—')} · ${escaparHtml(c.correo_contacto || '—')}<br>
        <strong>Actividad:</strong> ${escaparHtml(c.actividad || '—')}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;">
        ${c.estado !== 'activo' ? `<button class="sisso-boton secundario" data-on-click="cambiarEstadoContratista('activo')">Marcar activo</button>` : ''}
        ${c.estado !== 'suspendido' ? `<button class="sisso-boton secundario" data-on-click="cambiarEstadoContratista('suspendido')">Suspender</button>` : ''}
        ${c.estado !== 'inactivo' ? `<button class="sisso-boton secundario" data-on-click="cambiarEstadoContratista('inactivo')">Marcar inactivo</button>` : ''}
      </div>`;

    document.getElementById('lista-documentos').innerHTML = (datos.documentos || []).length === 0
      ? '<div class="sisso-vacio">Sin documentos registrados.</div>'
      : datos.documentos.map(d => `
        <div class="ct-fila">
          <span>${etiquetaTipoDocumento(d.tipo)} ${d.numero_documento ? '· ' + escaparHtml(d.numero_documento) : ''}</span>
          <span>${d.fecha_vencimiento ? (d.vencido ? '<span class="sisso-chip rojo">Vencido ' : '<span class="sisso-chip gris">Vence ') + formatearFecha(d.fecha_vencimiento) + '</span>' : '<span class="sisso-chip gris">Sin vencimiento</span>'}</span>
        </div>`).join('');

    document.getElementById('lista-trabajadores-contratista').innerHTML = (datos.trabajadores || []).length === 0
      ? '<div class="sisso-vacio">Sin trabajadores registrados.</div>'
      : datos.trabajadores.map(t => `
        <div class="ct-fila">
          <span>${escaparHtml(t.nombre_completo)} · ${escaparHtml(t.cedula)}</span>
          <span style="color:var(--t3);">${escaparHtml(t.cargo || '—')}</span>
        </div>`).join('');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar el contratista.');
  }
}

async function cambiarEstadoContratista(estado) {
  try {
    await sissoFetch(`/contratistas/${contratistaActualId}/estado`, { method: 'PATCH', body: { estado } });
    mostrarExito('exito-detalle', 'Estado actualizado.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cambiar el estado.');
  }
}

// ======= Nuevo contratista =======
function abrirModalNuevoContratista() {
  ocultarError('error-modal-nuevo');
  ['n-razon-social', 'n-ruc', 'n-representante', 'n-telefono', 'n-correo', 'n-actividad'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-nuevo').classList.add('visible');
}
async function confirmarNuevoContratista() {
  ocultarError('error-modal-nuevo');
  const razonSocial = document.getElementById('n-razon-social').value.trim();
  const ruc = document.getElementById('n-ruc').value.trim();
  if (!razonSocial) { mostrarError('error-modal-nuevo', 'Ingresa la razón social.'); return; }
  if (!ruc) { mostrarError('error-modal-nuevo', 'Ingresa el RUC.'); return; }

  try {
    await sissoFetch('/contratistas', {
      method: 'POST',
      body: {
        razonSocial, ruc,
        representanteLegal: document.getElementById('n-representante').value.trim() || undefined,
        telefonoContacto: document.getElementById('n-telefono').value.trim() || undefined,
        correoContacto: document.getElementById('n-correo').value.trim() || undefined,
        actividad: document.getElementById('n-actividad').value.trim() || undefined,
      },
    });
    cerrarModales();
    await cargarListado();
  } catch (err) {
    mostrarError('error-modal-nuevo', err.message || 'Error al guardar el contratista.');
  }
}

// ======= Nuevo documento =======
function abrirModalDocumento() {
  ocultarError('error-modal-documento');
  documentoArchivoBase64 = null;
  ['d-numero', 'd-emision', 'd-vencimiento'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('d-archivo').value = '';
  document.getElementById('modal-documento').classList.add('visible');
}
async function confirmarNuevoDocumento() {
  ocultarError('error-modal-documento');
  const tipo = document.getElementById('d-tipo').value;
  try {
    await sissoFetch(`/contratistas/${contratistaActualId}/documentos`, {
      method: 'POST',
      body: {
        tipo,
        numeroDocumento: document.getElementById('d-numero').value.trim() || undefined,
        fechaEmision: document.getElementById('d-emision').value || undefined,
        fechaVencimiento: document.getElementById('d-vencimiento').value || undefined,
        archivoBase64: documentoArchivoBase64 || undefined,
      },
    });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-documento', err.message || 'Error al guardar el documento.');
  }
}

// ======= Nuevo trabajador =======
function abrirModalTrabajador() {
  ocultarError('error-modal-trabajador');
  ['t-nombre', 't-cedula', 't-cargo'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-trabajador').classList.add('visible');
}
async function confirmarNuevoTrabajador() {
  ocultarError('error-modal-trabajador');
  const nombreCompleto = document.getElementById('t-nombre').value.trim();
  const cedula = document.getElementById('t-cedula').value.trim();
  if (!nombreCompleto) { mostrarError('error-modal-trabajador', 'Ingresa el nombre completo.'); return; }
  if (!cedula) { mostrarError('error-modal-trabajador', 'Ingresa la cédula.'); return; }

  try {
    await sissoFetch(`/contratistas/${contratistaActualId}/trabajadores`, {
      method: 'POST',
      body: { nombreCompleto, cedula, cargo: document.getElementById('t-cargo').value.trim() || undefined },
    });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-trabajador', err.message || 'Error al guardar el trabajador.');
  }
}

function cerrarModales() {
  ['modal-nuevo', 'modal-documento', 'modal-trabajador'].forEach(id => document.getElementById(id).classList.remove('visible'));
}

// ======= Utilidades =======
function chipSemaforo(s) {
  const mapa = {
    al_dia: '<span class="sisso-chip verde">Al día</span>',
    por_vencer: '<span class="sisso-chip ambar">Por vencer</span>',
    vencido: '<span class="sisso-chip rojo">Vencido</span>',
    sin_documentos: '<span class="sisso-chip gris">Sin documentos</span>',
  };
  return mapa[s] || '';
}
function chipEstadoContratista(estado) {
  const mapa = { activo: '<span class="sisso-chip verde">Activo</span>', suspendido: '<span class="sisso-chip ambar">Suspendido</span>', inactivo: '<span class="sisso-chip gris">Inactivo</span>' };
  return mapa[estado] || estado;
}
function etiquetaTipoDocumento(t) {
  const mapa = {
    poliza_responsabilidad_civil: 'Póliza de responsabilidad civil', poliza_riesgos_trabajo: 'Póliza de riesgos del trabajo',
    permiso_municipal: 'Permiso municipal', certificado_seguridad_industrial: 'Certificado de seguridad industrial',
    rup: 'RUP', ruc: 'RUC', otro: 'Otro',
  };
  return mapa[t] || t;
}
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
function mostrarError(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 5000); }
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
