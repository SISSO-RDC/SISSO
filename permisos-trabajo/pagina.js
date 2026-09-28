// ============================================================
// SISSO - Logica de permisos-trabajo/index.html (Lote 3, Sep 2026).
// Gestion completa: admin, sso.
// ============================================================
let permisoActualId = null;
let trabajadoresPropios = [];
let contratistasCache = [];
let firmaArchivoBase64 = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('permisos-trabajo', 'Permisos de trabajo');
  await Promise.all([cargarListado(), cargarAuxiliares()]);
});

document.addEventListener('change', (evento) => {
  if (evento.target.id === 'fi-archivo') {
    const archivo = evento.target.files[0];
    firmaArchivoBase64 = null;
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (e) => { firmaArchivoBase64 = e.target.result; };
    lector.readAsDataURL(archivo);
  }
});

async function cargarAuxiliares() {
  try { trabajadoresPropios = (await sissoFetch('/trabajadores')).trabajadores || []; } catch { trabajadoresPropios = []; }
  try {
    contratistasCache = (await sissoFetch('/contratistas')).contratistas || [];
    const opciones = contratistasCache.map(c => `<option value="${c.id}">${escaparHtml(c.razon_social)}</option>`).join('');
    document.getElementById('n-contratista').innerHTML = '<option value="">— Personal propio —</option>' + opciones;
    document.getElementById('fi-contratista').innerHTML = '<option value="">Selecciona…</option>' + opciones;
  } catch { contratistasCache = []; }
}

async function cargarListado() {
  const cont = document.getElementById('lista-permisos');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  const parametros = new URLSearchParams();
  const estado = document.getElementById('f-estado').value;
  const tipo = document.getElementById('f-tipo').value;
  if (estado) parametros.set('estado', estado);
  if (tipo) parametros.set('tipo', tipo);

  try {
    const datos = await sissoFetch(`/permisos-trabajo?${parametros.toString()}`);
    const permisos = datos.permisos || [];
    if (permisos.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay permisos con este filtro.</div>';
      return;
    }
    cont.innerHTML = permisos.map(p => `
      <div class="pt-item" data-on-click="abrirDetalle('${p.id}')">
        <div class="pt-cabecera">
          <div><strong>${etiquetaTipo(p.tipo)}</strong> · ${escaparHtml(p.area)}</div>
          ${chipEstado(p.estado)}
        </div>
        <div class="pt-meta">
          ${formatearFechaHora(p.fecha_inicio_prevista)} → ${formatearFechaHora(p.fecha_fin_prevista)}
          · ${escaparHtml(p.contratista_nombre || 'Personal propio')} · Solicitante: ${escaparHtml(p.solicitante_nombre || '—')}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escaparHtml(err.message || 'Error al cargar los permisos.')}</div>`;
  }
}

async function abrirDetalle(id) {
  permisoActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  await cargarDetalle();
}
function volverAlListado() {
  document.getElementById('vista-detalle').style.display = 'none';
  document.getElementById('vista-listado').style.display = 'block';
  permisoActualId = null;
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle'); ocultarExito('exito-detalle');
  try {
    const datos = await sissoFetch(`/permisos-trabajo/${permisoActualId}`);
    const p = datos.permiso;

    document.getElementById('resumen-permiso').innerHTML = `
      <div class="pt-cabecera">
        <strong style="font-size:14px;">${etiquetaTipo(p.tipo)} · ${escaparHtml(p.area)}</strong>
        ${chipEstado(p.estado)}
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.7;">
        ${escaparHtml(p.descripcion_tarea)}<br>
        <strong>Ejecuta:</strong> ${escaparHtml(p.contratista_nombre || 'Personal propio')}<br>
        <strong>Solicitante:</strong> ${escaparHtml(p.solicitante_nombre || '—')}
        ${p.autorizado_por_nombre ? `· <strong>Autorizó:</strong> ${escaparHtml(p.autorizado_por_nombre)}` : ''}<br>
        <strong>Ventana prevista:</strong> ${formatearFechaHora(p.fecha_inicio_prevista)} → ${formatearFechaHora(p.fecha_fin_prevista)}<br>
        <strong>Condiciones de inicio verificadas:</strong> ${p.condiciones_verificadas ? 'Sí' : 'No'}
        ${p.notas_cierre ? `<br><strong>Notas de cierre:</strong> ${escaparHtml(p.notas_cierre)}` : ''}
      </div>`;

    let acciones = '';
    if (p.estado === 'borrador') acciones += '<button class="sisso-boton" data-on-click="aprobarPermiso()">Aprobar</button> ';
    if (p.estado === 'aprobado') acciones += '<button class="sisso-boton" data-on-click="abrirModalIniciar()">Iniciar ejecución</button> ';
    if (p.estado === 'en_ejecucion') acciones += '<button class="sisso-boton" data-on-click="abrirModalCerrar()">Cerrar permiso</button> ';
    if (!['cerrado', 'cancelado'].includes(p.estado)) acciones += '<button class="sisso-boton secundario" data-on-click="abrirModalCancelar()">Cancelar permiso</button>';
    document.getElementById('acciones-permiso').innerHTML = acciones || '<div class="sisso-vacio">Permiso finalizado.</div>';

    document.getElementById('lista-pasos').innerHTML = (datos.pasos || []).map(s => `
      <div class="pt-paso">
        <strong>${s.orden}. ${escaparHtml(s.paso_tarea)}</strong><br>
        <span style="color:var(--t3);">Peligro:</span> ${escaparHtml(s.peligro_identificado)}<br>
        <span style="color:var(--t3);">Control:</span> ${escaparHtml(s.medida_control)}
        ${s.epp_requerido ? `<br><span style="color:var(--t3);">EPP:</span> ${escaparHtml(s.epp_requerido)}` : ''}
      </div>`).join('') || '<div class="sisso-vacio">Sin pasos.</div>';

    document.getElementById('lista-firmas').innerHTML = (datos.firmas || []).length === 0
      ? '<div class="sisso-vacio">Sin firmas registradas.</div>'
      : datos.firmas.map(f => `
        <div class="pt-paso" style="display:flex;justify-content:space-between;">
          <span>${escaparHtml(f.firmante_nombre || '—')} · ${escaparHtml(f.rol_firma)}</span>
          <span style="color:var(--t3);">${formatearFechaHora(f.firmado_en)}</span>
        </div>`).join('');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar el permiso.');
  }
}

// ======= Transiciones de estado =======
async function transicion(ruta, body, mensajeExito) {
  try {
    await sissoFetch(`/permisos-trabajo/${permisoActualId}/${ruta}`, { method: 'PATCH', body: body || {} });
    cerrarModales();
    mostrarExito('exito-detalle', mensajeExito);
    await cargarDetalle();
  } catch (err) {
    cerrarModales();
    mostrarError('error-detalle', err.message || 'Error al cambiar el estado del permiso.');
  }
}
function aprobarPermiso() { return transicion('aprobar', {}, 'Permiso aprobado.'); }

function abrirModalIniciar() {
  ocultarError('error-modal-iniciar');
  document.getElementById('i-condiciones').checked = false;
  document.getElementById('modal-iniciar').classList.add('visible');
}
function confirmarIniciarEjecucion() {
  if (!document.getElementById('i-condiciones').checked) {
    mostrarError('error-modal-iniciar', 'Debe confirmar la verificación de condiciones para iniciar.');
    return;
  }
  return transicion('iniciar-ejecucion', { condicionesVerificadas: true }, 'Ejecución iniciada.');
}

function abrirModalCerrar() {
  ocultarError('error-modal-cerrar');
  document.getElementById('z-notas').value = '';
  document.getElementById('modal-cerrar').classList.add('visible');
}
function confirmarCerrar() {
  return transicion('cerrar', { notasCierre: document.getElementById('z-notas').value.trim() || undefined }, 'Permiso cerrado.');
}

function abrirModalCancelar() {
  ocultarError('error-modal-cancelar');
  document.getElementById('x-motivo').value = '';
  document.getElementById('modal-cancelar').classList.add('visible');
}
function confirmarCancelar() {
  const motivo = document.getElementById('x-motivo').value.trim();
  if (!motivo) { mostrarError('error-modal-cancelar', 'Indica el motivo de la cancelación.'); return; }
  return transicion('cancelar', { motivo }, 'Permiso cancelado.');
}

// ======= Nuevo permiso (con pasos JSA dinamicos) =======
function abrirModalNuevoPermiso() {
  ocultarError('error-modal-nuevo');
  ['n-area', 'n-descripcion', 'n-inicio', 'n-fin'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('n-contratista').value = '';
  document.getElementById('filas-pasos').innerHTML = '';
  agregarFilaPaso();
  document.getElementById('modal-nuevo').classList.add('visible');
}
function agregarFilaPaso() {
  const cont = document.getElementById('filas-pasos');
  const fila = document.createElement('div');
  fila.className = 'pt-paso jsa-fila';
  fila.innerHTML = `
    <input class="sisso-input jsa-paso" placeholder="Paso de la tarea *" style="margin-bottom:6px;">
    <input class="sisso-input jsa-peligro" placeholder="Peligro identificado *" style="margin-bottom:6px;">
    <input class="sisso-input jsa-control" placeholder="Medida de control *" style="margin-bottom:6px;">
    <input class="sisso-input jsa-epp" placeholder="EPP requerido" style="margin-bottom:6px;">
    <button class="btn-mini" data-on-click="quitarFilaPaso(this)">Quitar paso</button>`;
  cont.appendChild(fila);
}
function quitarFilaPaso(boton) {
  const filas = document.querySelectorAll('#filas-pasos .jsa-fila');
  if (filas.length <= 1) return; // el JSA exige al menos un paso
  boton.closest('.jsa-fila').remove();
}
async function confirmarNuevoPermiso() {
  ocultarError('error-modal-nuevo');
  const tipo = document.getElementById('n-tipo').value;
  const area = document.getElementById('n-area').value.trim();
  const descripcionTarea = document.getElementById('n-descripcion').value.trim();
  const fechaInicioPrevista = document.getElementById('n-inicio').value;
  const fechaFinPrevista = document.getElementById('n-fin').value;

  if (!area) { mostrarError('error-modal-nuevo', 'Ingresa el área.'); return; }
  if (descripcionTarea.length < 10) { mostrarError('error-modal-nuevo', 'Describe la tarea (mínimo 10 caracteres).'); return; }
  if (!fechaInicioPrevista || !fechaFinPrevista) { mostrarError('error-modal-nuevo', 'Indica inicio y fin previstos.'); return; }
  if (new Date(fechaFinPrevista) <= new Date(fechaInicioPrevista)) { mostrarError('error-modal-nuevo', 'El fin debe ser posterior al inicio.'); return; }

  const pasos = [...document.querySelectorAll('#filas-pasos .jsa-fila')].map(f => ({
    paso: f.querySelector('.jsa-paso').value.trim(),
    peligroIdentificado: f.querySelector('.jsa-peligro').value.trim(),
    medidaControl: f.querySelector('.jsa-control').value.trim(),
    eppRequerido: f.querySelector('.jsa-epp').value.trim() || undefined,
  }));
  if (pasos.some(p => !p.paso || !p.peligroIdentificado || !p.medidaControl)) {
    mostrarError('error-modal-nuevo', 'Cada paso requiere tarea, peligro y medida de control.'); return;
  }

  try {
    await sissoFetch('/permisos-trabajo', {
      method: 'POST',
      body: {
        tipo, area, descripcionTarea, pasos,
        contratistaId: document.getElementById('n-contratista').value || undefined,
        fechaInicioPrevista: new Date(fechaInicioPrevista).toISOString(),
        fechaFinPrevista: new Date(fechaFinPrevista).toISOString(),
      },
    });
    cerrarModales();
    await cargarListado();
  } catch (err) {
    mostrarError('error-modal-nuevo', err.message || 'Error al guardar el permiso.');
  }
}

// ======= Firma =======
function abrirModalFirma() {
  ocultarError('error-modal-firma');
  firmaArchivoBase64 = null;
  document.getElementById('fi-archivo').value = '';
  document.getElementById('fi-tipo-persona').value = 'propio';
  document.getElementById('fi-rol').value = 'ejecutante';
  onCambioTipoPersonaFirma();
  document.getElementById('modal-firma').classList.add('visible');
}
function onCambioTipoPersonaFirma() {
  const esContratista = document.getElementById('fi-tipo-persona').value === 'contratista';
  document.getElementById('grupo-firma-contratista').style.display = esContratista ? '' : 'none';
  document.getElementById('fi-persona').innerHTML = esContratista
    ? '<option value="">Selecciona un contratista primero…</option>'
    : '<option value="">Selecciona…</option>' + trabajadoresPropios.map(t => `<option value="${t.id}">${escaparHtml(t.nombre_completo)}</option>`).join('');
}
async function onCambioContratistaFirma() {
  const id = document.getElementById('fi-contratista').value;
  let trabajadores = [];
  if (id) { try { trabajadores = (await sissoFetch(`/contratistas/${id}`)).trabajadores || []; } catch { trabajadores = []; } }
  document.getElementById('fi-persona').innerHTML = '<option value="">Selecciona…</option>' +
    trabajadores.map(t => `<option value="${t.id}">${escaparHtml(t.nombre_completo)}</option>`).join('');
}
async function confirmarFirma() {
  ocultarError('error-modal-firma');
  const esContratista = document.getElementById('fi-tipo-persona').value === 'contratista';
  const personaId = document.getElementById('fi-persona').value;
  if (!personaId) { mostrarError('error-modal-firma', 'Selecciona la persona.'); return; }
  if (!firmaArchivoBase64) { mostrarError('error-modal-firma', 'Adjunta la foto de la firma.'); return; }

  try {
    await sissoFetch(`/permisos-trabajo/${permisoActualId}/firmas`, {
      method: 'POST',
      body: {
        rolFirma: document.getElementById('fi-rol').value,
        firmaBase64: firmaArchivoBase64,
        trabajadorId: esContratista ? undefined : personaId,
        contratistaTrabajadorId: esContratista ? personaId : undefined,
      },
    });
    cerrarModales();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal-firma', err.message || 'Error al registrar la firma.');
  }
}

function cerrarModales() {
  ['modal-nuevo', 'modal-iniciar', 'modal-cerrar', 'modal-cancelar', 'modal-firma']
    .forEach(id => document.getElementById(id).classList.remove('visible'));
}

// ======= Utilidades =======
function etiquetaTipo(t) {
  const mapa = {
    trabajo_caliente: 'Trabajo en caliente', trabajo_altura: 'Trabajo en altura', espacio_confinado: 'Espacio confinado',
    electrico_loto: 'Eléctrico / LOTO', excavacion: 'Excavación', izaje_cargas: 'Izaje de cargas', otro: 'Otro',
  };
  return mapa[t] || t;
}
function chipEstado(e) {
  const mapa = {
    borrador: '<span class="sisso-chip gris">Borrador</span>', aprobado: '<span class="sisso-chip azul">Aprobado</span>',
    en_ejecucion: '<span class="sisso-chip ambar">En ejecución</span>', cerrado: '<span class="sisso-chip verde">Cerrado</span>',
    cancelado: '<span class="sisso-chip rojo">Cancelado</span>',
  };
  return mapa[e] || e;
}
function formatearFechaHora(f) {
  if (!f) return '—';
  return new Date(f).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function mostrarError(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 5000); }
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
