// ============================================================
// SISSO - Logica de la pagina (visiometria/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let trabajadores = [];
let trabajadorActualId = null;
let trabajadorActual = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('visiometria', 'Visiometría Ocupacional');
  document.getElementById('fecha-examen').value = new Date().toISOString().split('T')[0];
  await cargarTrabajadores();
  const presel = localStorage.getItem('sisso_trabajador_id');
  if (presel) document.getElementById('sel-trabajador').value = presel;
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

function alternarCorreccion() {
  const activo = document.getElementById('usa-correccion').checked;
  document.getElementById('campo-tipo-correccion').style.display = activo ? 'block' : 'none';
  document.getElementById('col-lejana-con').style.display = activo ? '' : 'none';
  document.getElementById('col-cercana-con').style.display = activo ? '' : 'none';
  document.querySelectorAll('.col-lejana-con-celda, .col-cercana-con-celda').forEach(td => td.style.display = activo ? '' : 'none');
}

function leerValor(id) {
  const val = document.getElementById(id).value;
  return val === '' ? null : parseFloat(val);
}

async function guardarExamen() {
  ocultarError('error-examen');
  ocultarExito('exito-examen');

  const usaCorreccion = document.getElementById('usa-correccion').checked;
  const aoLejanaSin = leerValor('ao-lejana-sin');
  const aoLejanaCon = leerValor('ao-lejana-con');

  if (usaCorreccion && aoLejanaCon === null) {
    mostrarError('error-examen', 'Agudeza AO lejana con corrección es obligatoria (el trabajador usa corrección óptica).');
    return;
  }
  if (!usaCorreccion && aoLejanaSin === null) {
    mostrarError('error-examen', 'Agudeza AO lejana sin corrección es obligatoria.');
    return;
  }

  const cuerpo = {
    fechaExamen: document.getElementById('fecha-examen').value || undefined,
    odLejanaSinCorreccion: leerValor('od-lejana-sin') ?? undefined,
    odLejanaConCorreccion: leerValor('od-lejana-con') ?? undefined,
    oiLejanaSinCorreccion: leerValor('oi-lejana-sin') ?? undefined,
    oiLejanaConCorreccion: leerValor('oi-lejana-con') ?? undefined,
    aoLejanaSinCorreccion: aoLejanaSin ?? undefined,
    aoLejanaConCorreccion: aoLejanaCon ?? undefined,
    odCercanaSinCorreccion: leerValor('od-cercana-sin') ?? undefined,
    odCercanaConCorreccion: leerValor('od-cercana-con') ?? undefined,
    oiCercanaSinCorreccion: leerValor('oi-cercana-sin') ?? undefined,
    oiCercanaConCorreccion: leerValor('oi-cercana-con') ?? undefined,
    aoCercanaSinCorreccion: leerValor('ao-cercana-sin') ?? undefined,
    aoCercanaConCorreccion: leerValor('ao-cercana-con') ?? undefined,
    usaCorreccionOptica: usaCorreccion,
    tipoCorreccion: usaCorreccion ? document.getElementById('tipo-correccion').value : undefined,
    ishiharaLaminasCorrectas: leerValor('ishihara-correctas') ?? undefined,
    ishiharaLaminasTotales: leerValor('ishihara-totales') ?? undefined,
    percepcionProfundidad: document.getElementById('percepcion-profundidad').value,
    balanceMuscular: document.getElementById('balance-muscular').value,
    observaciones: document.getElementById('observaciones').value.trim() || undefined,
  };

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    const datos = await sissoFetch(`/visiometria/trabajadores/${trabajadorActualId}`, {
      method: 'POST',
      body: cuerpo
    });

    mostrarExito('exito-examen', 'Examen de visiometría registrado correctamente.');
    mostrarResultado(datos.examen);

    document.querySelectorAll('.input-med').forEach(el => el.value = '');
    document.getElementById('observaciones').value = '';
    await cargarHistorial();

  } catch (err) {
    mostrarError('error-examen', err.message || 'Error al guardar el examen.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar examen de visiometría';
  }
}

function mostrarResultado(examen) {
  const cont = document.getElementById('caja-resultado');
  const info = infoAptitud(examen.aptitud_definida || examen.aptitud_sugerida);

  cont.innerHTML = `
    <div class="resultado-caja">
      <div style="margin-bottom:10px;">
        <span class="patron-chip-grande" style="background:${info.bg};color:${info.fg};">${info.etiqueta}</span>
        ${examen.vision_monocular_severa ? '<span class="sisso-chip rojo" style="margin-left:6px;">⚠ Visión monocular/severa</span>' : ''}
      </div>
      <div class="resultado-fila"><div>Agudeza binocular (AO)</div><div><strong>${etiquetaClasificacion(examen.clasificacion_ao)}</strong></div></div>
      <div class="resultado-fila"><div>Percepción de colores</div><div><strong>${etiquetaClasificacion(examen.clasificacion_colores)}</strong></div></div>
    </div>`;
}

async function cargarHistorial() {
  const cont = document.getElementById('lista-examenes');
  cont.innerHTML = '<div class="sisso-cargando">Cargando historial…</div>';
  try {
    const datos = await sissoFetch(`/visiometria/trabajadores/${trabajadorActualId}`);
    const examenes = datos.examenes || [];

    if (examenes.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Aún no hay visiometrías registradas para este trabajador.</div>';
      return;
    }

    cont.innerHTML = examenes.map(e => {
      const info = infoAptitud(e.aptitud_definida || e.aptitud_sugerida);
      const agudeza = e.usa_correccion_optica ? e.ao_lejana_con_correccion : e.ao_lejana_sin_correccion;
      return `
        <div class="historial-item">
          <div class="historial-cabecera">
            <div>
              <strong>${formatearFecha(e.fecha_examen)}</strong>
              <span class="sisso-chip" style="background:${info.bg};color:${info.fg};margin-left:8px;">${info.etiqueta}</span>
              ${e.vision_monocular_severa ? '<span class="sisso-chip rojo" style="margin-left:4px;">⚠ Monocular/severa</span>' : ''}
            </div>
            <span style="font-size:11px;color:var(--t3);">Dr(a). ${escHtml(e.medico_nombre)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;">
            <div>AO lejana: ${agudeza ?? '—'} ${e.usa_correccion_optica ? '(corregida)' : '(sin corrección)'}</div>
            <div>Colores: ${etiquetaClasificacion(e.clasificacion_colores)}</div>
          </div>
          ${e.observaciones ? `<div style="font-size:12px;color:var(--t3);margin-top:6px;">${escHtml(e.observaciones)}</div>` : ''}
        </div>`;
    }).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

function infoAptitud(aptitud) {
  const mapa = {
    apto:                               { etiqueta: 'Apto',                                 bg: 'var(--grn3)', fg: 'var(--grn2)' },
    apto_con_correccion_obligatoria:    { etiqueta: 'Apto con corrección obligatoria',       bg: 'var(--teal3)', fg: 'var(--teal2)' },
    apto_con_restricciones:             { etiqueta: 'Apto con restricciones',                bg: 'var(--amb3)', fg: 'var(--amb2)' },
    requiere_evaluacion_oftalmologica:  { etiqueta: 'Requiere evaluación oftalmológica',      bg: 'var(--red3)', fg: 'var(--red2)' },
    no_apto:                            { etiqueta: 'No apto',                               bg: 'var(--red3)', fg: 'var(--red2)' },
  };
  return mapa[aptitud] || { etiqueta: 'Sin definir', bg: 'var(--bg3)', fg: 'var(--t2)' };
}
function etiquetaClasificacion(valor) {
  const mapa = {
    normal: 'Normal', disminucion_leve: 'Disminución leve', disminucion_significativa: 'Disminución significativa',
    sugiere_discromatopsia: 'Sugiere discromatopsia', no_evaluado: 'No evaluado',
  };
  return mapa[valor] || valor || '—';
}

function formatearFecha(fecha) {
  if (!fecha) return '';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'numeric' });
}
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(id) { document.getElementById(id).classList.remove('visible'); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function ocultarExito(id) { document.getElementById(id).classList.remove('visible'); }
