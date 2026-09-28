// ============================================================
// SISSO - Logica de emergencias/index.html (Lote 4, Sep 2026).
// Gestion completa: admin, sso.
// ============================================================
let planActualId = null;
let equipoActualId = null;
let simulacroActualId = null;
let planArchivoBase64 = null;
let usuariosOrganizacion = [];

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('emergencias', 'Emergencias');
  try { usuariosOrganizacion = (await sissoFetch('/usuarios')).usuarios || []; } catch { usuariosOrganizacion = []; }
  await Promise.all([cargarPlanes(), cargarEquipos()]);
});

document.addEventListener('change', (evento) => {
  if (evento.target.id === 'p-archivo') {
    const archivo = evento.target.files[0];
    planArchivoBase64 = null;
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (e) => { planArchivoBase64 = e.target.result; };
    lector.readAsDataURL(archivo);
  }
});

function cambiarPestana(cual) {
  document.getElementById('tab-planes').classList.toggle('activa', cual === 'planes');
  document.getElementById('tab-equipos').classList.toggle('activa', cual === 'equipos');
  document.getElementById('vista-planes').style.display = cual === 'planes' ? '' : 'none';
  document.getElementById('vista-equipos').style.display = cual === 'equipos' ? '' : 'none';
}

// ======= Planes =======
async function cargarPlanes() {
  const cont = document.getElementById('lista-planes');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  try {
    const planes = (await sissoFetch('/emergencias/planes')).planes || [];
    cont.innerHTML = planes.length === 0
      ? '<div class="sisso-vacio">Aún no hay planes de emergencia.</div>'
      : planes.map(p => `
        <div class="em-item clic" data-on-click="abrirPlan('${p.id}')">
          <div class="em-cabecera">
            <div><strong>${escaparHtml(p.nombre)}</strong> · ${etiquetaEscenario(p.escenario)}</div>
            ${p.vigente ? '<span class="sisso-chip verde">Vigente</span>' : '<span class="sisso-chip gris">No vigente</span>'}
          </div>
          <div class="em-meta">
            ${escaparHtml(p.area_cobertura || 'Sin área definida')} · v${p.version}
            · ${p.total_simulacros} simulacro(s)${p.ultimo_simulacro ? ' · último: ' + formatearFecha(p.ultimo_simulacro) : ' · sin simulacros'}
          </div>
        </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escaparHtml(err.message || 'Error al cargar los planes.')}</div>`;
  }
}

async function abrirPlan(id) {
  planActualId = id;
  document.getElementById('vista-principal').style.display = 'none';
  document.getElementById('vista-plan').style.display = 'block';
  await cargarPlan();
}
function volverAPrincipal() {
  document.getElementById('vista-plan').style.display = 'none';
  document.getElementById('vista-principal').style.display = 'block';
  planActualId = null;
  cargarPlanes();
}

async function cargarPlan() {
  ocultarError('error-plan'); ocultarExito('exito-plan');
  try {
    const datos = await sissoFetch(`/emergencias/planes/${planActualId}`);
    const p = datos.plan;
    document.getElementById('resumen-plan').innerHTML = `
      <div class="em-cabecera">
        <strong style="font-size:14px;">${escaparHtml(p.nombre)}</strong>
        ${p.vigente ? '<span class="sisso-chip verde">Vigente</span>' : '<span class="sisso-chip gris">No vigente</span>'}
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.7;">
        <strong>Escenario:</strong> ${etiquetaEscenario(p.escenario)}<br>
        <strong>Cobertura:</strong> ${escaparHtml(p.area_cobertura || '—')} · <strong>Versión:</strong> ${p.version}<br>
        <strong>Documento:</strong> ${p.public_id ? 'cargado' : 'sin documento adjunto'}
      </div>`;

    const simulacros = datos.simulacros || [];
    document.getElementById('lista-simulacros').innerHTML = simulacros.length === 0
      ? '<div class="sisso-vacio">Este plan aún no tiene simulacros.</div>'
      : simulacros.map(s => `
        <div class="em-item">
          <div class="em-cabecera">
            <strong>${formatearFecha(s.fecha_realizado)}</strong>
            <span class="em-meta">${s.asistentes != null ? s.asistentes + ' asistentes' : ''}${s.duracion_minutos ? ' · ' + s.duracion_minutos + ' min' : ''}</span>
          </div>
          ${s.hallazgos ? `<div style="font-size:12.5px;margin-top:6px;">${escaparHtml(s.hallazgos)}</div>` : '<div class="em-meta">Sin hallazgos registrados.</div>'}
          <div style="margin-top:8px;">
            ${s.capa_id ? '<span class="sisso-chip teal">Ya tiene CAPA</span>'
              : (s.hallazgos ? `<button class="btn-mini" data-on-click="abrirModalCapa('${s.id}')">Generar CAPA</button>` : '')}
          </div>
        </div>`).join('');
  } catch (err) {
    mostrarError('error-plan', err.message || 'Error al cargar el plan.');
  }
}

function abrirModalNuevoPlan() {
  ocultarError('error-modal-plan');
  planArchivoBase64 = null;
  ['p-nombre', 'p-area'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('p-archivo').value = '';
  document.getElementById('modal-plan').classList.add('visible');
}
async function confirmarNuevoPlan() {
  ocultarError('error-modal-plan');
  const nombre = document.getElementById('p-nombre').value.trim();
  if (!nombre) { mostrarError('error-modal-plan', 'Ingresa el nombre del plan.'); return; }
  try {
    await sissoFetch('/emergencias/planes', {
      method: 'POST',
      body: {
        nombre, escenario: document.getElementById('p-escenario').value,
        areaCobertura: document.getElementById('p-area').value.trim() || undefined,
        archivoBase64: planArchivoBase64 || undefined,
      },
    });
    cerrarModales();
    await cargarPlanes();
  } catch (err) {
    mostrarError('error-modal-plan', err.message || 'Error al guardar el plan.');
  }
}

// ======= Simulacros =======
function abrirModalSimulacro() {
  ocultarError('error-modal-simulacro');
  ['s-fecha', 's-asistentes', 's-duracion', 's-hallazgos'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-simulacro').classList.add('visible');
}
async function confirmarSimulacro() {
  ocultarError('error-modal-simulacro');
  const fechaRealizado = document.getElementById('s-fecha').value;
  if (!fechaRealizado) { mostrarError('error-modal-simulacro', 'Indica la fecha del simulacro.'); return; }
  const asistentes = document.getElementById('s-asistentes').value;
  const duracion = document.getElementById('s-duracion').value;

  try {
    await sissoFetch(`/emergencias/planes/${planActualId}/simulacros`, {
      method: 'POST',
      body: {
        fechaRealizado,
        asistentes: asistentes ? parseInt(asistentes, 10) : undefined,
        duracionMinutos: duracion ? parseInt(duracion, 10) : undefined,
        hallazgos: document.getElementById('s-hallazgos').value.trim() || undefined,
      },
    });
    cerrarModales();
    await cargarPlan();
  } catch (err) {
    mostrarError('error-modal-simulacro', err.message || 'Error al registrar el simulacro.');
  }
}

function abrirModalCapa(simulacroId) {
  simulacroActualId = simulacroId;
  ocultarError('error-modal-capa');
  document.getElementById('c-responsable').innerHTML = '<option value="">Selecciona…</option>' +
    usuariosOrganizacion.map(u => `<option value="${u.id}">${escaparHtml(u.nombre_completo)}</option>`).join('');
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
    await sissoFetch(`/emergencias/simulacros/${simulacroActualId}/generar-capa`, { method: 'POST', body: { responsableId, fechaLimite } });
    cerrarModales();
    mostrarExito('exito-plan', 'Acción CAPA generada.');
    await cargarPlan();
  } catch (err) {
    mostrarError('error-modal-capa', err.message || 'Error al generar la acción CAPA.');
  }
}

// ======= Equipos =======
async function cargarEquipos() {
  const cont = document.getElementById('lista-equipos');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  const parametros = new URLSearchParams();
  if (document.getElementById('f-vencidos').value) parametros.set('vencidos', 'true');

  try {
    const equipos = (await sissoFetch(`/emergencias/equipos?${parametros.toString()}`)).equipos || [];
    cont.innerHTML = equipos.length === 0
      ? '<div class="sisso-vacio">No hay equipos con este filtro.</div>'
      : equipos.map(e => `
        <div class="em-item ${e.inspeccion_vencida ? 'vencido' : ''}">
          <div class="em-cabecera">
            <div><strong>${etiquetaEquipo(e.tipo)}</strong>${e.codigo_identificacion ? ' · ' + escaparHtml(e.codigo_identificacion) : ''} · ${escaparHtml(e.ubicacion)}</div>
            ${chipEstadoEquipo(e.estado)}
          </div>
          <div class="em-meta">
            Última inspección: ${formatearFecha(e.fecha_ultima_inspeccion)} · Próxima: ${formatearFecha(e.fecha_proxima_inspeccion)}
            ${e.inspeccion_vencida ? ' <span class="sisso-chip rojo">Inspección vencida</span>' : ''}
          </div>
          <div style="margin-top:8px;"><button class="btn-mini" data-on-click="abrirModalInspeccion('${e.id}')">Registrar inspección</button></div>
        </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escaparHtml(err.message || 'Error al cargar los equipos.')}</div>`;
  }
}

function abrirModalNuevoEquipo() {
  ocultarError('error-modal-equipo');
  ['e-codigo', 'e-ubicacion', 'e-ultima', 'e-proxima'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-equipo').classList.add('visible');
}
async function confirmarNuevoEquipo() {
  ocultarError('error-modal-equipo');
  const ubicacion = document.getElementById('e-ubicacion').value.trim();
  if (!ubicacion) { mostrarError('error-modal-equipo', 'Indica la ubicación.'); return; }
  try {
    await sissoFetch('/emergencias/equipos', {
      method: 'POST',
      body: {
        tipo: document.getElementById('e-tipo').value, ubicacion,
        codigoIdentificacion: document.getElementById('e-codigo').value.trim() || undefined,
        fechaUltimaInspeccion: document.getElementById('e-ultima').value || undefined,
        fechaProximaInspeccion: document.getElementById('e-proxima').value || undefined,
      },
    });
    cerrarModales();
    await cargarEquipos();
  } catch (err) {
    mostrarError('error-modal-equipo', err.message || 'Error al guardar el equipo.');
  }
}

function abrirModalInspeccion(id) {
  equipoActualId = id;
  ocultarError('error-modal-inspeccion');
  ['i-fecha', 'i-proxima'].forEach(x => document.getElementById(x).value = '');
  document.getElementById('i-estado').value = 'operativo';
  document.getElementById('modal-inspeccion').classList.add('visible');
}
async function confirmarInspeccion() {
  ocultarError('error-modal-inspeccion');
  const fechaInspeccion = document.getElementById('i-fecha').value;
  if (!fechaInspeccion) { mostrarError('error-modal-inspeccion', 'Indica la fecha de inspección.'); return; }
  try {
    await sissoFetch(`/emergencias/equipos/${equipoActualId}/inspeccion`, {
      method: 'PATCH',
      body: {
        fechaInspeccion, estado: document.getElementById('i-estado').value,
        fechaProximaInspeccion: document.getElementById('i-proxima').value || undefined,
      },
    });
    cerrarModales();
    await cargarEquipos();
  } catch (err) {
    mostrarError('error-modal-inspeccion', err.message || 'Error al registrar la inspección.');
  }
}

function cerrarModales() {
  ['modal-plan', 'modal-simulacro', 'modal-capa', 'modal-equipo', 'modal-inspeccion']
    .forEach(id => document.getElementById(id).classList.remove('visible'));
}

// ======= Utilidades =======
function etiquetaEscenario(e) {
  const mapa = { incendio: 'Incendio', sismo: 'Sismo', derrame_quimico: 'Derrame químico', evacuacion: 'Evacuación', atencion_medica: 'Atención médica', otro: 'Otro' };
  return mapa[e] || e;
}
function etiquetaEquipo(t) {
  const mapa = {
    extintor: 'Extintor', gabinete_contraincendios: 'Gabinete contraincendios', alarma: 'Alarma', dea: 'DEA',
    ducha_lavaojos: 'Ducha / lavaojos', botiquin: 'Botiquín', kit_derrame: 'Kit de derrame', otro: 'Otro',
  };
  return mapa[t] || t;
}
function chipEstadoEquipo(e) {
  const mapa = {
    operativo: '<span class="sisso-chip verde">Operativo</span>',
    requiere_mantenimiento: '<span class="sisso-chip ambar">Requiere mantenimiento</span>',
    fuera_de_servicio: '<span class="sisso-chip rojo">Fuera de servicio</span>',
  };
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
