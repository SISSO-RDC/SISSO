// ============================================================
// SISSO - Ecuacion NIOSH revisada (1994)
// ============================================================

let trabajadores = [];
let trabajadorActualId = null;
let trabajadorActual = null;

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('niosh', 'Ecuación NIOSH');
  document.getElementById('fecha-evaluacion').value = new Date().toISOString().split('T')[0];
  await cargarTrabajadores();
});

async function cargarTrabajadores() {
  const sel = document.getElementById('sel-trabajador');
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadores = datos.trabajadores || [];
    sel.innerHTML = '<option value="">Selecciona un trabajador…</option>' +
      trabajadores.map(t => `<option value="${t.id}">${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">Error al cargar</option>';
    mostrarError('error-selector', err.message);
  }
}

function elegirTrabajador() {
  ocultarError('error-selector');
  const id = document.getElementById('sel-trabajador').value;
  if (!id) { mostrarError('error-selector', 'Selecciona un trabajador.'); return; }
  trabajadorActualId = id;
  trabajadorActual = trabajadores.find(x => x.id === id) || null;
  document.getElementById('titulo-trabajador').textContent = trabajadorActual
    ? `${trabajadorActual.nombre_completo} — ${trabajadorActual.documento}` : 'Trabajador';
  document.getElementById('caja-selector').style.display = 'none';
  document.getElementById('caja-principal').style.display = 'block';
  cargarHistorial();
}

function cambiarTrabajador() {
  trabajadorActualId = null;
  trabajadorActual = null;
  document.getElementById('caja-selector').style.display = 'block';
  document.getElementById('caja-principal').style.display = 'none';
}

async function guardarEvaluacion() {
  ocultarError('error-form');
  ocultarExito('exito-form');

  const nombreTarea = document.getElementById('nombre-tarea').value.trim();
  if (!nombreTarea) { mostrarError('error-form', 'Indica el nombre de la tarea evaluada.'); return; }

  const cuerpo = {
    nombreTarea,
    fechaEvaluacion: document.getElementById('fecha-evaluacion').value || undefined,
    horizontalCm: parseFloat(document.getElementById('horizontal').value),
    verticalCm: parseFloat(document.getElementById('vertical').value),
    distanciaVerticalCm: parseFloat(document.getElementById('distancia-vertical').value),
    anguloAsimetria: parseFloat(document.getElementById('angulo').value),
    frecuenciaPorMin: parseFloat(document.getElementById('frecuencia').value),
    duracion: document.getElementById('duracion').value,
    calidadAgarre: document.getElementById('calidad-agarre').value,
    pesoCargaKg: parseFloat(document.getElementById('peso-carga').value),
    observaciones: document.getElementById('observaciones').value.trim() || undefined,
  };

  const camposFaltantes = ['horizontalCm', 'verticalCm', 'distanciaVerticalCm', 'anguloAsimetria', 'frecuenciaPorMin', 'pesoCargaKg']
    .filter(c => isNaN(cuerpo[c]));
  if (camposFaltantes.length > 0) {
    mostrarError('error-form', 'Completa todos los campos numéricos requeridos.');
    return;
  }

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Calculando…';

  try {
    const datos = await sissoFetch(`/niosh/trabajadores/${trabajadorActualId}`, {
      method: 'POST',
      body: cuerpo,
    });

    mostrarExito('exito-form', 'Evaluación registrada correctamente.');
    mostrarResultado(datos.evaluacion);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await cargarHistorial();

  } catch (err) {
    mostrarError('error-form', err.message || 'Error al registrar la evaluación.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Calcular y guardar evaluación';
  }
}

function mostrarResultado(e) {
  const cont = document.getElementById('caja-resultado');
  const info = infoClasificacion(e.clasificacion);

  cont.innerHTML = `
    <div class="resultado-caja">
      <div style="display:flex;gap:30px;flex-wrap:wrap;align-items:center;">
        <div>
          <div style="font-size:12px;color:var(--t3);">Índice de Levantamiento (LI)</div>
          <div class="li-grande" style="color:${info.fg};">${e.li ?? '—'}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--t3);">Límite de peso recomendado (RWL)</div>
          <div style="font-size:20px;font-weight:700;">${e.rwl_kg ?? '—'} kg</div>
        </div>
        <div>
          <span class="clasificacion-chip-grande" style="background:${info.bg};color:${info.fg};">${info.etiqueta}</span>
        </div>
      </div>
      <div style="font-size:12px;color:var(--t3);margin-top:10px;">${info.descripcion}</div>
    </div>`;
}

async function cargarHistorial() {
  const cont = document.getElementById('lista-historial');
  cont.innerHTML = '<div class="sisso-cargando">Cargando historial…</div>';
  try {
    const datos = await sissoFetch(`/niosh/trabajadores/${trabajadorActualId}`);
    const evaluaciones = datos.evaluaciones || [];

    if (evaluaciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Aún no hay evaluaciones registradas para este trabajador.</div>';
      return;
    }

    cont.innerHTML = evaluaciones.map(e => {
      const info = infoClasificacion(e.clasificacion);
      return `
        <div class="historial-item">
          <div>
            <strong>${escHtml(e.nombre_tarea)}</strong>
            <div style="font-size:12px;color:var(--t3);margin-top:2px;">
              ${formatearFecha(e.fecha_evaluacion)} · Carga: ${e.peso_carga_kg} kg · RWL: ${e.rwl_kg} kg · Evaluado por ${escHtml(e.evaluado_por_nombre)}
            </div>
          </div>
          <span class="sisso-chip" style="background:${info.bg};color:${info.fg};">LI ${e.li} — ${info.etiqueta}</span>
        </div>`;
    }).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

function infoClasificacion(clasificacion) {
  const mapa = {
    aceptable:          { etiqueta: 'Aceptable',        bg: 'var(--grn3)', fg: 'var(--grn2)', descripcion: 'La carga está dentro del límite recomendado. Riesgo mínimo para la mayoría de los trabajadores.' },
    riesgo_moderado:    { etiqueta: 'Riesgo moderado',  bg: 'var(--amb3)', fg: 'var(--amb2)', descripcion: 'La carga supera el límite recomendado. Algunos trabajadores podrían estar en riesgo; se recomienda rediseñar la tarea.' },
    riesgo_alto:        { etiqueta: 'Riesgo alto',      bg: 'var(--red3)', fg: 'var(--red2)', descripcion: 'La carga supera significativamente el límite recomendado. Se recomienda rediseñar la tarea de forma prioritaria.' },
    riesgo_muy_alto:    { etiqueta: 'Riesgo muy alto',  bg: 'var(--red3)', fg: 'var(--red2)', descripcion: 'Riesgo muy elevado para la gran mayoría de los trabajadores. Rediseño urgente de la tarea.' },
  };
  return mapa[clasificacion] || { etiqueta: 'Sin calcular', bg: 'var(--bg3)', fg: 'var(--t2)', descripcion: '' };
}

function formatearFecha(fecha) {
  if (!fecha) return '';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(id) { document.getElementById(id).classList.remove('visible'); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function ocultarExito(id) { document.getElementById(id).classList.remove('visible'); }
