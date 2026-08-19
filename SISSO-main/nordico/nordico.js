// ============================================================
// SISSO - Cuestionario Nordico Estandarizado (Kuorinka 1987)
// ============================================================

let trabajadores = [];
let trabajadorActualId = null;
let trabajadorActual = null;
let catalogos = null;

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('nordico', 'Cuestionario Nórdico');
  document.getElementById('fecha-aplicacion').value = new Date().toISOString().split('T')[0];
  await Promise.all([cargarTrabajadores(), cargarCatalogos()]);
  renderizarRegiones();
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

async function cargarCatalogos() {
  try {
    const datos = await sissoFetch('/nordico/catalogos');
    catalogos = datos.catalogos;
  } catch (err) {
    mostrarError('error-selector', 'Error al cargar catálogos: ' + err.message);
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

// ------- Renderizar las 9 zonas corporales -------
function renderizarRegiones() {
  if (!catalogos) return;
  const cont = document.getElementById('caja-regiones');
  cont.innerHTML = catalogos.REGIONES.map(region => {
    const esBilateral = catalogos.REGIONES_BILATERALES.includes(region);
    const etiqueta = catalogos.ETIQUETAS_REGIONES[region] || region;
    return `
      <details class="region">
        <summary>
          <span>${etiqueta}</span>
          <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;" onclick="event.stopPropagation()">
            <input type="checkbox" id="tuvo-${region}" onchange="alternarRegion('${region}')"> ¿Tuvo molestias en los últimos 12 meses?
          </label>
        </summary>
        <div class="region-cuerpo" id="detalle-${region}" style="display:none;">
          ${esBilateral ? `
            <div class="sisso-campo" style="max-width:260px;">
              <label class="sisso-etiqueta">Lado afectado</label>
              <select id="lado-${region}" class="sisso-select">
                <option value="izquierdo">Izquierdo</option>
                <option value="derecho">Derecho</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>` : ''}

          <div class="campos-detalle">
            <div class="sisso-campo">
              <label class="sisso-etiqueta">¿Cuánto tiempo ha tenido molestias en los últimos 12 meses?</label>
              <select id="tiempo-total-${region}" class="sisso-select">
                <option value="1_a_7_dias">1 a 7 días</option>
                <option value="8_a_30_dias">8 a 30 días</option>
                <option value="mas_30_dias_no_seguidos">Más de 30 días, no seguidos</option>
                <option value="siempre">Siempre</option>
              </select>
            </div>
            <div class="sisso-campo">
              <label class="sisso-etiqueta">¿Cuánto dura cada episodio?</label>
              <select id="duracion-${region}" class="sisso-select">
                <option value="menos_1_hora">Menos de 1 hora</option>
                <option value="1_a_24_horas">1 a 24 horas</option>
                <option value="1_a_7_dias">1 a 7 días</option>
                <option value="1_a_4_semanas">1 a 4 semanas</option>
                <option value="mas_1_mes">Más de 1 mes</option>
              </select>
            </div>
            <div class="sisso-campo">
              <label class="sisso-etiqueta">¿Cuánto le ha impedido trabajar en los últimos 12 meses?</label>
              <select id="impedimento-${region}" class="sisso-select">
                <option value="0_dias">0 días</option>
                <option value="1_a_7_dias">1 a 7 días</option>
                <option value="1_a_4_semanas">1 a 4 semanas</option>
                <option value="mas_1_mes">Más de 1 mes</option>
              </select>
            </div>
          </div>

          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="cambio-puesto-${region}"> ¿Ha necesitado cambiar de puesto de trabajo?</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="tratamiento-${region}"> ¿Ha recibido tratamiento en los últimos 12 meses?</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="ultimos-7-dias-${region}"> ¿Ha tenido molestias en los últimos 7 días?</label>
          </div>

          <div style="margin-top:14px;">
            <label class="sisso-etiqueta">Intensidad de la molestia (0 = sin molestias, 5 = molestias muy fuertes)</label>
            <div class="escala-intensidad" id="intensidad-${region}">
              ${[0, 1, 2, 3, 4, 5].map(n => `<button type="button" onclick="elegirIntensidad('${region}', ${n})" data-valor="${n}">${n}</button>`).join('')}
            </div>
          </div>

          <div class="sisso-campo" style="margin-top:14px;">
            <label class="sisso-etiqueta">¿A qué atribuye estas molestias? (opcional)</label>
            <input id="atribucion-${region}" class="sisso-input" placeholder="Ej: postura prolongada, manejo de cargas…">
          </div>
        </div>
      </details>`;
  }).join('');
}

function alternarRegion(region) {
  const activo = document.getElementById(`tuvo-${region}`).checked;
  document.getElementById(`detalle-${region}`).style.display = activo ? 'block' : 'none';
}

function elegirIntensidad(region, valor) {
  const cont = document.getElementById(`intensidad-${region}`);
  cont.dataset.valorElegido = valor;
  cont.querySelectorAll('button').forEach(b => b.classList.toggle('activo', parseInt(b.dataset.valor, 10) === valor));
}

// ------- Guardar cuestionario -------
async function guardarCuestionario() {
  ocultarError('error-form');
  ocultarExito('exito-form');

  if (!trabajadorActualId) { mostrarError('error-form', 'Selecciona un trabajador.'); return; }

  const regiones = {};
  catalogos.REGIONES.forEach(region => {
    const tuvo = document.getElementById(`tuvo-${region}`).checked;
    if (!tuvo) {
      regiones[region] = { tuvoMolestias12Meses: false };
      return;
    }
    const esBilateral = catalogos.REGIONES_BILATERALES.includes(region);
    const intensidadCont = document.getElementById(`intensidad-${region}`);
    regiones[region] = {
      tuvoMolestias12Meses: true,
      lado: esBilateral ? document.getElementById(`lado-${region}`).value : undefined,
      tiempoTotal12Meses: document.getElementById(`tiempo-total-${region}`).value,
      duracionEpisodio: document.getElementById(`duracion-${region}`).value,
      tiempoImpedimentoTrabajo: document.getElementById(`impedimento-${region}`).value,
      cambioPuestoTrabajo: document.getElementById(`cambio-puesto-${region}`).checked,
      recibioTratamiento: document.getElementById(`tratamiento-${region}`).checked,
      molestiasUltimos7Dias: document.getElementById(`ultimos-7-dias-${region}`).checked,
      intensidad: intensidadCont.dataset.valorElegido !== undefined ? parseInt(intensidadCont.dataset.valorElegido, 10) : null,
      atribucion: document.getElementById(`atribucion-${region}`).value.trim() || undefined,
    };
  });

  const cuerpo = {
    fechaAplicacion: document.getElementById('fecha-aplicacion').value || undefined,
    regiones,
    observacionesGenerales: document.getElementById('observaciones-generales').value.trim() || undefined,
  };

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    const datos = await sissoFetch(`/nordico/trabajadores/${trabajadorActualId}`, {
      method: 'POST',
      body: cuerpo,
    });

    mostrarExito('exito-form', 'Cuestionario guardado correctamente.');
    mostrarResultado(datos.cuestionario);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await cargarHistorial();

  } catch (err) {
    mostrarError('error-form', err.message || 'Error al guardar el cuestionario.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar cuestionario';
  }
}

function mostrarResultado(c) {
  const cont = document.getElementById('caja-resultado');
  cont.innerHTML = `
    <div class="resumen-caja">
      <div class="resumen-item"><div class="numero">${c.regiones_con_molestia_12_meses}</div><div class="etiqueta">zonas con molestia (12 meses)</div></div>
      <div class="resumen-item"><div class="numero">${c.regiones_con_molestia_7_dias}</div><div class="etiqueta">zonas con molestia (7 días)</div></div>
      <div class="resumen-item">
        <div class="numero">${c.requiere_atencion_prioritaria ? '⚠' : '✓'}</div>
        <div class="etiqueta">${c.requiere_atencion_prioritaria ? 'Requiere seguimiento prioritario' : 'Sin zonas prioritarias'}</div>
      </div>
    </div>
    ${c.regiones_prioritarias && c.regiones_prioritarias.length ? `
      <div style="margin-top:10px;font-size:13px;">
        <strong>Zonas prioritarias:</strong> ${c.regiones_prioritarias.map(r => catalogos.ETIQUETAS_REGIONES[r] || r).join(', ')}
      </div>` : ''}`;
}

// ------- Historial -------
async function cargarHistorial() {
  const cont = document.getElementById('lista-historial');
  cont.innerHTML = '<div class="sisso-cargando">Cargando historial…</div>';
  try {
    const datos = await sissoFetch(`/nordico/trabajadores/${trabajadorActualId}`);
    const cuestionarios = datos.cuestionarios || [];

    if (cuestionarios.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Aún no hay cuestionarios registrados para este trabajador.</div>';
      return;
    }

    cont.innerHTML = cuestionarios.map(c => `
      <div class="historial-item">
        <div>
          <strong>${formatearFecha(c.fecha_aplicacion)}</strong>
          <div style="font-size:12px;color:var(--t3);margin-top:2px;">
            ${c.regiones_con_molestia_12_meses} zonas con molestia (12m) · ${c.regiones_con_molestia_7_dias} (7d) · Aplicado por ${escHtml(c.aplicado_por_nombre)}
          </div>
        </div>
        ${c.requiere_atencion_prioritaria
          ? `<span class="sisso-chip rojo">⚠ ${(c.regiones_prioritarias || []).length} zona(s) prioritaria(s)</span>`
          : '<span class="sisso-chip verde">Sin zonas prioritarias</span>'}
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// ------- Utilidades -------
function formatearFecha(fecha) {
  if (!fecha) return '';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
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
