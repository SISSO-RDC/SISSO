// ============================================================
// SISSO - Logica de la pagina (reba/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let sesionActualId = null;
let trabajadores = [];

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('reba', 'Calculadora REBA');
  await cargarTrabajadores();

  // Si venimos desde "Ver" en la pantalla de Trabajadores, preseleccionar
  const trabajadorPreseleccionado = localStorage.getItem('sisso_trabajador_id');
  if (trabajadorPreseleccionado) {
    document.getElementById('sel-trabajador').value = trabajadorPreseleccionado;
    cargarSesionesPrevias();
  }
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
    mostrarError('error-sesion', 'No se pudo cargar la lista de trabajadores: ' + err.message);
  }
}

// ------- Sesiones previas: permite CONTINUAR una sesion en vez de
// perderla al recargar o salir de la pagina (antes solo se podia
// crear una sesion nueva cada vez). -------
async function cargarSesionesPrevias() {
  const trabajadorId = document.getElementById('sel-trabajador').value;
  const caja = document.getElementById('caja-sesiones-previas');
  const lista = document.getElementById('lista-sesiones-previas');

  if (!trabajadorId) { caja.style.display = 'none'; return; }

  try {
    const datos = await sissoFetch(`/ergonomia/sesiones/trabajador/${trabajadorId}`);
    const sesiones = datos.sesiones || [];

    if (sesiones.length === 0) {
      caja.style.display = 'none';
      return;
    }

    lista.innerHTML = sesiones.map(s => `
      <div class="sesion-previa-item" data-on-click="continuarSesion('${s.id}')">
        <div>
          <strong>${escHtml(s.puesto_evaluado)}</strong>
          ${s.tarea_observada ? ` — ${escHtml(s.tarea_observada)}` : ''}
          <div style="font-size:11px;color:var(--t3);">Por ${escHtml(s.evaluador_nombre)} · ${formatearFecha(s.fecha_evaluacion)}</div>
        </div>
        ${s.puntuacion_final_maxima !== null
          ? `<span class="sisso-chip" style="background:${colorNivelRiesgo(nivelDesdeScore(s.puntuacion_final_maxima))}22;color:${colorNivelRiesgo(nivelDesdeScore(s.puntuacion_final_maxima))};">Score máx. ${s.puntuacion_final_maxima}</span>`
          : '<span class="sisso-chip gris">Sin posturas aún</span>'
        }
      </div>`).join('');

    caja.style.display = 'block';
  } catch (err) {
    caja.style.display = 'none';
  }
}

// Aproxima el nivel de riesgo solo para colorear el chip de la lista
// de sesiones previas (el calculo real y autoritativo siempre viene
// del backend al guardar cada postura individual).
function nivelDesdeScore(score) {
  if (score === 1) return 'inapreciable';
  if (score <= 3) return 'bajo';
  if (score <= 7) return 'medio';
  if (score <= 10) return 'alto';
  return 'muy_alto';
}

async function continuarSesion(sesionId) {
  ocultarError('error-sesion');
  try {
    const datos = await sissoFetch(`/ergonomia/sesiones/${sesionId}`);
    sesionActualId = datos.sesion.id;

    document.getElementById('titulo-sesion-activa').textContent =
      `${datos.sesion.trabajador_nombre} — ${datos.sesion.puesto_evaluado}`;
    document.getElementById('subtitulo-sesion-activa').textContent =
      `Sesión iniciada el ${formatearFecha(datos.sesion.fecha_evaluacion)} por ${datos.sesion.evaluador_nombre}`;

    document.getElementById('caja-seleccion-sesion').style.display = 'none';
    document.getElementById('caja-sesion-activa').style.display = 'block';

    // Repoblar la lista de posturas ya guardadas en esta sesion
    const lista = document.getElementById('lista-posturas');
    if (datos.evaluaciones.length === 0) {
      lista.innerHTML = '<div class="sisso-vacio">Aún no se ha evaluado ninguna postura.</div>';
    } else {
      lista.innerHTML = '';
      datos.evaluaciones.forEach(ev => agregarPosturaALista(ev));
    }
  } catch (err) {
    mostrarError('error-sesion', 'No se pudo abrir la sesión: ' + err.message);
  }
}

function formatearFecha(fecha) {
  if (!fecha) return '';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'numeric' });
}

// ------- PASO 1: iniciar sesion -------
async function iniciarSesion() {
  ocultarError('error-sesion');
  const trabajadorId = document.getElementById('sel-trabajador').value;
  const puesto = document.getElementById('sel-puesto').value.trim();
  const tarea = document.getElementById('sel-tarea').value.trim();

  if (!trabajadorId) { mostrarError('error-sesion', 'Selecciona un trabajador.'); return; }
  if (!puesto) { mostrarError('error-sesion', 'Indica el puesto evaluado.'); return; }

  const boton = document.getElementById('btn-iniciar-sesion');
  boton.disabled = true;
  boton.textContent = 'Creando sesión…';

  try {
    const datos = await sissoFetch('/ergonomia/sesiones', {
      method: 'POST',
      body: { trabajadorId, puestoEvaluado: puesto, tareaObservada: tarea || undefined }
    });

    sesionActualId = datos.sesion.id;
    const trabajador = trabajadores.find(t => t.id === trabajadorId);

    document.getElementById('titulo-sesion-activa').textContent =
      `${trabajador ? trabajador.nombre_completo : 'Trabajador'} — ${puesto}`;
    document.getElementById('subtitulo-sesion-activa').textContent =
      tarea ? `Tarea observada: ${tarea}` : 'Sesión iniciada correctamente.';

    document.getElementById('caja-seleccion-sesion').style.display = 'none';
    document.getElementById('caja-sesion-activa').style.display = 'block';
    document.getElementById('lista-posturas').innerHTML = '<div class="sisso-vacio">Aún no se ha evaluado ninguna postura.</div>';

  } catch (err) {
    mostrarError('error-sesion', err.message || 'Error al crear la sesión.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Iniciar sesión nueva';
  }
}

function cerrarSesionActiva() {
  sesionActualId = null;
  document.getElementById('caja-seleccion-sesion').style.display = 'block';
  document.getElementById('caja-sesion-activa').style.display = 'none';
  cargarSesionesPrevias();
}

// ------- Leer el valor seleccionado de un grupo de radios -------
function valorRadio(nombre) {
  const el = document.querySelector(`input[name="${nombre}"]:checked`);
  return el ? el.value : null;
}

function valorCheck(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

// ------- Convertir archivo a base64 data URI -------
function leerArchivoComoBase64(input) {
  return new Promise((resolve, reject) => {
    const archivo = input.files[0];
    if (!archivo) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(archivo);
  });
}

// ------- PASO 2: calcular y guardar postura -------
async function calcularYGuardarPostura() {
  ocultarError('error-postura');

  const nombrePostura = document.getElementById('p-nombre').value.trim();
  if (!nombrePostura) { mostrarError('error-postura', 'Indica un nombre para esta postura.'); return; }
  if (!sesionActualId) { mostrarError('error-postura', 'No hay una sesión activa.'); return; }

  const boton = document.getElementById('btn-calcular');
  boton.disabled = true;
  boton.textContent = 'Calculando…';

  try {
    const evidenciaBase64 = await leerArchivoComoBase64(document.getElementById('p-evidencia'));

    const cuerpo = {
      nombrePostura,
      tronco: valorRadio('tronco'),
      troncoTorsionLateral: valorCheck('tronco-torsion'),
      cuello: valorRadio('cuello'),
      cuelloTorsionLateral: valorCheck('cuello-torsion'),
      piernas: valorRadio('piernas'),
      piernasFlexionRodilla: valorRadio('piernasFlexionRodilla'),
      cargaFuerza: valorRadio('cargaFuerza'),
      cargaBruscaORapida: valorCheck('carga-brusca'),

      brazoDerecho: valorRadio('brazoDerecho'),
      brazoDerechoAbduccionORotacion: valorCheck('brazoDerecho-abduccion'),
      brazoDerechoApoyado: valorCheck('brazoDerecho-apoyado'),
      antebrazoDerecho: valorRadio('antebrazoDerecho'),
      munecaDerecha: valorRadio('munecaDerecha'),
      munecaDerechaTorsionODesviacion: valorCheck('munecaDerecha-torsion'),

      brazoIzquierdo: valorRadio('brazoIzquierdo'),
      brazoIzquierdoAbduccionORotacion: valorCheck('brazoIzquierdo-abduccion'),
      brazoIzquierdoApoyado: valorCheck('brazoIzquierdo-apoyado'),
      antebrazoIzquierdo: valorRadio('antebrazoIzquierdo'),
      munecaIzquierda: valorRadio('munecaIzquierda'),
      munecaIzquierdaTorsionODesviacion: valorCheck('munecaIzquierda-torsion'),

      agarre: valorRadio('agarre'),

      actividadPosturasEstaticas: valorCheck('act-estatica'),
      actividadMovimientosRepetidos: valorCheck('act-repetida'),
      actividadCambiosPosturalesRapidos: valorCheck('act-cambios'),

      evidenciaBase64: evidenciaBase64 || undefined,
    };

    const datos = await sissoFetch(`/ergonomia/sesiones/${sesionActualId}/reba`, {
      method: 'POST',
      body: cuerpo
    });

    mostrarResultado(datos.evaluacion);
    await agregarPosturaALista(datos.evaluacion);

    // Limpiar nombre de postura y evidencia para la siguiente
    document.getElementById('p-nombre').value = '';
    document.getElementById('p-evidencia').value = '';

  } catch (err) {
    mostrarError('error-postura', err.message || 'Error al calcular la postura.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Calcular y guardar postura';
  }
}

function colorNivelRiesgo(nivel) {
  const mapa = {
    inapreciable: '#16a34a',
    bajo: '#65a30d',
    medio: '#d97706',
    alto: '#ea580c',
    muy_alto: '#dc2626',
  };
  return mapa[nivel] || '#718096';
}

function etiquetaNivelRiesgo(nivel) {
  const mapa = {
    inapreciable: 'Riesgo inapreciable',
    bajo: 'Riesgo bajo',
    medio: 'Riesgo medio',
    alto: 'Riesgo alto',
    muy_alto: 'Riesgo muy alto',
  };
  return mapa[nivel] || nivel;
}

function mostrarResultado(evaluacion) {
  document.getElementById('resultado-vacio').style.display = 'none';
  document.getElementById('resultado-contenido').style.display = 'block';

  const circulo = document.getElementById('score-circulo');
  circulo.textContent = evaluacion.puntuacion_final;
  circulo.style.background = colorNivelRiesgo(evaluacion.nivel_riesgo);

  document.getElementById('score-nivel').textContent = etiquetaNivelRiesgo(evaluacion.nivel_riesgo);
  document.getElementById('score-nivel').style.color = colorNivelRiesgo(evaluacion.nivel_riesgo);

  document.getElementById('d-a').textContent = evaluacion.puntuacion_a;
  document.getElementById('d-b-der').textContent = evaluacion.puntuacion_b_derecho;
  document.getElementById('d-b-izq').textContent = evaluacion.puntuacion_b_izquierdo;
  document.getElementById('d-c').textContent = evaluacion.puntuacion_c;
  document.getElementById('d-act').textContent = evaluacion.puntuacion_actividad;
  document.getElementById('d-lado').textContent =
    evaluacion.lado_evaluado === 'ambos_iguales' ? 'Ambos iguales' :
    evaluacion.lado_evaluado === 'derecho' ? 'Derecho' : 'Izquierdo';
  document.getElementById('d-accion').textContent = evaluacion.accion_requerida;

  // Lote F (Fase 13): interpretacion + recomendaciones en lenguaje
  // llano segun el nivel de riesgo ya calculado por el backend. Es
  // texto de apoyo generico por nivel (no reemplaza el juicio del
  // profesional de SSO ni el "accion_requerida" que ya devuelve el
  // motor de calculo, que no se modifico).
  const guia = GUIA_INTERPRETACION_REBA[evaluacion.nivel_riesgo] || null;
  document.getElementById('d-interpretacion').textContent = guia ? guia.interpretacion : '';
  document.getElementById('d-recomendaciones').innerHTML = guia
    ? `<div style="font-size:11.5px;font-weight:700;color:var(--t3);margin-bottom:4px;">Recomendaciones:</div>` +
      `<ul style="margin:0;padding-left:18px;font-size:12px;color:var(--t2);">${guia.recomendaciones.map(r => `<li>${r}</li>`).join('')}</ul>`
    : '';
}

const GUIA_INTERPRETACION_REBA = {
  bajo: {
    interpretacion: 'El nivel de riesgo postural es bajo. La postura evaluada no representa una prioridad de intervención inmediata.',
    recomendaciones: ['Mantener seguimiento periódico del puesto.', 'Reforzar buenas prácticas posturales con el trabajador.'],
  },
  medio: {
    interpretacion: 'Existe un riesgo postural moderado. Se recomienda profundizar el análisis y planificar mejoras a mediano plazo.',
    recomendaciones: ['Investigar con más detalle la tarea y el puesto.', 'Evaluar ajustes ergonómicos (altura, alcances, herramientas).', 'Dar seguimiento en la próxima inspección.'],
  },
  alto: {
    interpretacion: 'El riesgo postural es alto. La intervención debe planificarse pronto, no queda a criterio de la próxima revisión.',
    recomendaciones: ['Investigar y actuar pronto sobre el puesto.', 'Considerar rediseño del puesto o rotación de tareas.', 'Registrar la acción correctiva en el sistema de CAPA.'],
  },
  muy_alto: {
    interpretacion: 'El riesgo postural es muy alto. Se requiere intervención inmediata sobre la tarea o el puesto evaluado.',
    recomendaciones: ['Actuar de inmediato — no postergar la intervención.', 'Evaluar suspensión temporal de la tarea si es viable.', 'Escalar a CAPA con prioridad alta y notificar al responsable de SSO.'],
  },
};

// CORREGIDO tras auditoria de seguridad (hallazgo G12): el archivo
// de evidencia ya no tiene una URL publica permanente (backend:
// ergonomiaController.js/cloudinaryService.js). Hay que pedirle al
// backend una URL firmada de corta duracion cada vez que alguien
// quiere verla, en vez de usar directamente evidencia_url.
//
// Se abre la pestaña ANTES de esperar la respuesta del backend
// (con about:blank) y recien despues se le asigna la URL real,
// porque los navegadores solo permiten window.open() sin bloqueo
// de popups si ocurre de forma sincrona dentro del clic del
// usuario — si se espera al fetch primero, muchos navegadores
// bloquean la ventana.
async function verEvidenciaFirmada(evaluacionId, event) {
  if (event) event.preventDefault();
  const ventana = window.open('', '_blank');
  try {
    const datos = await sissoFetch(`/ergonomia/evaluaciones/${evaluacionId}/evidencia-url`);
    if (ventana) ventana.location.href = datos.url;
  } catch (err) {
    if (ventana) ventana.close();
    alert(err.message || 'No se pudo obtener el enlace de la evidencia.');
  }
  return false;
}

async function agregarPosturaALista(evaluacion) {
  const lista = document.getElementById('lista-posturas');
  if (lista.querySelector('.sisso-vacio')) lista.innerHTML = '';

  const item = document.createElement('div');
  item.className = 'lista-posturas-item';
  item.innerHTML = `
    <div>
      <strong>${escHtml(evaluacion.nombre_postura)}</strong>
      ${evaluacion.evidencia_url ? `<a href="#" data-on-click="return verEvidenciaFirmada('${evaluacion.id}', event)" style="margin-left:8px;font-size:11px;color:var(--blue);">📎 ver evidencia</a>` : ''}
    </div>
    <span class="sisso-chip" style="background:${colorNivelRiesgo(evaluacion.nivel_riesgo)}22;color:${colorNivelRiesgo(evaluacion.nivel_riesgo)};">
      Score ${evaluacion.puntuacion_final} · ${etiquetaNivelRiesgo(evaluacion.nivel_riesgo)}
    </span>`;
  lista.appendChild(item);
}

// ------- Helpers -------
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
function ocultarError(idEl) {
  document.getElementById(idEl).classList.remove('visible');
}
