// ============================================================
// SISSO - Logica de competencias/index.html (Lote 3, Sep 2026).
// Gestion completa: admin, sso.
// ============================================================
let catalogoCompetencias = [];
let trabajadoresPropios = [];
let contratistasCache = [];
let certificadoArchivoBase64 = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('competencias', 'Competencias');
  await Promise.all([cargarCatalogo(), cargarTrabajadoresPropios(), cargarContratistas()]);
});

document.addEventListener('change', (evento) => {
  if (evento.target.id === 'a-archivo') {
    const archivo = evento.target.files[0];
    certificadoArchivoBase64 = null;
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (e) => { certificadoArchivoBase64 = e.target.result; };
    lector.readAsDataURL(archivo);
  }
});

function cambiarPestana(cual) {
  document.getElementById('tab-catalogo').classList.toggle('activa', cual === 'catalogo');
  document.getElementById('tab-asignar').classList.toggle('activa', cual === 'asignar');
  document.getElementById('vista-catalogo').style.display = cual === 'catalogo' ? '' : 'none';
  document.getElementById('vista-asignar').style.display = cual === 'asignar' ? '' : 'none';
  if (cual === 'asignar') onCambioTipoPersonaConsulta();
}

// ======= Catalogo =======
async function cargarCatalogo() {
  const cont = document.getElementById('lista-catalogo');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  try {
    const datos = await sissoFetch('/competencias/catalogo');
    catalogoCompetencias = datos.competencias || [];
    if (catalogoCompetencias.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Aún no hay competencias en el catálogo.</div>';
      return;
    }
    cont.innerHTML = catalogoCompetencias.map(c => `
      <div class="cp-fila">
        <span><strong>${escaparHtml(c.nombre)}</strong>${c.descripcion ? ' — ' + escaparHtml(c.descripcion) : ''}</span>
        <span style="color:var(--t3);">${c.vigencia_meses ? c.vigencia_meses + ' meses' : 'No vence'}</span>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escaparHtml(err.message || 'Error al cargar el catálogo.')}</div>`;
  }
}

function abrirModalNuevaCompetencia() {
  ocultarError('error-modal-nueva-competencia');
  ['nc-nombre', 'nc-descripcion', 'nc-vigencia'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-nueva-competencia').classList.add('visible');
}
async function confirmarNuevaCompetencia() {
  ocultarError('error-modal-nueva-competencia');
  const nombre = document.getElementById('nc-nombre').value.trim();
  if (!nombre) { mostrarError('error-modal-nueva-competencia', 'Ingresa el nombre.'); return; }
  const vigencia = document.getElementById('nc-vigencia').value;

  try {
    await sissoFetch('/competencias/catalogo', {
      method: 'POST',
      body: {
        nombre, descripcion: document.getElementById('nc-descripcion').value.trim() || undefined,
        vigenciaMeses: vigencia ? parseInt(vigencia, 10) : undefined,
      },
    });
    cerrarModales();
    await cargarCatalogo();
  } catch (err) {
    mostrarError('error-modal-nueva-competencia', err.message || 'Error al guardar la competencia.');
  }
}

// ======= Datos auxiliares =======
async function cargarTrabajadoresPropios() {
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadoresPropios = datos.trabajadores || [];
  } catch { trabajadoresPropios = []; }
}
async function cargarContratistas() {
  try {
    const datos = await sissoFetch('/contratistas');
    contratistasCache = datos.contratistas || [];
    const opciones = '<option value="">Selecciona…</option>' +
      contratistasCache.map(c => `<option value="${c.id}">${escaparHtml(c.razon_social)}</option>`).join('');
    document.getElementById('c-contratista').innerHTML = opciones;
    document.getElementById('a-contratista').innerHTML = opciones;
  } catch { contratistasCache = []; }
}
async function trabajadoresDeContratista(contratistaId) {
  if (!contratistaId) return [];
  try {
    const datos = await sissoFetch(`/contratistas/${contratistaId}`);
    return datos.trabajadores || [];
  } catch { return []; }
}

// ======= Pestana Consultar =======
function onCambioTipoPersonaConsulta() {
  const esContratista = document.getElementById('c-tipo-persona').value === 'contratista';
  document.getElementById('grupo-consulta-contratista').style.display = esContratista ? '' : 'none';
  if (esContratista) {
    document.getElementById('c-persona').innerHTML = '<option value="">Selecciona un contratista primero…</option>';
  } else {
    document.getElementById('c-persona').innerHTML = '<option value="">Selecciona…</option>' +
      trabajadoresPropios.map(t => `<option value="${t.id}">${escaparHtml(t.nombre_completo)}</option>`).join('');
  }
  document.getElementById('lista-asignadas').innerHTML = '';
}
async function onCambioContratistaConsulta() {
  const trabajadores = await trabajadoresDeContratista(document.getElementById('c-contratista').value);
  document.getElementById('c-persona').innerHTML = '<option value="">Selecciona…</option>' +
    trabajadores.map(t => `<option value="${t.id}">${escaparHtml(t.nombre_completo)}</option>`).join('');
}
async function cargarAsignadas() {
  const personaId = document.getElementById('c-persona').value;
  const cont = document.getElementById('lista-asignadas');
  if (!personaId) { cont.innerHTML = ''; return; }
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  const esContratista = document.getElementById('c-tipo-persona').value === 'contratista';
  const parametro = esContratista ? `contratistaTrabajadorId=${personaId}` : `trabajadorId=${personaId}`;

  try {
    const datos = await sissoFetch(`/competencias/asignadas?${parametro}`);
    const asignaciones = datos.asignaciones || [];
    cont.innerHTML = asignaciones.length === 0
      ? '<div class="sisso-vacio">Sin competencias asignadas.</div>'
      : asignaciones.map(a => `
        <div class="cp-fila">
          <span>${escaparHtml(a.competencia_nombre)} · obtenida ${formatearFecha(a.fecha_obtencion)}</span>
          <span>${a.fecha_vencimiento ? (a.vencida ? '<span class="sisso-chip rojo">Vencida ' : '<span class="sisso-chip gris">Vence ') + formatearFecha(a.fecha_vencimiento) + '</span>' : '<span class="sisso-chip gris">No vence</span>'}</span>
        </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escaparHtml(err.message || 'Error al cargar las competencias asignadas.')}</div>`;
  }
}

// ======= Modal Asignar =======
function abrirModalAsignar() {
  ocultarError('error-modal-asignar');
  certificadoArchivoBase64 = null;
  document.getElementById('a-archivo').value = '';
  document.getElementById('a-fecha').value = '';
  document.getElementById('a-tipo-persona').value = 'propio';
  document.getElementById('a-competencia').innerHTML = '<option value="">Selecciona…</option>' +
    catalogoCompetencias.map(c => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`).join('');
  onCambioTipoPersonaAsignar();
  document.getElementById('modal-asignar').classList.add('visible');
}
function onCambioTipoPersonaAsignar() {
  const esContratista = document.getElementById('a-tipo-persona').value === 'contratista';
  document.getElementById('grupo-asignar-contratista').style.display = esContratista ? '' : 'none';
  if (esContratista) {
    document.getElementById('a-persona').innerHTML = '<option value="">Selecciona un contratista primero…</option>';
  } else {
    document.getElementById('a-persona').innerHTML = '<option value="">Selecciona…</option>' +
      trabajadoresPropios.map(t => `<option value="${t.id}">${escaparHtml(t.nombre_completo)}</option>`).join('');
  }
}
async function onCambioContratistaAsignar() {
  const trabajadores = await trabajadoresDeContratista(document.getElementById('a-contratista').value);
  document.getElementById('a-persona').innerHTML = '<option value="">Selecciona…</option>' +
    trabajadores.map(t => `<option value="${t.id}">${escaparHtml(t.nombre_completo)}</option>`).join('');
}
async function confirmarAsignar() {
  ocultarError('error-modal-asignar');
  const esContratista = document.getElementById('a-tipo-persona').value === 'contratista';
  const personaId = document.getElementById('a-persona').value;
  const competenciaId = document.getElementById('a-competencia').value;
  const fechaObtencion = document.getElementById('a-fecha').value;

  if (!personaId) { mostrarError('error-modal-asignar', 'Selecciona la persona.'); return; }
  if (!competenciaId) { mostrarError('error-modal-asignar', 'Selecciona la competencia.'); return; }
  if (!fechaObtencion) { mostrarError('error-modal-asignar', 'Indica la fecha de obtención.'); return; }

  try {
    await sissoFetch('/competencias/asignar', {
      method: 'POST',
      body: {
        competenciaId, fechaObtencion,
        trabajadorId: esContratista ? undefined : personaId,
        contratistaTrabajadorId: esContratista ? personaId : undefined,
        archivoBase64: certificadoArchivoBase64 || undefined,
      },
    });
    cerrarModales();
    if (document.getElementById('c-persona').value === personaId) await cargarAsignadas();
  } catch (err) {
    mostrarError('error-modal-asignar', err.message || 'Error al asignar la competencia.');
  }
}

function cerrarModales() {
  ['modal-nueva-competencia', 'modal-asignar'].forEach(id => document.getElementById(id).classList.remove('visible'));
}

// ======= Utilidades =======
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
function mostrarError(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
