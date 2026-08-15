// ============================================================
// SISSO - Certificados PDF: 3 tipos.
//   1. HCU 081 (documento derivado de una evaluacion clinica ya
//      registrada; usa los endpoints existentes de historia
//      clinica, solo funciona si el usuario es medico).
//   2. Asistencia a capacitacion (nuevo modulo: capacitaciones +
//      asistentes + certificado individual por asistente).
//   3. Aptitud independiente (certificado breve del estado
//      actual de trabajadores.aptitud).
// ============================================================

let trabajadoresCache = [];
let capacitacionAbiertaId = null;

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('certificados', 'Certificados PDF');
  await cargarTrabajadores();
  await cargarCapacitaciones();
});

async function cargarTrabajadores() {
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadoresCache = datos.trabajadores || [];
    const opciones = '<option value="">Selecciona un trabajador…</option>' +
      trabajadoresCache.map(t => `<option value="${t.id}">${escCert(t.nombre_completo)} — ${escCert(t.documento)}</option>`).join('');
    document.getElementById('hcu-trabajador').innerHTML = opciones;
    document.getElementById('apt-trabajador').innerHTML = opciones;
  } catch (err) {
    mostrarErrorCert('Error al cargar trabajadores: ' + err.message);
  }
}

// ------------------------------------------------------------
// Tabs
// ------------------------------------------------------------
function cambiarTab(tab) {
  document.querySelectorAll('.tab-cert').forEach(el => el.classList.toggle('activa', el.dataset.tab === tab));
  document.querySelectorAll('.panel-cert').forEach(el => el.classList.remove('activo'));
  document.getElementById(`panel-${tab}`).classList.add('activo');
  ocultarErrorCert();
}

// ============================================================
// TAB 1: HCU 081
// ============================================================
const ETIQUETAS_TIPO_EVAL = {
  preocupacional_inicio: 'Ingreso (preocupacional)', periodica: 'Periódico',
  reintegro: 'Reintegro', retiro: 'Retiro',
};
const ETIQUETAS_APTITUD_MSP = {
  apto: 'Apto', apto_en_observacion: 'Apto en observación',
  apto_con_limitaciones: 'Apto con limitaciones', no_apto: 'No apto',
};

async function cargarEvaluacionesHcu081() {
  const trabajadorId = document.getElementById('hcu-trabajador').value;
  const tabla = document.getElementById('tabla-hcu081');
  const sinDatos = document.getElementById('sin-evaluaciones-hcu081');
  tabla.style.display = 'none';
  sinDatos.style.display = 'none';
  if (!trabajadorId) return;

  ocultarErrorCert();
  try {
    const datos = await sissoFetch(`/historia-clinica/trabajadores/${trabajadorId}`);
    const evaluaciones = datos.evaluaciones || [];
    if (evaluaciones.length === 0) {
      sinDatos.style.display = 'block';
      return;
    }
    document.getElementById('tbody-hcu081').innerHTML = evaluaciones.map(e => `
      <tr>
        <td>${ETIQUETAS_TIPO_EVAL[e.tipo_evaluacion] || e.tipo_evaluacion}</td>
        <td>${formatearFechaCert(e.fecha_atencion)}</td>
        <td>${e.aptitud_msp ? ETIQUETAS_APTITUD_MSP[e.aptitud_msp] || e.aptitud_msp : '—'}</td>
        <td>${escCert(e.medico_nombre)}</td>
        <td><button class="btn-mini" onclick="descargarHcu081('${e.id}')">📄 Certificado</button></td>
      </tr>`).join('');
    tabla.style.display = '';
  } catch (err) {
    mostrarErrorCert('No se pudieron cargar las evaluaciones: ' + err.message + (err.message.includes('403') ? ' (este certificado solo lo puede generar el rol médico)' : ''));
  }
}

async function descargarHcu081(evaluacionId) {
  ocultarErrorCert();
  try {
    const blob = await sissoDescargarArchivo(`/historia-clinica/${evaluacionId}/certificado`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    mostrarErrorCert('Error al generar el certificado: ' + err.message);
  }
}

// ============================================================
// TAB 2: Capacitaciones
// ============================================================
async function cargarCapacitaciones() {
  const tbody = document.getElementById('tbody-capacitaciones');
  tbody.innerHTML = '<tr><td colspan="5" class="sisso-cargando">Cargando…</td></tr>';
  try {
    const datos = await sissoFetch('/capacitaciones');
    const filas = datos.capacitaciones || [];
    if (filas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="sisso-vacio">No hay capacitaciones registradas.</td></tr>';
      return;
    }
    tbody.innerHTML = filas.map(c => `
      <tr>
        <td style="font-weight:600;">${escCert(c.nombre)}</td>
        <td>${formatearFechaCert(c.fecha)}</td>
        <td>${c.horas_duracion}</td>
        <td>${c.total_asistentes}</td>
        <td>
          <button class="btn-mini" onclick="verAsistentes('${c.id}')">👥 Certificados</button>
          <button class="btn-mini" onclick="eliminarCapacitacion('${c.id}')">🗑</button>
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="sisso-vacio">Error: ${escCert(err.message)}</td></tr>`;
  }
}

function abrirModalCapacitacion() {
  document.getElementById('error-modal-capacitacion').classList.remove('visible');
  document.getElementById('cap-nombre').value = '';
  document.getElementById('cap-tema').value = '';
  document.getElementById('cap-fecha').value = '';
  document.getElementById('cap-horas').value = '';
  document.getElementById('cap-instructor').value = '';

  document.getElementById('lista-asistentes-modal').innerHTML = trabajadoresCache.map(t => `
    <label class="fila-asistente">
      <input type="checkbox" value="${t.id}">
      <span>${escCert(t.nombre_completo)} — ${escCert(t.documento)}</span>
    </label>`).join('') || '<div style="font-size:12px;color:var(--t3);">No hay trabajadores registrados.</div>';

  document.getElementById('modal-capacitacion').classList.add('visible');
}

function cerrarModalCapacitacion() {
  document.getElementById('modal-capacitacion').classList.remove('visible');
}

async function guardarCapacitacion() {
  const errorEl = document.getElementById('error-modal-capacitacion');
  errorEl.classList.remove('visible');

  const nombre = document.getElementById('cap-nombre').value.trim();
  const fecha = document.getElementById('cap-fecha').value;
  const horas = document.getElementById('cap-horas').value;

  if (!nombre || !fecha || !horas) {
    errorEl.textContent = 'Nombre, fecha y horas de duración son obligatorios.';
    errorEl.classList.add('visible');
    return;
  }

  const asistentes = Array.from(document.querySelectorAll('#lista-asistentes-modal input:checked')).map(el => el.value);

  const boton = document.getElementById('btn-guardar-capacitacion');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch('/capacitaciones', {
      method: 'POST',
      body: {
        nombre,
        tema: document.getElementById('cap-tema').value.trim() || undefined,
        instructor: document.getElementById('cap-instructor').value.trim() || undefined,
        fecha,
        horasDuracion: parseFloat(horas),
        asistentes,
      },
    });
    cerrarModalCapacitacion();
    mostrarExitoCert('Capacitación registrada correctamente.');
    await cargarCapacitaciones();
  } catch (err) {
    errorEl.textContent = err.message || 'Error al guardar.';
    errorEl.classList.add('visible');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

async function eliminarCapacitacion(id) {
  if (!confirm('¿Eliminar esta capacitación y su lista de asistentes?')) return;
  try {
    await sissoFetch(`/capacitaciones/${id}`, { method: 'DELETE' });
    mostrarExitoCert('Capacitación eliminada.');
    await cargarCapacitaciones();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

async function verAsistentes(capacitacionId) {
  capacitacionAbiertaId = capacitacionId;
  document.getElementById('error-modal-asistentes').classList.remove('visible');
  document.getElementById('tbody-asistentes').innerHTML = '<tr><td colspan="3" class="sisso-cargando">Cargando…</td></tr>';
  document.getElementById('modal-asistentes').classList.add('visible');

  try {
    const datos = await sissoFetch(`/capacitaciones/${capacitacionId}`);
    document.getElementById('titulo-modal-asistentes').textContent = `Asistentes — ${datos.capacitacion.nombre}`;
    const asistentes = datos.asistentes || [];
    if (asistentes.length === 0) {
      document.getElementById('tbody-asistentes').innerHTML = '<tr><td colspan="3" class="sisso-vacio">Esta capacitación no tiene asistentes registrados.</td></tr>';
      return;
    }
    document.getElementById('tbody-asistentes').innerHTML = asistentes.map(a => `
      <tr>
        <td>${escCert(a.nombre_completo)}</td>
        <td>${escCert(a.documento)}</td>
        <td><button class="btn-mini" onclick="descargarCertificadoCapacitacion('${capacitacionId}','${a.trabajador_id}')">📄 Generar</button></td>
      </tr>`).join('');
  } catch (err) {
    document.getElementById('error-modal-asistentes').textContent = err.message;
    document.getElementById('error-modal-asistentes').classList.add('visible');
  }
}

function cerrarModalAsistentes() {
  document.getElementById('modal-asistentes').classList.remove('visible');
}

async function descargarCertificadoCapacitacion(capacitacionId, trabajadorId) {
  try {
    const blob = await sissoDescargarArchivo(`/certificados/capacitacion/${capacitacionId}/trabajador/${trabajadorId}`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    alert('Error al generar el certificado: ' + err.message);
  }
}

// ============================================================
// TAB 3: Aptitud independiente
// ============================================================
const ETIQUETAS_APTITUD = { apto: 'Apto', con_restricciones: 'Con restricciones', no_apto: 'No apto', pendiente: 'Pendiente' };

function mostrarPreviewAptitud() {
  const id = document.getElementById('apt-trabajador').value;
  const preview = document.getElementById('preview-aptitud');
  if (!id) { preview.style.display = 'none'; return; }

  const trabajador = trabajadoresCache.find(t => t.id === id);
  const aptitud = trabajador ? trabajador.aptitud : 'pendiente';
  document.getElementById('preview-aptitud-chip').innerHTML = `<span class="aptitud-chip aptitud-${aptitud}">${ETIQUETAS_APTITUD[aptitud] || aptitud}</span>`;
  preview.style.display = 'block';
}

async function descargarCertificadoAptitud() {
  const id = document.getElementById('apt-trabajador').value;
  if (!id) return;
  ocultarErrorCert();
  try {
    const blob = await sissoDescargarArchivo(`/certificados/aptitud/${id}`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    mostrarErrorCert('Error al generar el certificado: ' + err.message);
  }
}

// ------- Utilidades -------
function formatearFechaCert(fecha) {
  if (!fecha) return '—';
  return new Date(fecha.split('T')[0] + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escCert = escaparHtml;
function mostrarErrorCert(msg) { const el = document.getElementById('error-cert'); el.textContent = msg; el.classList.add('visible'); }
function ocultarErrorCert() { document.getElementById('error-cert').classList.remove('visible'); }
function mostrarExitoCert(msg) { const el = document.getElementById('exito-cert'); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 4000); }
