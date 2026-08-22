// ============================================================
// SISSO - Alertas: objetos persistentes gestionables (corrige el
// hallazgo G9 de la Auditoria SISSO N.06). Cada alerta ahora tiene
// un estado real (nueva/vista/en_gestion/resuelta/descartada), un
// responsable opcional y una nota de gestion -- ver
// alertasController.js para el detalle de la sincronizacion contra
// las señales de origen y el filtrado por rol.
// ============================================================

const ETIQUETAS_CATEGORIA = {
  emo_vencido: '🩺 EMO próximo a vencer o vencido',
  consentimiento_revocado: '✋ Consentimiento revocado',
  aptitud_no_apto: '⛔ Aptitud "No apto"',
  historia_clinica_limitada: '📋 Historia clínica: aptitud limitada',
  audiometria_sts: '🔊 Audiometría: STS positivo',
  espirometria_anormal: '💨 Espirometría: patrón anormal',
  visiometria_requiere_evaluacion: '👁️ Visiometría: requiere evaluación',
  nordico_prioritario: '🗂️ Cuestionario Nórdico: prioritario',
  niosh_riesgo_alto: '⚖️ NIOSH: riesgo alto',
};

const PAGINA_POR_CATEGORIA = {
  emo_vencido: '../trabajadores/index.html',
  consentimiento_revocado: '../consentimientos/index.html',
  aptitud_no_apto: '../aptitud/index.html',
  historia_clinica_limitada: '../historia-clinica/index.html',
  audiometria_sts: '../audiometria/index.html',
  espirometria_anormal: '../espirometria/index.html',
  visiometria_requiere_evaluacion: '../visiometria/index.html',
  nordico_prioritario: '../nordico/index.html',
  niosh_riesgo_alto: '../niosh/index.html',
};

let usuariosOrganizacion = [];
let alertaAbiertaId = null;

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('alertas', 'Alertas');
  await cargarUsuarios();
  await cargarAlertas();
});

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/usuarios');
    usuariosOrganizacion = datos.usuarios || [];
  } catch (err) { /* opcional: si falla, simplemente no se ofrece asignar responsable */ }
}

async function cargarAlertas() {
  const cont = document.getElementById('contenido-alertas');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  const estado = document.getElementById('f-estado').value;
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);

  try {
    const datos = await sissoFetch(`/alertas?${parametros.toString()}`);
    let alertas = datos.alertas || [];
    // Filtro por defecto (sin seleccionar estado): oculta resueltas/
    // descartadas para que el panel no se sature de historial viejo.
    if (!estado) alertas = alertas.filter(a => !['resuelta', 'descartada'].includes(a.estado));
    renderizar(alertas);
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

function renderizar(alertas) {
  const cont = document.getElementById('contenido-alertas');

  if (alertas.length === 0) {
    cont.innerHTML = '<div class="todo-bien">✅ No hay situaciones pendientes de atención en este momento.</div>';
    return;
  }

  const porCategoria = {};
  alertas.forEach(a => {
    if (!porCategoria[a.categoria]) porCategoria[a.categoria] = [];
    porCategoria[a.categoria].push(a);
  });

  cont.innerHTML = Object.keys(porCategoria).map(categoria => {
    const items = porCategoria[categoria];
    return `
      <div class="categoria-tarjeta">
        <div class="categoria-cabecera">
          <div class="categoria-titulo">${ETIQUETAS_CATEGORIA[categoria] || categoria}</div>
          <div class="categoria-contador">${items.length}</div>
        </div>
        ${items.map(item => renderizarAlerta(item, categoria)).join('')}
      </div>`;
  }).join('');
}

function renderizarAlerta(item, categoria) {
  const opcionesResponsable = '<option value="">Sin asignar</option>' +
    usuariosOrganizacion.map(u => `<option value="${u.id}" ${item.responsable_id === u.id ? 'selected' : ''}>${escHtml(u.nombre_completo)}</option>`).join('');

  return `
    <div class="alerta-item">
      <div class="alerta-cabecera" onclick="alternarGestion('${item.id}')">
        <div class="alerta-info">
          <strong>${escHtml(item.titulo)}</strong>
          <div class="alerta-detalle">${item.detalle ? escHtml(item.detalle) + ' · ' : ''}${chipDeEstado(item.estado)}${item.responsable_nombre ? ' · Responsable: ' + escHtml(item.responsable_nombre) : ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${item.trabajador_id ? `<button class="btn-mini" onclick="event.stopPropagation(); irATrabajador('${item.trabajador_id}', '${PAGINA_POR_CATEGORIA[categoria] || '#'}')">Ver →</button>` : ''}
          <span style="color:var(--teal2);font-size:12px;">Gestionar</span>
        </div>
      </div>
      <div class="alerta-gestion" id="gestion-${item.id}">
        <div class="alerta-gestion-fila">
          <select class="sisso-select" id="estado-${item.id}" style="max-width:180px;">
            <option value="nueva" ${item.estado === 'nueva' ? 'selected' : ''}>Nueva</option>
            <option value="vista" ${item.estado === 'vista' ? 'selected' : ''}>Vista</option>
            <option value="en_gestion" ${item.estado === 'en_gestion' ? 'selected' : ''}>En gestión</option>
            <option value="resuelta" ${item.estado === 'resuelta' ? 'selected' : ''}>Resuelta</option>
            <option value="descartada" ${item.estado === 'descartada' ? 'selected' : ''}>Descartada</option>
          </select>
          <select class="sisso-select" id="responsable-${item.id}" style="max-width:200px;">${opcionesResponsable}</select>
        </div>
        <textarea class="sisso-textarea" id="nota-${item.id}" placeholder="Nota de gestión (opcional)">${item.nota_gestion ? escHtml(item.nota_gestion) : ''}</textarea>
        <button class="sisso-boton secundario" style="margin-top:6px;" onclick="guardarGestion('${item.id}')">Guardar</button>
      </div>
    </div>`;
}

function alternarGestion(id) {
  const el = document.getElementById(`gestion-${id}`);
  const abierta = el.classList.contains('abierta');
  document.querySelectorAll('.alerta-gestion.abierta').forEach(e => e.classList.remove('abierta'));
  if (!abierta) {
    el.classList.add('abierta');
    // Al abrir por primera vez una alerta "nueva", la marcamos como
    // "vista" automaticamente -- igual que abrir un correo.
    if (!alertaAbiertaId || alertaAbiertaId !== id) {
      const selectEstado = document.getElementById(`estado-${id}`);
      if (selectEstado.value === 'nueva') selectEstado.value = 'vista';
    }
    alertaAbiertaId = id;
  }
}

async function guardarGestion(id) {
  const estado = document.getElementById(`estado-${id}`).value;
  const responsableId = document.getElementById(`responsable-${id}`).value;
  const nota = document.getElementById(`nota-${id}`).value.trim();

  try {
    await sissoFetch(`/alertas/${id}/estado`, {
      method: 'PUT',
      body: { estado, responsableId: responsableId || undefined, notaGestion: nota || undefined },
    });
    await cargarAlertas();
  } catch (err) {
    alert('Error al guardar: ' + (err.message || ''));
  }
}

function irATrabajador(trabajadorId, pagina) {
  if (trabajadorId) localStorage.setItem('sisso_trabajador_id', trabajadorId);
  window.location.href = pagina;
}

// ------- Utilidades -------
function chipDeEstado(estado) {
  const etiquetas = { nueva: 'Nueva', vista: 'Vista', en_gestion: 'En gestión', resuelta: 'Resuelta', descartada: 'Descartada' };
  return etiquetas[estado] || estado;
}
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
const escHtml = escaparHtml;
