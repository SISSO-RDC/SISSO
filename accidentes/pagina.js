// ============================================================
// SISSO - Logica de la pagina (accidentes/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let esGestor = false; // admin o sso: puede crear/investigar/accionar
let trabajadores = [];
let usuariosOrganizacion = [];
let casoActualId = null;
let archivoEvidenciaPendiente = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('accidentes', 'Accidentes / Incidentes');

  const usuario = SissoSesion.obtenerUsuario();
  esGestor = ['admin', 'sso'].includes(usuario.rol);

  if (esGestor) {
    document.getElementById('caja-crear').style.display = 'block';
    document.getElementById('form-investigacion-caja').style.display = 'block';
    document.getElementById('form-evidencia-caja').style.display = 'block';
    document.getElementById('form-accion-caja').style.display = 'block';
    document.getElementById('acciones-caso-caja').style.display = 'block';
    await cargarTrabajadores();
    await cargarUsuarios();
  }

  await cargarListado();
});

// ======= Listado =======
async function cargarTrabajadores() {
  const sel = document.getElementById('c-trabajador');
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadores = datos.trabajadores || [];
    sel.innerHTML = '<option value="">Selecciona un trabajador…</option>' +
      trabajadores.map(t => `<option value="${t.id}">${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">Error al cargar trabajadores</option>';
  }
}

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/usuarios');
    usuariosOrganizacion = datos.usuarios || [];
    const sel = document.getElementById('a-responsable');
    sel.innerHTML = '<option value="">Selecciona un responsable…</option>' +
      usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)} (${escHtml(u.rol)})</option>`).join('');
  } catch (err) {
    document.getElementById('a-responsable').innerHTML = '<option value="">Error al cargar usuarios</option>';
  }
}

function alCambiarTipo() {
  const esCasiAccidente = document.getElementById('c-tipo').value === 'casi_accidente';
  document.getElementById('campo-trabajador').style.display = esCasiAccidente ? 'none' : 'block';
}

async function crearCaso() {
  ocultarError('error-crear');
  ocultarExito('exito-crear');

  const tipo = document.getElementById('c-tipo').value;
  const trabajadorId = document.getElementById('c-trabajador').value;
  const fecha = document.getElementById('c-fecha').value;
  const hora = document.getElementById('c-hora').value;
  const lugar = document.getElementById('c-lugar').value.trim();
  const descripcion = document.getElementById('c-descripcion').value.trim();
  const gravedad = document.getElementById('c-gravedad').value;
  const diasPerdidos = parseInt(document.getElementById('c-dias-perdidos').value, 10) || 0;
  const tipoLesion = document.getElementById('c-tipo-lesion').value.trim();
  const requiereAtencionMedica = document.getElementById('c-atencion-medica').checked;

  if (tipo !== 'casi_accidente' && !trabajadorId) { mostrarError('error-crear', 'Selecciona el trabajador afectado.'); return; }
  if (!fecha) { mostrarError('error-crear', 'Indica la fecha de ocurrencia.'); return; }
  if (!lugar) { mostrarError('error-crear', 'Indica el lugar.'); return; }
  if (descripcion.length < 10) { mostrarError('error-crear', 'La descripción debe tener al menos 10 caracteres.'); return; }

  const boton = document.getElementById('btn-crear');
  boton.disabled = true;
  boton.textContent = 'Reportando…';

  try {
    await sissoFetch('/accidentes', {
      method: 'POST',
      body: {
        tipo, trabajadorId: trabajadorId || undefined, fechaOcurrencia: fecha, horaOcurrencia: hora || undefined,
        lugar, descripcion, gravedad, diasPerdidos, tipoLesion: tipoLesion || undefined, requiereAtencionMedica,
      },
    });
    mostrarExito('exito-crear', 'Caso reportado correctamente.');
    document.getElementById('c-lugar').value = '';
    document.getElementById('c-descripcion').value = '';
    document.getElementById('c-tipo-lesion').value = '';
    document.getElementById('c-dias-perdidos').value = '0';
    document.getElementById('c-atencion-medica').checked = false;
    await cargarListado();
  } catch (err) {
    mostrarError('error-crear', err.message || 'Error al reportar el caso.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Reportar caso';
  }
}

async function cargarListado() {
  const cont = document.getElementById('lista-casos');
  cont.innerHTML = '<div class="sisso-cargando">Cargando casos…</div>';

  const tipo = document.getElementById('f-tipo').value;
  const estado = document.getElementById('f-estado').value;
  const parametros = new URLSearchParams();
  if (tipo) parametros.set('tipo', tipo);
  if (estado) parametros.set('estado', estado);

  try {
    const datos = await sissoFetch(`/accidentes?${parametros.toString()}`);
    const casos = datos.casos || [];
    if (casos.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay casos registrados con estos filtros.</div>';
      return;
    }
    cont.innerHTML = casos.map(c => `
      <div class="caso-item" data-on-click="abrirDetalle('${c.id}')">
        <div class="caso-cabecera">
          <div>${chipDeTipo(c.tipo)} ${chipDeGravedad(c.gravedad)}</div>
          ${chipDeEstado(c.estado)}
        </div>
        <div style="font-size:12.5px;color:var(--t2);margin-top:6px;">
          ${c.trabajador_nombre ? escHtml(c.trabajador_nombre) + ' — ' : ''}${escHtml(c.lugar)}
        </div>
        <div class="caso-meta">${formatearFecha(c.fecha_ocurrencia)}${c.nombre_puesto ? ' · ' + escHtml(c.nombre_puesto) : ''}</div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar los casos: ${escHtml(err.message)}</div>`;
  }
}

// ======= Detalle =======
async function abrirDetalle(id) {
  casoActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await cargarDetalle();
}

function volverAlListado() {
  casoActualId = null;
  document.getElementById('vista-listado').style.display = 'block';
  document.getElementById('vista-detalle').style.display = 'none';
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle');
  try {
    const datos = await sissoFetch(`/accidentes/${casoActualId}`);
    const c = datos.caso;

    document.getElementById('resumen-caso').innerHTML = `
      <div class="caso-cabecera">
        <div style="display:flex;gap:6px;">${chipDeTipo(c.tipo)} ${chipDeGravedad(c.gravedad)} ${chipDeEstado(c.estado)}</div>
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--t2);line-height:1.6;">
        ${c.trabajador_nombre ? `<strong>Trabajador:</strong> ${escHtml(c.trabajador_nombre)}<br>` : ''}
        <strong>Fecha:</strong> ${formatearFecha(c.fecha_ocurrencia)}${c.hora_ocurrencia ? ' · ' + escHtml(c.hora_ocurrencia) : ''}<br>
        <strong>Lugar:</strong> ${escHtml(c.lugar)}${c.nombre_puesto ? ' · ' + escHtml(c.nombre_puesto) : ''}<br>
        <strong>Descripción:</strong> ${escHtml(c.descripcion)}<br>
        ${c.tipo_lesion ? `<strong>Tipo de lesión:</strong> ${escHtml(c.tipo_lesion)}<br>` : ''}
        <strong>Días perdidos:</strong> ${c.dias_perdidos}<br>
        ${c.requiere_atencion_medica ? '<span class="sisso-chip ambar">Requiere atención médica</span>' : ''}
      </div>`;
    document.getElementById('d-estado').value = c.estado;

    // Investigacion
    const inv = datos.investigacion;
    document.getElementById('investigacion-existente').innerHTML = inv ? `
      <div style="font-size:12.5px;color:var(--t2);line-height:1.6;">
        ${inv.metodo_investigacion ? `<strong>Método:</strong> ${escHtml(inv.metodo_investigacion)}<br>` : ''}
        <strong>Causas inmediatas:</strong> ${escHtml(inv.causas_inmediatas)}<br>
        <strong>Causas básicas:</strong> ${escHtml(inv.causas_basicas)}<br>
        ${inv.factores_contribuyentes ? `<strong>Factores contribuyentes:</strong> ${escHtml(inv.factores_contribuyentes)}<br>` : ''}
        <span style="color:var(--t3);">Por ${escHtml(inv.investigador_nombre || '—')} el ${formatearFecha(inv.fecha_investigacion)}</span>
      </div>` : '<div class="sisso-vacio">Sin investigación registrada.</div>';
    if (inv && esGestor) {
      document.getElementById('i-metodo').value = inv.metodo_investigacion || '';
      document.getElementById('i-causas-inmediatas').value = inv.causas_inmediatas || '';
      document.getElementById('i-causas-basicas').value = inv.causas_basicas || '';
      document.getElementById('i-factores').value = inv.factores_contribuyentes || '';
      document.getElementById('i-fecha').value = (inv.fecha_investigacion || '').slice(0, 10);
    }

    // Acciones
    const acciones = datos.acciones || [];
    document.getElementById('lista-acciones').innerHTML = acciones.length === 0
      ? '<div class="sisso-vacio">Sin acciones registradas.</div>'
      : acciones.map(a => `
          <div class="accion-item">
            <div class="accion-cabecera">
              <strong style="font-size:12.5px;">${escHtml(a.descripcion)}</strong>
              ${chipDeEstadoAccion(a.estado)}
            </div>
            <div style="font-size:11.5px;color:var(--t3);margin-top:4px;">
              Responsable: ${escHtml(a.responsable_nombre || '—')} · Límite: ${formatearFecha(a.fecha_limite)}
            </div>
            ${a.nota_verificacion ? `<div style="font-size:11.5px;color:var(--t2);margin-top:4px;">Verificación: ${escHtml(a.nota_verificacion)}</div>` : ''}
            ${esGestor && a.estado === 'pendiente' || (esGestor && a.estado === 'en_progreso') ? `
              <div class="accion-botones"><button class="btn-mini" data-on-click="completarAccion('${a.id}')">✓ Marcar completada</button></div>` : ''}
            ${esGestor && a.estado === 'completada' ? `
              <div class="accion-botones"><button class="btn-mini" data-on-click="verificarAccion('${a.id}')">✓✓ Verificar</button></div>` : ''}
          </div>`).join('');

    // Evidencias
    const evidencias = datos.evidencias || [];
    document.getElementById('lista-evidencias').innerHTML = evidencias.length === 0
      ? '<div class="sisso-vacio">Sin evidencia todavía.</div>'
      : evidencias.map(e => `
          <div class="evidencia-item">
            <span>${e.tipo_archivo === 'video' ? '🎥' : '🖼️'} ${escHtml(e.descripcion || 'Sin descripción')} — ${formatearFecha(e.creado_en)}</span>
            <div style="display:flex;gap:6px;">
              <button class="btn-mini" data-on-click="verEvidencia('${e.id}')">Ver</button>
              ${esGestor ? `<button class="btn-mini" data-on-click="eliminarEvidencia('${e.id}')">Eliminar</button>` : ''}
            </div>
          </div>`).join('');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar el caso.');
  }
}

async function cambiarEstadoCaso() {
  ocultarError('error-detalle');
  ocultarExito('exito-detalle');
  const estado = document.getElementById('d-estado').value;
  try {
    await sissoFetch(`/accidentes/${casoActualId}`, { method: 'PUT', body: { estado } });
    mostrarExito('exito-detalle', 'Estado actualizado.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cambiar el estado.');
  }
}

async function guardarInvestigacion() {
  ocultarError('error-investigacion');
  const metodo = document.getElementById('i-metodo').value.trim();
  const causasInmediatas = document.getElementById('i-causas-inmediatas').value.trim();
  const causasBasicas = document.getElementById('i-causas-basicas').value.trim();
  const factores = document.getElementById('i-factores').value.trim();
  const fecha = document.getElementById('i-fecha').value;

  if (!causasInmediatas || !causasBasicas || !fecha) {
    mostrarError('error-investigacion', 'Causas inmediatas, causas básicas y fecha son obligatorias.');
    return;
  }

  try {
    await sissoFetch(`/accidentes/${casoActualId}/investigacion`, {
      method: 'POST',
      body: { metodoInvestigacion: metodo || undefined, causasInmediatas, causasBasicas, factoresContribuyentes: factores || undefined, fechaInvestigacion: fecha },
    });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-investigacion', err.message || 'Error al guardar la investigación.');
  }
}

async function crearAccion() {
  ocultarError('error-accion');
  const descripcion = document.getElementById('a-descripcion').value.trim();
  const responsableId = document.getElementById('a-responsable').value;
  const fechaLimite = document.getElementById('a-fecha-limite').value;

  if (descripcion.length < 5) { mostrarError('error-accion', 'La descripción debe tener al menos 5 caracteres.'); return; }
  if (!responsableId) { mostrarError('error-accion', 'Selecciona un responsable.'); return; }
  if (!fechaLimite) { mostrarError('error-accion', 'Indica la fecha límite.'); return; }

  try {
    await sissoFetch(`/accidentes/${casoActualId}/acciones`, {
      method: 'POST', body: { descripcion, responsableId, fechaLimite },
    });
    document.getElementById('a-descripcion').value = '';
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-accion', err.message || 'Error al crear la acción.');
  }
}

async function completarAccion(accionId) {
  try {
    await sissoFetch(`/accidentes/acciones/${accionId}/completar`, { method: 'PUT' });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al completar la acción.');
  }
}

async function verificarAccion(accionId) {
  const nota = prompt('Nota de verificación (opcional):') || '';
  try {
    await sissoFetch(`/accidentes/acciones/${accionId}/verificar`, { method: 'PUT', body: { notaVerificacion: nota || undefined } });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al verificar la acción.');
  }
}

// ======= Evidencia =======
document.addEventListener('change', (evento) => {
  if (evento.target.id !== 'e-archivo') return;
  const archivo = evento.target.files[0];
  archivoEvidenciaPendiente = null;
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = (e) => { archivoEvidenciaPendiente = e.target.result; };
  lector.readAsDataURL(archivo);
});

async function subirEvidencia() {
  ocultarError('error-evidencia');
  if (!archivoEvidenciaPendiente) { mostrarError('error-evidencia', 'Selecciona un archivo primero.'); return; }
  const descripcion = document.getElementById('e-descripcion').value.trim();

  try {
    await sissoFetch(`/accidentes/${casoActualId}/evidencias`, {
      method: 'POST', body: { archivoBase64: archivoEvidenciaPendiente, descripcion: descripcion || undefined },
    });
    document.getElementById('e-archivo').value = '';
    document.getElementById('e-descripcion').value = '';
    archivoEvidenciaPendiente = null;
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-evidencia', err.message || 'Error al subir la evidencia.');
  }
}

async function verEvidencia(evidenciaId) {
  try {
    const datos = await sissoFetch(`/accidentes/evidencias/${evidenciaId}/url`);
    window.open(datos.url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al abrir la evidencia.');
  }
}

async function eliminarEvidencia(evidenciaId) {
  if (!confirm('¿Eliminar esta evidencia? Esta acción no se puede deshacer.')) return;
  try {
    await sissoFetch(`/accidentes/evidencias/${evidenciaId}`, { method: 'DELETE' });
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al eliminar la evidencia.');
  }
}

// ======= Utilidades =======
function chipDeTipo(tipo) {
  const mapa = { accidente: ['rojo', 'Accidente'], incidente: ['ambar', 'Incidente'], casi_accidente: ['teal', 'Casi accidente'] };
  const [clase, label] = mapa[tipo] || ['gris', tipo];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function chipDeGravedad(gravedad) {
  if (gravedad === 'no_aplica') return '';
  const mapa = { leve: ['verde', 'Leve'], moderada: ['ambar', 'Moderada'], grave: ['rojo', 'Grave'], mortal: ['rojo', 'Mortal'] };
  const [clase, label] = mapa[gravedad] || ['gris', gravedad];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function chipDeEstado(estado) {
  const mapa = {
    reportado: ['ambar', 'Reportado'], en_investigacion: ['teal', 'En investigación'],
    con_acciones: ['azul', 'Con acciones'], cerrado: ['verde', 'Cerrado'],
  };
  const [clase, label] = mapa[estado] || ['gris', estado];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function chipDeEstadoAccion(estado) {
  const mapa = {
    pendiente: ['gris', 'Pendiente'], en_progreso: ['ambar', 'En progreso'],
    completada: ['teal', 'Completada'], verificada: ['verde', 'Verificada'],
  };
  const [clase, label] = mapa[estado] || ['gris', estado];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
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
