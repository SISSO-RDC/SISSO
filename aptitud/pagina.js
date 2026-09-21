// ============================================================
// SISSO - Logica de la pagina (aptitud/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let trabajadores = [];
let trabajadorActualId = null;
let diagnosticosSeleccionados = []; // [{codigo, descripcion}]
let exposicionesCatalogo = [];
let exposicionesSeleccionadas = new Set();
let aptitudElegida = null;
let timeoutBusqueda = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('emos', 'Aptitud Médica');
  await cargarTrabajadores();
  await cargarExposiciones();

  const trabajadorPreseleccionado = localStorage.getItem('sisso_trabajador_id');
  if (trabajadorPreseleccionado) {
    document.getElementById('sel-trabajador').value = trabajadorPreseleccionado;
  }

  // Cerrar el desplegable de resultados CIE-10 al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.buscador-cie10')) {
      document.getElementById('resultados-cie10').classList.remove('visible');
    }
  });
});

async function cargarTrabajadores() {
  const sel = document.getElementById('sel-trabajador');
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadores = datos.trabajadores || [];
    sel.innerHTML = '<option value="">Selecciona un trabajador…</option>' +
      trabajadores.map(t => `<option value="${t.id}">${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">Error al cargar trabajadores</option>';
    mostrarError('error-trabajador', err.message);
  }
}

async function cargarExposiciones() {
  try {
    const datos = await sissoFetch('/aptitud/exposiciones');
    exposicionesCatalogo = datos.exposiciones || [];
    renderizarExposiciones();
  } catch (err) {
    document.getElementById('lista-exposiciones').innerHTML =
      `<div class="sisso-vacio">Error al cargar el catálogo de exposiciones.</div>`;
  }
}

function renderizarExposiciones() {
  const categorias = [...new Set(exposicionesCatalogo.map(e => e.categoria))];
  const cont = document.getElementById('lista-exposiciones');
  cont.innerHTML = categorias.map(cat => `
    <div class="exposicion-categoria">${cat}</div>
    ${exposicionesCatalogo.filter(e => e.categoria === cat).map(e => `
      <label class="exposicion-item">
        <input type="checkbox" value="${e.codigo}" data-on-change="alternarExposicion('${e.codigo}', this.checked)">
        <span>${escHtml(e.nombre)}</span>
      </label>
    `).join('')}
  `).join('');
}

function alternarExposicion(codigo, marcado) {
  if (marcado) exposicionesSeleccionadas.add(codigo);
  else exposicionesSeleccionadas.delete(codigo);
}

// ------- Elegir trabajador -------
function elegirTrabajador() {
  ocultarError('error-trabajador');
  const id = document.getElementById('sel-trabajador').value;
  if (!id) { mostrarError('error-trabajador', 'Selecciona un trabajador.'); return; }

  trabajadorActualId = id;
  const t = trabajadores.find(x => x.id === id);
  document.getElementById('titulo-trabajador').textContent = t ? `${t.nombre_completo} — ${t.documento}` : 'Trabajador';
  document.getElementById('r-puesto').value = (t && t.puesto) || '';

  document.getElementById('caja-seleccion-trabajador').style.display = 'none';
  document.getElementById('caja-principal').style.display = 'block';

  cargarHistorial();
}

function cambiarTrabajador() {
  trabajadorActualId = null;
  diagnosticosSeleccionados = [];
  exposicionesSeleccionadas = new Set();
  aptitudElegida = null;
  renderizarChipsDiagnosticos();
  document.querySelectorAll('.lista-exposiciones input[type=checkbox]').forEach(c => c.checked = false);
  document.querySelectorAll('.aptitud-opcion').forEach(el => el.classList.remove('activa'));
  document.getElementById('caja-alertas').innerHTML = '<div class="sisso-vacio">Agrega diagnósticos y exposiciones, luego presiona "Evaluar".</div>';
  document.getElementById('caja-seleccion-trabajador').style.display = 'block';
  document.getElementById('caja-principal').style.display = 'none';
}

// ------- Busqueda CIE-10 -------
function buscarCie10Debounced() {
  clearTimeout(timeoutBusqueda);
  timeoutBusqueda = setTimeout(ejecutarBusquedaCie10, 300);
}

async function ejecutarBusquedaCie10() {
  const q = document.getElementById('buscar-cie10').value.trim();
  const cont = document.getElementById('resultados-cie10');

  if (q.length < 2) { cont.classList.remove('visible'); return; }

  try {
    const datos = await sissoFetch(`/aptitud/cie10/buscar?q=${encodeURIComponent(q)}`);
    const resultados = datos.resultados || [];

    if (resultados.length === 0) {
      cont.innerHTML = '<div class="resultado-cie10-item" style="color:var(--t3);">Sin resultados.</div>';
    } else {
      cont.innerHTML = resultados.map(r => `
        <div class="resultado-cie10-item" data-on-click="agregarDiagnostico(${escaparAtributoHtml(JSON.stringify(r.codigo))}, ${escaparAtributoHtml(JSON.stringify(r.descripcion))})">
          <span class="resultado-cie10-codigo">${escHtml(r.codigo)}</span>${escHtml(r.descripcion)}
        </div>`).join('');
    }
    cont.classList.add('visible');
  } catch (err) {
    cont.innerHTML = `<div class="resultado-cie10-item" style="color:var(--red2);">Error al buscar: ${escHtml(err.message)}</div>`;
    cont.classList.add('visible');
  }
}

function agregarDiagnostico(codigo, descripcion) {
  if (!diagnosticosSeleccionados.find(d => d.codigo === codigo)) {
    diagnosticosSeleccionados.push({ codigo, descripcion });
    renderizarChipsDiagnosticos();
  }
  document.getElementById('buscar-cie10').value = '';
  document.getElementById('resultados-cie10').classList.remove('visible');
}

function quitarDiagnostico(codigo) {
  diagnosticosSeleccionados = diagnosticosSeleccionados.filter(d => d.codigo !== codigo);
  renderizarChipsDiagnosticos();
}

function renderizarChipsDiagnosticos() {
  const cont = document.getElementById('chips-diagnosticos');
  if (diagnosticosSeleccionados.length === 0) {
    cont.innerHTML = '<span style="color:var(--t3);font-size:12px;">Ningún diagnóstico agregado aún.</span>';
    return;
  }
  cont.innerHTML = diagnosticosSeleccionados.map(d => `
    <span class="chip-removible">
      <strong>${escHtml(d.codigo)}</strong> ${escHtml(d.descripcion)}
      <button data-on-click="quitarDiagnostico('${d.codigo}')" title="Quitar">×</button>
    </span>`).join('');
}

// ------- Evaluar contraindicaciones -------
async function evaluarContraindicaciones() {
  if (!trabajadorActualId) return;

  const caja = document.getElementById('caja-alertas');
  caja.innerHTML = '<div class="sisso-cargando">Evaluando…</div>';

  try {
    const datos = await sissoFetch(`/aptitud/trabajadores/${trabajadorActualId}/evaluar`, {
      method: 'POST',
      body: {
        diagnosticosCie10: diagnosticosSeleccionados.map(d => d.codigo),
        exposicionesPuesto: [...exposicionesSeleccionadas],
      }
    });

    const alertas = datos.alertas || [];
    if (alertas.length === 0) {
      caja.innerHTML = '<div style="background:var(--grn3);color:var(--grn2);padding:12px;border-radius:var(--r);font-size:13px;font-weight:600;">✓ No se detectaron contraindicaciones conocidas con los diagnósticos y exposiciones indicados.</div>';
    } else {
      caja.innerHTML = alertas.map(a => `
        <div class="alerta-tarjeta ${a.severidad}">
          <div class="alerta-titulo">${a.severidad === 'absoluta' ? '🔴' : '🟠'} ${escHtml(a.nombre)}</div>
          <div class="alerta-texto">${escHtml(a.descripcionRiesgo)}</div>
          ${a.sugerenciaAccion ? `<div class="alerta-sugerencia">Sugerencia: ${escHtml(a.sugerenciaAccion)}</div>` : ''}
          ${a.fuenteReferencia ? `<div class="alerta-fuente">Fuente: ${escHtml(a.fuenteReferencia)}</div>` : ''}
        </div>`).join('');
    }
  } catch (err) {
    caja.innerHTML = `<div class="sisso-error visible">Error al evaluar: ${escHtml(err.message)}</div>`;
  }
}

// ------- Elegir aptitud -------
function elegirAptitud(valor) {
  aptitudElegida = valor;
  document.querySelectorAll('.aptitud-opcion').forEach(el => {
    el.classList.toggle('activa', el.dataset.aptitud === valor);
  });
  document.getElementById('campo-restricciones').style.display = valor === 'con_restricciones' ? 'block' : 'none';
}

// ------- Registrar aptitud -------
async function registrarAptitud(confirmarEvaluacionIncompleta) {
  ocultarError('error-registro');
  ocultarExito('exito-registro');

  const puesto = document.getElementById('r-puesto').value.trim();
  const justificacion = document.getElementById('r-justificacion').value.trim();
  const restricciones = document.getElementById('r-restricciones').value.trim();
  const vigencia = document.getElementById('r-vigencia').value;

  if (!aptitudElegida) { mostrarError('error-registro', 'Selecciona una aptitud.'); return; }
  if (!puesto) { mostrarError('error-registro', 'Indica el puesto evaluado.'); return; }
  if (justificacion.length < 20) { mostrarError('error-registro', 'La justificación clínica debe tener al menos 20 caracteres.'); return; }

  const boton = document.getElementById('btn-registrar');
  boton.disabled = true;
  boton.textContent = 'Registrando…';

  try {
    await sissoFetch(`/aptitud/trabajadores/${trabajadorActualId}/registrar`, {
      method: 'POST',
      body: {
        aptitud: aptitudElegida,
        puestoEvaluado: puesto,
        diagnosticosCie10: diagnosticosSeleccionados.map(d => d.codigo),
        exposicionesPuesto: [...exposicionesSeleccionadas],
        justificacionClinica: justificacion,
        restricciones: restricciones || undefined,
        vigenciaHasta: vigencia || undefined,
        // CORREGIDO en Auditoria N.15 (bug real reportado por el
        // usuario: "tremendo bug", quedaba imposible registrar la
        // aptitud de un trabajador sin puesto asignado). El backend
        // SI contempla este caso (exige una confirmacion explicita,
        // ver mas abajo en el catch) pero esta pantalla nunca ofrecia
        // forma de darla -- el medico quedaba bloqueado sin salida.
        ...(confirmarEvaluacionIncompleta ? { confirmarEvaluacionIncompleta: true } : {}),
      }
    });

    mostrarExito('exito-registro', 'Aptitud registrada correctamente.');
    document.getElementById('r-justificacion').value = '';
    document.getElementById('r-restricciones').value = '';
    await cargarHistorial();

  } catch (err) {
    // CORREGIDO en Auditoria N.15: err.datos ya traia el cuerpo
    // completo del error (evaluacionIncompleta, solucion) desde hace
    // tiempo (ver shared/api.js) -- esta pantalla simplemente nunca
    // lo leia, solo mostraba err.message y dejaba al medico sin
    // ninguna forma de continuar. Si el backend ofrece una salida
    // explicita (confirmarEvaluacionIncompleta), se le pregunta al
    // medico y, si acepta, se reenvia automaticamente con esa
    // confirmacion -- sin repetir el llenado del formulario.
    if (err.datos && err.datos.evaluacionIncompleta && !confirmarEvaluacionIncompleta) {
      const mensaje = `${err.datos.error}\n\n${err.datos.solucion || ''}\n\n¿Deseas continuar de todas formas? Esta decisión quedará registrada en el historial.`;
      if (confirm(mensaje)) {
        boton.disabled = false;
        boton.textContent = 'Registrar aptitud';
        return registrarAptitud(true);
      }
      mostrarError('error-registro', 'Registro cancelado: la evaluación quedó incompleta y no se confirmó continuar.');
    } else {
      mostrarError('error-registro', err.message || 'Error al registrar la aptitud.');
    }
  } finally {
    boton.disabled = false;
    boton.textContent = 'Registrar aptitud';
  }
}

// ------- Historial -------
async function cargarHistorial() {
  const cont = document.getElementById('lista-historial');
  cont.innerHTML = '<div class="sisso-cargando">Cargando historial…</div>';

  try {
    const datos = await sissoFetch(`/aptitud/trabajadores/${trabajadorActualId}/historial`);
    const historial = datos.historial || [];

    if (historial.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Este trabajador aún no tiene registros de aptitud.</div>';
      return;
    }

    cont.innerHTML = historial.map(h => `
      <div class="historial-item">
        <div class="historial-cabecera">
          <div>${chipDeAptitud(h.aptitud)} <strong style="margin-left:6px;">${escHtml(h.puesto_evaluado)}</strong></div>
          <span style="font-size:11px;color:var(--t3);">${formatearFechaHora(h.creado_en)} · Dr(a). ${escHtml(h.medico_nombre)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--t2);margin-bottom:4px;"><strong>Justificación:</strong> ${escHtml(h.justificacion_clinica)}</div>
        ${h.restricciones ? `<div style="font-size:12.5px;color:var(--t2);"><strong>Restricciones:</strong> ${escHtml(h.restricciones)}</div>` : ''}
        ${(h.alertas_detectadas && h.alertas_detectadas.length > 0) ? `<div style="font-size:11.5px;color:var(--amb2);margin-top:4px;">⚠ ${h.alertas_detectadas.length} alerta(s) detectada(s) al momento del registro.</div>` : ''}
      </div>`).join('');

  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar el historial: ${escHtml(err.message)}</div>`;
  }
}

function chipDeAptitud(aptitud) {
  const mapa = {
    apto: ['verde', 'Apto'], con_restricciones: ['ambar', 'Con restricciones'],
    no_apto: ['rojo', 'No apto'], pendiente: ['gris', 'Pendiente'],
  };
  const [clase, label] = mapa[aptitud] || ['gris', aptitud];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}

function formatearFechaHora(fecha) {
  return new Date(fecha).toLocaleString('es-EC', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
function mostrarError(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
}
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 5000);
}
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
