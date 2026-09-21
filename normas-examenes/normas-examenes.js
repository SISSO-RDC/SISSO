// ============================================================
// SISSO - Verificacion normativa de los examenes del protocolo.
//
// CREADO en Auditoria N.19 (hallazgo GRAVE G19-07). El backend
// (migration_091 + examenesOrganizacionController.js) ya distinguia
// no_verificada / verificada_vigente / verificada_vencida y ofrecia el
// endpoint exclusivo del medico, pero no existia ninguna pantalla que lo
// usara: el gobierno normativo estaba atrapado en la API.
//
// Contrato usado:
//   GET /examenes-organizacion            -> { examenes: [ { id, nombre, tipo,
//        frecuencia, origen, estado_verificacion, vigencia_norma,
//        fuente_norma, jurisdiccion, articulo_referencia, fecha_validacion,
//        vigente_hasta, verificado_en, verificado_por_nombre, ... } ] }
//   PUT /examenes-organizacion/:id/verificacion   (solo medico)
//        { verificada: true, fuenteNorma, jurisdiccion, articuloReferencia,
//          fechaValidacion, vigenteHasta?, frecuencia? }
//        { verificada: false }  -> retira la verificacion.
//
// Regla de presentacion: un examen sin verificar se muestra SIEMPRE como
// "No verificada" (sugerencia), nunca como norma; y uno con vigencia
// vencida como "Verificada - vencida". El estado lo decide el backend
// (vigencia_norma); esta pantalla no lo recalcula.
// ============================================================
let esMedico = false;
let examenes = [];
let examenEnEdicion = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('normas-examenes', 'Normas de exámenes');
  const usuario = SissoSesion.obtenerUsuario();
  if (!usuario) return;
  esMedico = usuario.rol === 'medico';
  await cargarExamenes();
});

async function cargarExamenes() {
  try {
    const datos = await sissoFetch('/examenes-organizacion');
    examenes = Array.isArray(datos.examenes) ? datos.examenes : [];
    renderizar();
  } catch (err) {
    document.getElementById('resumen').innerHTML = '';
    document.getElementById('contenido').innerHTML =
      `<div class="sisso-vacio">Error al cargar los exámenes: ${escHtml(err.message)}</div>`;
  }
}

// ---------- Presentacion ----------

const ESTADOS = {
  verificada_vigente: { texto: 'Verificada — vigente', chip: 'verde' },
  verificada_vencida: { texto: 'Verificada — vencida', chip: 'ambar' },
  no_verificada: { texto: 'No verificada (sugerencia)', chip: 'gris' },
};

function estadoDe(examen) {
  // Cualquier valor desconocido se trata como NO verificada: nunca se
  // presenta como norma algo que el backend no confirmo.
  return ESTADOS[examen.vigencia_norma] || ESTADOS.no_verificada;
}

function fechaCorta(valor) {
  if (!valor) return '—';
  const texto = String(valor).slice(0, 10);
  const partes = texto.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : escHtml(texto);
}

function renderizar() {
  const vigentes = examenes.filter((e) => e.vigencia_norma === 'verificada_vigente').length;
  const vencidas = examenes.filter((e) => e.vigencia_norma === 'verificada_vencida').length;
  const sinVerificar = examenes.length - vigentes - vencidas;

  document.getElementById('resumen').innerHTML = `
    <span class="sisso-chip verde">Verificados vigentes: ${vigentes}</span>
    <span class="sisso-chip ambar">Verificados vencidos: ${vencidas}</span>
    <span class="sisso-chip gris">Sin verificar: ${sinVerificar}</span>`;

  if (examenes.length === 0) {
    document.getElementById('contenido').innerHTML =
      '<div class="sisso-vacio">La organización aún no tiene exámenes en su protocolo.</div>';
    return;
  }

  const filas = examenes.map((e) => {
    const est = estadoDe(e);
    const verificado = e.estado_verificacion === 'verificada';
    const detalle = verificado
      ? `<div class="norma-detalle">
           <div><span>Fuente:</span> ${escHtml(e.fuente_norma || '—')}</div>
           <div><span>Jurisdicción:</span> ${escHtml(e.jurisdiccion || '—')}</div>
           <div><span>Artículo:</span> ${escHtml(e.articulo_referencia || '—')}</div>
         </div>`
      : '<div class="norma-detalle"><span>Sin respaldo normativo verificado.</span></div>';
    const fechas = verificado
      ? `<div class="norma-detalle">
           <div><span>Validada:</span> ${fechaCorta(e.fecha_validacion)}</div>
           <div><span>Vigente hasta:</span> ${e.vigente_hasta ? fechaCorta(e.vigente_hasta) : 'sin fecha declarada'}</div>
           <div><span>Verificó:</span> ${escHtml(e.verificado_por_nombre || '—')}</div>
         </div>`
      : '<div class="norma-detalle">—</div>';
    const acciones = esMedico
      ? `<div class="acciones-norma">
           <button class="sisso-boton pequeno" data-on-click="abrirVerificacion('${escHtml(e.id)}')">${verificado ? 'Revalidar' : 'Verificar norma'}</button>
           ${verificado ? `<button class="sisso-boton secundario pequeno" data-on-click="retirarVerificacion('${escHtml(e.id)}')">Retirar</button>` : ''}
         </div>`
      : '<span class="norma-detalle">Solo el médico puede verificar.</span>';
    return `
      <tr>
        <td><strong>${escHtml(e.nombre)}</strong><div class="norma-detalle">${escHtml(e.tipo || '')}${e.origen ? ` · origen: ${escHtml(e.origen)}` : ''}</div></td>
        <td>${escHtml(e.frecuencia || '—')}</td>
        <td><span class="sisso-chip ${est.chip}">${est.texto}</span></td>
        <td>${detalle}</td>
        <td>${fechas}</td>
        <td>${acciones}</td>
      </tr>`;
  }).join('');

  document.getElementById('contenido').innerHTML = `
    <div class="tabla-norma-wrap">
      <table class="sisso-tabla">
        <thead><tr>
          <th>Examen</th><th>Frecuencia</th><th>Estado normativo</th>
          <th>Respaldo</th><th>Validación</th><th>Acciones</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

// ---------- Panel de verificacion (solo medico) ----------

function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function abrirVerificacion(id) {
  if (!esMedico) return;
  const examen = examenes.find((e) => e.id === id);
  if (!examen) return;
  examenEnEdicion = examen;
  ocultarMensajes();

  const verificado = examen.estado_verificacion === 'verificada';
  document.getElementById('panel-titulo').textContent = verificado ? 'Revalidar norma' : 'Verificar norma';
  document.getElementById('panel-subtitulo').textContent = `Examen: ${examen.nombre}`;
  // Al revalidar se precargan los datos vigentes para editarlos; la fecha de
  // validacion se propone como HOY porque es una nueva validacion.
  document.getElementById('v-fuente').value = verificado ? (examen.fuente_norma || '') : '';
  document.getElementById('v-jurisdiccion').value = verificado ? (examen.jurisdiccion || '') : '';
  document.getElementById('v-articulo').value = verificado ? (examen.articulo_referencia || '') : '';
  document.getElementById('v-fecha-validacion').value = hoyISO();
  document.getElementById('v-vigente-hasta').value = verificado && examen.vigente_hasta ? String(examen.vigente_hasta).slice(0, 10) : '';
  document.getElementById('v-frecuencia').value = examen.frecuencia || '';

  const panel = document.getElementById('panel-verificacion');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cerrarPanel() {
  examenEnEdicion = null;
  document.getElementById('panel-verificacion').style.display = 'none';
  ocultarError('error-panel');
}

async function guardarVerificacion() {
  if (!esMedico || !examenEnEdicion) return;
  ocultarError('error-panel');

  const fuente = document.getElementById('v-fuente').value.trim();
  const jurisdiccion = document.getElementById('v-jurisdiccion').value.trim();
  const articulo = document.getElementById('v-articulo').value.trim();
  const fechaValidacion = document.getElementById('v-fecha-validacion').value;
  const vigenteHasta = document.getElementById('v-vigente-hasta').value;
  const frecuencia = document.getElementById('v-frecuencia').value.trim();

  // Mismas exigencias que el backend, para dar un mensaje claro antes de enviar.
  if (fuente.length < 5) return mostrarError('error-panel', 'La fuente de la norma es obligatoria (mínimo 5 caracteres).');
  if (jurisdiccion.length < 2) return mostrarError('error-panel', 'La jurisdicción es obligatoria.');
  if (articulo.length < 1) return mostrarError('error-panel', 'El artículo o sección es obligatorio.');
  if (!fechaValidacion) return mostrarError('error-panel', 'La fecha de validación es obligatoria.');
  if (vigenteHasta && vigenteHasta < fechaValidacion) {
    return mostrarError('error-panel', 'La vigencia no puede ser anterior a la fecha de validación.');
  }

  const btn = document.getElementById('btn-guardar-verificacion');
  btn.disabled = true;
  try {
    const cuerpo = { verificada: true, fuenteNorma: fuente, jurisdiccion, articuloReferencia: articulo, fechaValidacion };
    if (vigenteHasta) cuerpo.vigenteHasta = vigenteHasta;
    if (frecuencia) cuerpo.frecuencia = frecuencia;
    await sissoFetch(`/examenes-organizacion/${encodeURIComponent(examenEnEdicion.id)}/verificacion`, { method: 'PUT', body: cuerpo });
    const nombre = examenEnEdicion.nombre;
    cerrarPanel();
    mostrarExito('exito-general', `Norma verificada para «${nombre}».`);
    await cargarExamenes();
  } catch (err) {
    mostrarError('error-panel', err.message || 'No se pudo guardar la verificación.');
  } finally {
    btn.disabled = false;
  }
}

async function retirarVerificacion(id) {
  if (!esMedico) return;
  const examen = examenes.find((e) => e.id === id);
  if (!examen) return;
  ocultarMensajes();
  const ok = window.confirm(`¿Retirar la verificación normativa de «${examen.nombre}»? Volverá a mostrarse como «No verificada».`);
  if (!ok) return;
  try {
    await sissoFetch(`/examenes-organizacion/${encodeURIComponent(id)}/verificacion`, { method: 'PUT', body: { verificada: false } });
    mostrarExito('exito-general', `Se retiró la verificación de «${examen.nombre}».`);
    await cargarExamenes();
  } catch (err) {
    mostrarError('error-general', err.message || 'No se pudo retirar la verificación.');
  }
}

// ---------- Mensajes ----------

function ocultarMensajes() {
  ocultarError('error-general');
  ocultarExito('exito-general');
}
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
}
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
