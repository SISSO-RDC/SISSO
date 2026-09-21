// ============================================================
// SISSO - Logica de la pagina (rula/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let sesionActualId = null;
let trabajadores = [];

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('rula', 'Calculadora RULA');
  await cargarTrabajadores();
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

// ------- Sesiones previas: permite CONTINUAR una sesion existente. -------
async function cargarSesionesPrevias() {
  const trabajadorId = document.getElementById('sel-trabajador').value;
  const caja = document.getElementById('caja-sesiones-previas');
  const lista = document.getElementById('lista-sesiones-previas');

  if (!trabajadorId) { caja.style.display = 'none'; return; }

  try {
    const datos = await sissoFetch(`/ergonomia/rula/sesiones/trabajador/${trabajadorId}`);
    const sesiones = datos.sesiones || [];

    if (sesiones.length === 0) { caja.style.display = 'none'; return; }

    lista.innerHTML = sesiones.map(s => `
      <div class="sesion-previa-item" data-on-click="continuarSesion('${s.id}')">
        <div>
          <strong>${escHtml(s.puesto_evaluado)}</strong>
          ${s.tarea_observada ? ` — ${escHtml(s.tarea_observada)}` : ''}
          <div style="font-size:11px;color:var(--t3);">Por ${escHtml(s.evaluador_nombre)} · ${formatearFecha(s.fecha_evaluacion)}</div>
        </div>
        ${s.puntuacion_final_maxima !== null
          ? `<span class="sisso-chip" style="background:${colorNivelRiesgoRula(nivelDesdeScoreRula(s.puntuacion_final_maxima))}22;color:${colorNivelRiesgoRula(nivelDesdeScoreRula(s.puntuacion_final_maxima))};">Score máx. ${s.puntuacion_final_maxima}</span>`
          : '<span class="sisso-chip gris">Sin posturas aún</span>'
        }
      </div>`).join('');

    caja.style.display = 'block';
  } catch (err) {
    caja.style.display = 'none';
  }
}

function nivelDesdeScoreRula(score) {
  if (score <= 2) return 'aceptable';
  if (score <= 4) return 'puede_requerir_cambios';
  if (score <= 6) return 'requiere_cambios_pronto';
  return 'requiere_cambios_ya';
}

async function continuarSesion(sesionId) {
  ocultarError('error-sesion');
  try {
    const datos = await sissoFetch(`/ergonomia/rula/sesiones/${sesionId}`);
    sesionActualId = datos.sesion.id;

    document.getElementById('titulo-sesion-activa').textContent = `${datos.sesion.trabajador_nombre} — ${datos.sesion.puesto_evaluado}`;
    document.getElementById('subtitulo-sesion-activa').textContent = `Sesión iniciada el ${formatearFecha(datos.sesion.fecha_evaluacion)} por ${datos.sesion.evaluador_nombre}`;

    document.getElementById('caja-seleccion-sesion').style.display = 'none';
    document.getElementById('caja-sesion-activa').style.display = 'block';

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
    const datos = await sissoFetch('/ergonomia/rula/sesiones', {
      method: 'POST',
      body: { trabajadorId, puestoEvaluado: puesto, tareaObservada: tarea || undefined }
    });

    sesionActualId = datos.sesion.id;
    const trabajador = trabajadores.find(t => t.id === trabajadorId);

    document.getElementById('titulo-sesion-activa').textContent = `${trabajador ? trabajador.nombre_completo : 'Trabajador'} — ${puesto}`;
    document.getElementById('subtitulo-sesion-activa').textContent = tarea ? `Tarea observada: ${tarea}` : 'Sesión iniciada correctamente.';

    document.getElementById('caja-seleccion-sesion').style.display = 'none';
    document.getElementById('caja-sesion-activa').style.display = 'block';
    document.getElementById('lista-posturas').innerHTML = '<div class="sisso-vacio">Aún no se ha evaluado ninguna postura.</div>';

  } catch (err) {
    mostrarError('error-sesion', err.message || 'Error al crear la sesión.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Iniciar sesión de evaluación';
  }
}

function cerrarSesionActiva() {
  sesionActualId = null;
  document.getElementById('caja-seleccion-sesion').style.display = 'block';
  document.getElementById('caja-sesion-activa').style.display = 'none';
  cargarSesionesPrevias();
}

function valorRadio(nombre) {
  const el = document.querySelector(`input[name="${nombre}"]:checked`);
  return el ? el.value : null;
}
function valorCheck(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}
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

      brazoDerecho: valorRadio('brazoDerecho'),
      brazoDerechoHombroElevado: valorCheck('brazoDerecho-hombro'),
      brazoDerechoAbducido: valorCheck('brazoDerecho-abducido'),
      brazoDerechoApoyado: valorCheck('brazoDerecho-apoyado'),
      antebrazoDerecho: valorRadio('antebrazoDerecho'),
      antebrazoDerechoCruzaLineaMedia: valorCheck('antebrazoDerecho-cruza'),
      munecaDerecha: valorRadio('munecaDerecha'),
      munecaDerechaDesviacionRadialCubital: valorCheck('munecaDerecha-desviacion'),
      munecaDerechaRotacion: valorRadio('munecaDerechaRotacion'),

      brazoIzquierdo: valorRadio('brazoIzquierdo'),
      brazoIzquierdoHombroElevado: valorCheck('brazoIzquierdo-hombro'),
      brazoIzquierdoAbducido: valorCheck('brazoIzquierdo-abducido'),
      brazoIzquierdoApoyado: valorCheck('brazoIzquierdo-apoyado'),
      antebrazoIzquierdo: valorRadio('antebrazoIzquierdo'),
      antebrazoIzquierdoCruzaLineaMedia: valorCheck('antebrazoIzquierdo-cruza'),
      munecaIzquierda: valorRadio('munecaIzquierda'),
      munecaIzquierdaDesviacionRadialCubital: valorCheck('munecaIzquierda-desviacion'),
      munecaIzquierdaRotacion: valorRadio('munecaIzquierdaRotacion'),

      grupoAMusculoEstaticoORepetido: valorCheck('grupoA-musculo'),
      grupoAFuerzaCarga: valorRadio('grupoAFuerzaCarga'),

      cuello: valorRadio('cuello'),
      cuelloTorsion: valorCheck('cuello-torsion'),
      cuelloInclinacionLateral: valorCheck('cuello-inclinacion'),
      tronco: valorRadio('tronco'),
      troncoSentado: valorCheck('tronco-sentado'),
      troncoTorsion: valorCheck('tronco-torsion'),
      troncoInclinacionLateral: valorCheck('tronco-inclinacion'),
      piernasBienApoyadas: valorCheck('piernas-apoyadas'),

      grupoBMusculoEstaticoORepetido: valorCheck('grupoB-musculo'),
      grupoBFuerzaCarga: valorRadio('grupoBFuerzaCarga'),

      evidenciaBase64: evidenciaBase64 || undefined,
    };

    const datos = await sissoFetch(`/ergonomia/rula/sesiones/${sesionActualId}/evaluaciones`, {
      method: 'POST',
      body: cuerpo
    });

    mostrarResultado(datos.evaluacion);
    await agregarPosturaALista(datos.evaluacion);

    document.getElementById('p-nombre').value = '';
    document.getElementById('p-evidencia').value = '';

  } catch (err) {
    mostrarError('error-postura', err.message || 'Error al calcular la postura.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Calcular y guardar postura';
  }
}

function colorNivelRiesgoRula(nivel) {
  const mapa = {
    aceptable: '#16a34a',
    puede_requerir_cambios: '#d97706',
    requiere_cambios_pronto: '#ea580c',
    requiere_cambios_ya: '#dc2626',
  };
  return mapa[nivel] || '#718096';
}
function etiquetaNivelRiesgoRula(nivel) {
  const mapa = {
    aceptable: 'Riesgo aceptable',
    puede_requerir_cambios: 'Puede requerir cambios',
    requiere_cambios_pronto: 'Requiere cambios pronto',
    requiere_cambios_ya: 'Requiere cambios urgentes',
  };
  return mapa[nivel] || nivel;
}

function mostrarResultado(evaluacion) {
  document.getElementById('resultado-vacio').style.display = 'none';
  document.getElementById('resultado-contenido').style.display = 'block';

  const circulo = document.getElementById('score-circulo');
  circulo.textContent = evaluacion.puntuacion_c;
  circulo.style.background = colorNivelRiesgoRula(evaluacion.nivel_riesgo);

  document.getElementById('score-nivel').textContent = etiquetaNivelRiesgoRula(evaluacion.nivel_riesgo);
  document.getElementById('score-nivel').style.color = colorNivelRiesgoRula(evaluacion.nivel_riesgo);

  document.getElementById('d-a-der').textContent = evaluacion.puntuacion_a_derecha;
  document.getElementById('d-a-izq').textContent = evaluacion.puntuacion_a_izquierda;
  document.getElementById('d-b').textContent = evaluacion.puntuacion_b;
  document.getElementById('d-lado').textContent =
    evaluacion.lado_evaluado === 'ambos_iguales' ? 'Ambos iguales' :
    evaluacion.lado_evaluado === 'derecho' ? 'Derecho' : 'Izquierdo';
  document.getElementById('d-accion').textContent = evaluacion.accion_requerida;

  // Lote F (Fase 13): mismo criterio que en REBA -- texto de apoyo
  // por nivel, no reemplaza el calculo ni el juicio profesional.
  const guia = GUIA_INTERPRETACION_RULA[evaluacion.nivel_riesgo] || null;
  document.getElementById('d-interpretacion').textContent = guia ? guia.interpretacion : '';
  document.getElementById('d-recomendaciones').innerHTML = guia
    ? `<div style="font-size:11.5px;font-weight:700;color:var(--t3);margin-bottom:4px;">Recomendaciones:</div>` +
      `<ul style="margin:0;padding-left:18px;font-size:12px;color:var(--t2);">${guia.recomendaciones.map(r => `<li>${r}</li>`).join('')}</ul>`
    : '';
}

const GUIA_INTERPRETACION_RULA = {
  aceptable: {
    interpretacion: 'La postura evaluada tiene un riesgo aceptable. No requiere intervención inmediata.',
    recomendaciones: ['Mantener seguimiento periódico del puesto.', 'Reforzar buenas prácticas posturales.'],
  },
  puede_requerir_cambios: {
    interpretacion: 'La postura puede requerir cambios. Conviene seguir observando y evaluar ajustes menores.',
    recomendaciones: ['Observar la tarea en más ocasiones.', 'Evaluar pequeños ajustes de puesto o herramienta.'],
  },
  requiere_cambios_pronto: {
    interpretacion: 'La postura requiere cambios pronto. La intervención debe planificarse a corto plazo.',
    recomendaciones: ['Investigar la tarea con mayor detalle.', 'Planificar rediseño o rotación de tareas.', 'Registrar seguimiento en CAPA si corresponde.'],
  },
  requiere_cambios_ya: {
    interpretacion: 'La postura requiere cambios urgentes. Se recomienda intervenir de inmediato.',
    recomendaciones: ['Actuar de inmediato sobre la tarea o el puesto.', 'Escalar a CAPA con prioridad alta.', 'Notificar al responsable de SSO.'],
  },
};

// CORREGIDO tras auditoria de seguridad (hallazgo G12): ver nota
// completa en reba/index.html (mismo patron, endpoint bajo
// /ergonomia/rula/ en vez de /ergonomia/).
async function verEvidenciaFirmada(evaluacionId, event) {
  if (event) event.preventDefault();
  const ventana = window.open('', '_blank');
  try {
    const datos = await sissoFetch(`/ergonomia/rula/evaluaciones/${evaluacionId}/evidencia-url`);
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
    <span class="sisso-chip" style="background:${colorNivelRiesgoRula(evaluacion.nivel_riesgo)}22;color:${colorNivelRiesgoRula(evaluacion.nivel_riesgo)};">
      Score ${evaluacion.puntuacion_c} · ${etiquetaNivelRiesgoRula(evaluacion.nivel_riesgo)}
    </span>`;
  lista.appendChild(item);
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
function ocultarError(idEl) {
  document.getElementById(idEl).classList.remove('visible');
}
