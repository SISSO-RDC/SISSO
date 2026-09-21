// ============================================================
// SISSO - Logica de la pagina (riesgo-psicosocial/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let esGestor = false;
let trabajadores = [];
let usuariosOrganizacion = [];
let evaluacionActualId = null;
let factoresTemporales = [];

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('riesgo-psicosocial', 'Riesgo Psicosocial');

  const usuario = SissoSesion.obtenerUsuario();
  esGestor = ['admin', 'sso'].includes(usuario.rol);

  if (esGestor) {
    document.getElementById('caja-crear').style.display = 'block';
    await cargarTrabajadores();
    await cargarUsuarios();
  }

  await cargarListado();
});

async function cargarTrabajadores() {
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadores = datos.trabajadores || [];
    document.getElementById('c-trabajador').innerHTML = '<option value="">Selecciona…</option>' +
      trabajadores.map(t => `<option value="${t.id}">${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}</option>`).join('');
  } catch (err) {
    document.getElementById('c-trabajador').innerHTML = '<option value="">Error al cargar</option>';
  }
}

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/usuarios');
    usuariosOrganizacion = datos.usuarios || [];
    document.getElementById('m-responsable').innerHTML = '<option value="">Selecciona…</option>' +
      usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)} (${escHtml(u.rol)})</option>`).join('');
  } catch (err) {
    document.getElementById('m-responsable').innerHTML = '<option value="">Error al cargar</option>';
  }
}

function alCambiarTipo() {
  const esGrupal = document.getElementById('c-tipo').value === 'grupal';
  document.getElementById('campo-trabajador').style.display = esGrupal ? 'none' : 'block';
  document.getElementById('campo-area').style.display = esGrupal ? 'block' : 'none';
}

function agregarFactorTemporal() {
  const factor = document.getElementById('nf-factor').value.trim();
  const nivel = document.getElementById('nf-nivel').value;
  if (!factor) return;
  factoresTemporales.push({ factor, nivelRiesgo: nivel });
  document.getElementById('nf-factor').value = '';
  renderizarFactoresTemporales();
}

function quitarFactorTemporal(indice) {
  factoresTemporales.splice(indice, 1);
  renderizarFactoresTemporales();
}

function renderizarFactoresTemporales() {
  document.getElementById('lista-factores-nuevos').innerHTML = factoresTemporales.map((f, i) => `
    <div class="factor-fila">
      <span>${escHtml(f.factor)} — ${chipDeNivel(f.nivelRiesgo)}</span>
      <button class="btn-mini" data-on-click="quitarFactorTemporal(${i})">Quitar</button>
    </div>`).join('');
}

async function crearEvaluacion() {
  ocultarError('error-crear');
  ocultarExito('exito-crear');

  const tipoEvaluacion = document.getElementById('c-tipo').value;
  const trabajadorId = document.getElementById('c-trabajador').value;
  const area = document.getElementById('c-area').value.trim();
  const metodo = document.getElementById('c-metodo').value.trim();
  const fecha = document.getElementById('c-fecha').value;
  const puntaje = document.getElementById('c-puntaje').value;
  const nivelRiesgo = document.getElementById('c-nivel').value;
  const derivado = document.getElementById('c-derivado').checked;

  if (tipoEvaluacion === 'individual' && !trabajadorId) { mostrarError('error-crear', 'Selecciona el trabajador.'); return; }
  if (tipoEvaluacion === 'grupal' && !area) { mostrarError('error-crear', 'Indica el área.'); return; }
  if (!metodo) { mostrarError('error-crear', 'Indica el método de evaluación.'); return; }
  if (!fecha) { mostrarError('error-crear', 'Indica la fecha.'); return; }

  const boton = document.getElementById('btn-crear');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch('/riesgo-psicosocial/evaluaciones', {
      method: 'POST',
      body: {
        tipoEvaluacion, trabajadorId: trabajadorId || undefined, area: area || undefined, metodo, fechaEvaluacion: fecha,
        puntajeGlobal: puntaje ? parseFloat(puntaje) : undefined, nivelRiesgo, derivadoAtencionMedica: derivado,
        factores: factoresTemporales.length ? factoresTemporales : undefined,
      },
    });
    mostrarExito('exito-crear', 'Evaluación guardada.');
    document.getElementById('c-area').value = '';
    document.getElementById('c-metodo').value = '';
    document.getElementById('c-puntaje').value = '';
    document.getElementById('c-derivado').checked = false;
    factoresTemporales = [];
    renderizarFactoresTemporales();
    await cargarListado();
  } catch (err) {
    mostrarError('error-crear', err.message || 'Error al guardar la evaluación.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar evaluación';
  }
}

async function cargarListado() {
  const cont = document.getElementById('lista-evaluaciones');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  const nivel = document.getElementById('f-nivel').value;
  const estado = document.getElementById('f-estado').value;
  const parametros = new URLSearchParams();
  if (nivel) parametros.set('nivelRiesgo', nivel);
  if (estado) parametros.set('estado', estado);

  try {
    const datos = await sissoFetch(`/riesgo-psicosocial/evaluaciones?${parametros.toString()}`);
    const evaluaciones = datos.evaluaciones || [];
    if (evaluaciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay evaluaciones con estos filtros.</div>';
      return;
    }
    cont.innerHTML = evaluaciones.map(e => `
      <div class="eval-item" data-on-click="abrirDetalle('${e.id}')">
        <div class="eval-cabecera">
          <div>${chipDeNivel(e.nivel_riesgo)} ${chipDeEstado(e.estado)}</div>
          ${e.capa_id ? '<span class="sisso-chip verde">CAPA generada</span>' : ''}
        </div>
        <div style="font-size:12.5px;color:var(--t2);margin-top:6px;">
          ${e.tipo_evaluacion === 'individual' ? escHtml(e.trabajador_nombre || '—') : escHtml(e.area || 'Evaluación grupal')}
        </div>
        <div class="eval-meta">${escHtml(e.metodo)} · ${formatearFecha(e.fecha_evaluacion)}${e.derivado_atencion_medica ? ' · <strong style="color:var(--red2);">Derivado a médico</strong>' : ''}</div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// ======= Detalle =======
async function abrirDetalle(id) {
  evaluacionActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await cargarDetalle();
}
function volverAlListado() {
  evaluacionActualId = null;
  document.getElementById('vista-listado').style.display = 'block';
  document.getElementById('vista-detalle').style.display = 'none';
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle');
  try {
    const datos = await sissoFetch(`/riesgo-psicosocial/evaluaciones/${evaluacionActualId}`);
    const e = datos.evaluacion;

    document.getElementById('resumen-evaluacion').innerHTML = `
      <div class="eval-cabecera">
        <div style="display:flex;gap:6px;">${chipDeNivel(e.nivel_riesgo)} ${chipDeEstado(e.estado)}</div>
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.6;">
        ${e.tipo_evaluacion === 'individual' ? `<strong>Trabajador:</strong> ${escHtml(e.trabajador_nombre || '—')}<br>` : `<strong>Área:</strong> ${escHtml(e.area || '—')}<br>`}
        <strong>Método:</strong> ${escHtml(e.metodo)}<br>
        <strong>Fecha:</strong> ${formatearFecha(e.fecha_evaluacion)}<br>
        ${e.puntaje_global != null ? `<strong>Puntaje global:</strong> ${e.puntaje_global}<br>` : ''}
        <strong>Evaluador:</strong> ${escHtml(e.evaluador_nombre || '—')}<br>
        ${e.derivado_atencion_medica ? '<span class="sisso-chip ambar">Derivado a atención médica</span><br>' : ''}
        ${e.observaciones_generales ? `<strong>Observaciones:</strong> ${escHtml(e.observaciones_generales)}` : ''}
      </div>`;

    const cont = document.getElementById('acciones-caja');
    if (esGestor && !e.capa_id) {
      cont.style.display = 'block';
      cont.innerHTML = `<button class="sisso-boton" data-on-click="abrirModal()">Generar acción CAPA (intervención)</button>`;
    } else if (e.capa_id) {
      cont.style.display = 'block';
      cont.innerHTML = '<span class="sisso-chip verde">Ya tiene una acción CAPA generada — revísala en el módulo CAPA.</span>';
    } else {
      cont.style.display = 'none';
    }

    const factores = datos.factores || [];
    document.getElementById('lista-factores').innerHTML = factores.length === 0
      ? '<div class="sisso-vacio">Sin factores registrados.</div>'
      : factores.map(f => `
          <div class="factor-fila">
            <span>${escHtml(f.factor)}${f.observacion ? ' — ' + escHtml(f.observacion) : ''}</span>
            ${chipDeNivel(f.nivel_riesgo)}
          </div>`).join('');

    const historial = (datos.historial || []).filter(h => h.id !== e.id);
    document.getElementById('lista-historial').innerHTML = historial.length === 0
      ? '<div class="sisso-vacio">Esta es la única evaluación registrada para este trabajador.</div>'
      : historial.map(h => `
          <div class="factor-fila">
            <span>${formatearFecha(h.fecha_evaluacion)}${h.puntaje_global != null ? ' — Puntaje: ' + h.puntaje_global : ''}</span>
            ${chipDeNivel(h.nivel_riesgo)}
          </div>`).join('');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar la evaluación.');
  }
}

function abrirModal() { document.getElementById('modal-fondo').classList.add('visible'); }
function cerrarModal() { document.getElementById('modal-fondo').classList.remove('visible'); }

async function confirmarGenerarCapa() {
  ocultarError('error-modal');
  const responsableId = document.getElementById('m-responsable').value;
  const fechaLimite = document.getElementById('m-fecha-limite').value;
  if (!responsableId) { mostrarError('error-modal', 'Selecciona un responsable.'); return; }
  if (!fechaLimite) { mostrarError('error-modal', 'Indica la fecha límite.'); return; }

  try {
    await sissoFetch(`/riesgo-psicosocial/evaluaciones/${evaluacionActualId}/generar-capa`, {
      method: 'POST', body: { responsableId, fechaLimite },
    });
    cerrarModal();
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-modal', err.message || 'Error al generar la acción CAPA.');
  }
}

// ======= Utilidades =======
function chipDeNivel(nivel) {
  const mapa = { bajo: 'verde', medio: 'ambar', alto: 'rojo', muy_alto: 'rojo' };
  const etiquetas = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', muy_alto: 'Muy alto' };
  return `<span class="sisso-chip ${mapa[nivel] || 'gris'}">${etiquetas[nivel] || nivel}</span>`;
}
function chipDeEstado(estado) {
  const mapa = { evaluado: 'gris', en_intervencion: 'ambar', en_seguimiento: 'teal', cerrado: 'verde' };
  const etiquetas = { evaluado: 'Evaluado', en_intervencion: 'En intervención', en_seguimiento: 'En seguimiento', cerrado: 'Cerrado' };
  return `<span class="sisso-chip ${mapa[estado] || 'gris'}">${etiquetas[estado] || estado}</span>`;
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
