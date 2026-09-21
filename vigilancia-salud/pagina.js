// ============================================================
// SISSO - Logica de la pagina (vigilancia-salud/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let esMedico = false;
let programaActualId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('vigilancia-salud', 'Vigilancia de la Salud');

  const usuario = SissoSesion.obtenerUsuario();
  esMedico = usuario.rol === 'medico';

  document.getElementById('aviso-rol').innerHTML = esMedico
    ? ''
    : `<div class="aviso-agregado">🔒 Como rol SSO ves únicamente cifras agregadas por periodo (total evaluados,
       total con hallazgo, tendencia). Nunca resultados individuales de trabajadores; el detalle clínico
       permanece con el Médico Ocupacional (corrección del punto 3.2 de la Auditoría SISSO N.º 06).</div>`;

  if (esMedico) document.getElementById('caja-crear-programa').style.display = 'block';

  await cargarProgramas();
});

async function crearPrograma() {
  ocultarError('error-nuevo-programa');
  ocultarExito('exito-nuevo-programa');

  const nombre = document.getElementById('np-nombre').value.trim();
  const tipoRiesgo = document.getElementById('np-tipo-riesgo').value;
  const tipoExamen = document.getElementById('np-tipo-examen').value;
  const descripcion = document.getElementById('np-descripcion').value.trim();

  if (nombre.length < 3) { mostrarError('error-nuevo-programa', 'El nombre debe tener al menos 3 caracteres.'); return; }

  const boton = document.getElementById('btn-crear-programa');
  boton.disabled = true;
  boton.textContent = 'Creando…';

  try {
    await sissoFetch('/vigilancia-salud/programas', {
      method: 'POST',
      body: { nombre, tipoRiesgo, tipoExamenAsociado: tipoExamen || undefined, descripcion: descripcion || undefined },
    });
    mostrarExito('exito-nuevo-programa', 'Programa creado.');
    document.getElementById('np-nombre').value = '';
    document.getElementById('np-descripcion').value = '';
    await cargarProgramas();
  } catch (err) {
    mostrarError('error-nuevo-programa', err.message || 'Error al crear el programa.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Crear programa';
  }
}

async function cargarProgramas() {
  const cont = document.getElementById('lista-programas');
  cont.innerHTML = '<div class="sisso-cargando">Cargando programas…</div>';
  try {
    const datos = await sissoFetch('/vigilancia-salud/programas');
    const programas = datos.programas || [];
    if (programas.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay programas de vigilancia registrados todavía.</div>';
      return;
    }
    cont.innerHTML = programas.map(p => `
      <div class="prog-item" data-on-click="abrirDetalleProgramaEl('${p.id}', '${escAtributo(p.nombre)}')">
        <div class="prog-cabecera">
          <strong>${escHtml(p.nombre)}</strong>
          ${chipDeEstado(p.estado)}
        </div>
        <div style="font-size:12px;color:var(--t2);margin-top:4px;">
          ${etiquetaTipoRiesgo(p.tipo_riesgo)}${p.nombre_puesto ? ' · ' + escHtml(p.nombre_puesto) : ' · Toda la organización'}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar los programas: ${escHtml(err.message)}</div>`;
  }
}

async function abrirDetalleProgramaEl(programaId, nombre) {
  programaActualId = programaId;
  document.getElementById('titulo-programa').textContent = nombre;
  document.getElementById('caja-nueva-observacion').style.display = esMedico ? 'block' : 'none';
  document.getElementById('caja-detalle-programa').style.display = 'block';
  document.getElementById('caja-detalle-programa').scrollIntoView({ behavior: 'smooth', block: 'start' });
  await cargarObservaciones();
}

function cerrarDetalleProgramaEl() {
  programaActualId = null;
  document.getElementById('caja-detalle-programa').style.display = 'none';
}

async function registrarObservacion() {
  ocultarError('error-nueva-obs');
  ocultarExito('exito-nueva-obs');

  const periodo = document.getElementById('no-periodo').value.trim();
  const fecha = document.getElementById('no-fecha').value;
  const evaluados = parseInt(document.getElementById('no-evaluados').value, 10);
  const hallazgo = parseInt(document.getElementById('no-hallazgo').value, 10);
  const tendencia = document.getElementById('no-tendencia').value;
  const nota = document.getElementById('no-nota').value.trim();

  if (!periodo || !fecha) { mostrarError('error-nueva-obs', 'Indica periodo y fecha de corte.'); return; }
  if (isNaN(evaluados) || isNaN(hallazgo) || evaluados < 0 || hallazgo < 0) {
    mostrarError('error-nueva-obs', 'Total evaluados y total con hallazgo son obligatorios.');
    return;
  }
  if (hallazgo > evaluados) { mostrarError('error-nueva-obs', 'Total con hallazgo no puede ser mayor que total evaluados.'); return; }

  try {
    await sissoFetch(`/vigilancia-salud/programas/${programaActualId}/observaciones`, {
      method: 'POST',
      body: { periodoEtiqueta: periodo, fechaCorte: fecha, totalEvaluados: evaluados, totalConHallazgo: hallazgo, tendencia, notaPreventiva: nota || undefined },
    });
    mostrarExito('exito-nueva-obs', 'Observación registrada.');
    document.getElementById('no-periodo').value = '';
    document.getElementById('no-nota').value = '';
    await cargarObservaciones();
  } catch (err) {
    mostrarError('error-nueva-obs', err.message || 'Error al registrar la observación.');
  }
}

async function cargarObservaciones() {
  const cont = document.getElementById('lista-observaciones');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  try {
    const datos = await sissoFetch(`/vigilancia-salud/programas/${programaActualId}/observaciones`);
    const observaciones = datos.observaciones || [];
    if (observaciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Sin observaciones registradas todavía.</div>';
      return;
    }
    cont.innerHTML = observaciones.map(o => `
      <div class="obs-item">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:12.5px;">${escHtml(o.periodo_etiqueta)}</strong>
          ${chipDeTendencia(o.tendencia)}
        </div>
        <div class="obs-cifras">
          <span>Evaluados: <strong>${o.total_evaluados}</strong></span>
          <span>Con hallazgo: <strong>${o.total_con_hallazgo}</strong></span>
          <span>${formatearFecha(o.fecha_corte)}</span>
        </div>
        ${o.nota_preventiva ? `<div style="font-size:12px;color:var(--t2);margin-top:4px;">${escHtml(o.nota_preventiva)}</div>` : ''}
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar las observaciones: ${escHtml(err.message)}</div>`;
  }
}

// ======= Utilidades =======
function etiquetaTipoRiesgo(tipo) {
  const mapa = { ruido: 'Ruido', quimico: 'Químico', ergonomico: 'Ergonómico', biologico: 'Biológico', psicosocial: 'Psicosocial', otro: 'Otro' };
  return mapa[tipo] || tipo;
}
function chipDeEstado(estado) {
  const mapa = { activo: ['verde', 'Activo'], en_pausa: ['ambar', 'En pausa'], cerrado: ['gris', 'Cerrado'] };
  const [clase, label] = mapa[estado] || ['gris', estado];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function chipDeTendencia(tendencia) {
  const mapa = { mejora: ['verde', 'Mejora'], estable: ['teal', 'Estable'], empeora: ['rojo', 'Empeora'] };
  const [clase, label] = mapa[tendencia] || ['gris', tendencia];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

const escHtml = escaparHtml;
function escAtributo(texto) {
  return escaparHtml(texto).replace(/'/g, "&#39;");
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
  setTimeout(() => el.classList.remove('visible'), 5000);
}
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
