// ============================================================
// SISSO - Logica de la pagina (capacitaciones/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let esGestor = false;
let usuarioActual = null;
let trabajadores = [];
let capacitacionActualId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('capacitaciones', 'Capacitaciones');

  usuarioActual = SissoSesion.obtenerUsuario();
  esGestor = ['admin', 'sso', 'th'].includes(usuarioActual.rol);

  // CORREGIDO a pedido de la persona usuaria (02/09/2026): el
  // backend ya permite que cualquier usuario autenticado registre
  // una capacitación, siempre que se auto-asigne como instructor
  // (ver capacitacionesController.crear -- instructorUsuarioId debe
  // ser su propio usuario si su rol no es admin/sso/th). El
  // formulario ya no se oculta para el resto de roles; si no es
  // gestor, se le avisa que la capacitación quedará registrada como
  // dictada por él mismo.
  document.getElementById('caja-crear').style.display = 'block';
  if (!esGestor) {
    const nota = document.getElementById('nota-instructor');
    nota.textContent = 'Vas a registrar una capacitación que tú mismo dictaste. Quedará vinculada a tu usuario como instructor.';
    nota.style.display = 'block';
  } else if (['medico', 'sso'].includes(usuarioActual.rol)) {
    // CREADO en Auditoria N.15: medico/sso SI son "gestores" (pueden
    // registrar capacitaciones dictadas por terceros), pero tambien
    // pueden haber sido ellos mismos quienes la dictaron -- se les
    // ofrece la opcion explicita en vez de asumir ninguno de los dos casos.
    document.getElementById('caja-autoinstructor').style.display = 'block';
  }
  await cargarTrabajadoresChecklist();
  inicializarSeleccionarTodos();

  await cargarListado();
});

function inicializarSeleccionarTodos() {
  const checkboxMaestro = document.getElementById('chk-seleccionar-todos');
  const botonDeseleccionar = document.getElementById('btn-deseleccionar-todos');
  const contenedor = document.getElementById('checklist-trabajadores');

  checkboxMaestro.addEventListener('change', () => {
    contenedor.querySelectorAll('.chk-asistente').forEach((cb) => { cb.checked = checkboxMaestro.checked; });
  });

  botonDeseleccionar.addEventListener('click', () => {
    checkboxMaestro.checked = false;
    contenedor.querySelectorAll('.chk-asistente').forEach((cb) => { cb.checked = false; });
  });

  // Si alguien destilda un asistente a mano, el checkbox maestro
  // deja de marcarse como "todos seleccionados" (evita el estado
  // enganoso de decir "todos" cuando en realidad falta uno).
  contenedor.addEventListener('change', (e) => {
    if (!e.target.classList.contains('chk-asistente')) return;
    const todos = Array.from(contenedor.querySelectorAll('.chk-asistente'));
    checkboxMaestro.checked = todos.length > 0 && todos.every((cb) => cb.checked);
  });
}

async function cargarTrabajadoresChecklist() {
  const cont = document.getElementById('checklist-trabajadores');
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadores = datos.trabajadores || [];
    if (trabajadores.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay trabajadores registrados.</div>';
      return;
    }
    cont.innerHTML = trabajadores.map(t => `
      <label class="checklist-fila">
        <input type="checkbox" class="chk-asistente" value="${t.id}">
        ${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}
      </label>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar trabajadores: ${escHtml(err.message)}</div>`;
  }
}

async function crearCapacitacion() {
  ocultarError('error-crear');
  ocultarExito('exito-crear');

  const nombre = document.getElementById('c-nombre').value.trim();
  const tema = document.getElementById('c-tema').value.trim();
  const instructor = document.getElementById('c-instructor').value.trim();
  const fecha = document.getElementById('c-fecha').value;
  const horas = document.getElementById('c-horas').value;
  const asistentes = Array.from(document.querySelectorAll('.chk-asistente:checked')).map(el => el.value);

  if (!nombre) { mostrarError('error-crear', 'Indica el nombre de la capacitación.'); return; }
  if (!fecha) { mostrarError('error-crear', 'Indica la fecha.'); return; }
  if (!horas) { mostrarError('error-crear', 'Indica las horas de duración.'); return; }

  const boton = document.getElementById('btn-crear');
  boton.disabled = true;
  boton.textContent = 'Registrando…';

  try {
    await sissoFetch('/capacitaciones', {
      method: 'POST',
      body: {
        nombre, tema: tema || undefined, instructor: instructor || undefined,
        fecha, horasDuracion: parseFloat(horas), asistentes,
        // CORREGIDO en Auditoria N.15: un gestor (admin/sso/th) tambien
        // puede auto-asignarse como instructor si marco el checkbox "Yo
        // dicté esta capacitación" -- antes solo se auto-asignaba un
        // no-gestor de forma obligatoria; un medico/sso que SI es
        // "gestor" no tenia como indicarlo.
        instructorUsuarioId: !esGestor
          ? usuarioActual.id
          : (document.getElementById('c-yo-dicte')?.checked ? usuarioActual.id : undefined),
      },
    });
    mostrarExito('exito-crear', 'Capacitación registrada.');
    document.getElementById('c-nombre').value = '';
    document.getElementById('c-tema').value = '';
    document.getElementById('c-instructor').value = '';
    document.getElementById('c-horas').value = '';
    document.querySelectorAll('.chk-asistente:checked').forEach(el => { el.checked = false; });
    await cargarListado();
  } catch (err) {
    mostrarError('error-crear', err.message || 'Error al registrar la capacitación.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Registrar capacitación';
  }
}

async function cargarListado() {
  const cont = document.getElementById('lista-capacitaciones');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  try {
    const datos = await sissoFetch('/capacitaciones');
    const capacitaciones = datos.capacitaciones || [];
    if (capacitaciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay capacitaciones registradas.</div>';
      return;
    }
    cont.innerHTML = capacitaciones.map(c => `
      <div class="cap-item" data-on-click="abrirDetalle('${c.id}')">
        <div class="cap-cabecera">
          <strong>${escHtml(c.nombre)}</strong>
          <span class="sisso-chip teal">${c.total_asistentes} asistente(s)</span>
        </div>
        <div class="cap-meta">${c.tema ? escHtml(c.tema) + ' · ' : ''}${formatearFecha(c.fecha)} · ${c.horas_duracion}h${c.instructor ? ' · ' + escHtml(c.instructor) : ''}</div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// ======= Detalle =======
async function abrirDetalle(id) {
  capacitacionActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  document.getElementById('boton-eliminar').style.display = esGestor ? 'block' : 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await cargarDetalle();
}
function volverAlListado() {
  capacitacionActualId = null;
  document.getElementById('vista-listado').style.display = 'block';
  document.getElementById('vista-detalle').style.display = 'none';
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle');
  try {
    const datos = await sissoFetch(`/capacitaciones/${capacitacionActualId}`);
    const c = datos.capacitacion;

    document.getElementById('resumen-capacitacion').innerHTML = `
      <div class="sisso-tarjeta-titulo" style="margin-bottom:6px;">${escHtml(c.nombre)}</div>
      <div style="font-size:13px;color:var(--t2);line-height:1.6;">
        ${c.tema ? `<strong>Tema:</strong> ${escHtml(c.tema)}<br>` : ''}
        ${c.instructor ? `<strong>Instructor:</strong> ${escHtml(c.instructor)}<br>` : ''}
        <strong>Fecha:</strong> ${formatearFecha(c.fecha)}<br>
        <strong>Duración:</strong> ${c.horas_duracion} horas
      </div>`;

    const asistentes = datos.asistentes || [];
    document.getElementById('tabla-asistentes').innerHTML = asistentes.length === 0
      ? '<div class="sisso-vacio">Sin asistentes registrados.</div>'
      : `<table class="tabla-asist">
          <thead><tr><th>Nombre</th><th>Documento</th><th>Área</th><th></th></tr></thead>
          <tbody>
            ${asistentes.map(a => `
              <tr>
                <td>${escHtml(a.nombre_completo)}</td>
                <td>${escHtml(a.documento)}</td>
                <td>${escHtml(a.area || '—')}</td>
                <td><button class="btn-mini" data-on-click="verCertificado('${a.trabajador_id}')">📄 Certificado</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar la capacitación.');
  }
}

async function verCertificado(trabajadorId) {
  try {
    const blob = await sissoDescargarArchivo(`/certificados/capacitacion/${capacitacionActualId}/trabajador/${trabajadorId}`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    alert('Error al abrir el certificado: ' + (err.message || ''));
  }
}

async function eliminarCapacitacion() {
  if (!confirm('¿Eliminar esta capacitación? Esta acción no se puede deshacer.')) return;
  try {
    await sissoFetch(`/capacitaciones/${capacitacionActualId}`, { method: 'DELETE' });
    volverAlListado();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al eliminar la capacitación.');
  }
}

// ======= Utilidades =======
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
