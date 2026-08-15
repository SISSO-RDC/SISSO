// ============================================================
// SISSO - Ausentismo laboral
// ============================================================

let catalogoTipos = [];
let trabajadoresCache = [];
let itemEditandoId = null;
let certificadoBase64Pendiente = null; // solo se llena si el usuario sube un archivo nuevo en el modal
let filaImportacionActual = [];
let paginaActual = 1;
const POR_PAGINA = 25;

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('ausentismo', 'Ausentismo');
  await Promise.all([cargarCatalogos(), cargarTrabajadores()]);
  await cargarResumen();
  await cargarLista();
});

// ------------------------------------------------------------
// Catalogos y datos de apoyo
// ------------------------------------------------------------
async function cargarCatalogos() {
  try {
    const datos = await sissoFetch('/ausentismo/catalogos');
    catalogoTipos = datos.catalogos.TIPOS_AUSENCIA || [];

    const opciones = catalogoTipos.map(t => `<option value="${t.codigo}">${t.etiqueta}</option>`).join('');
    document.getElementById('m-tipo').innerHTML = opciones;
    document.getElementById('f-tipo').innerHTML = '<option value="">Todos</option>' + opciones;
  } catch (err) {
    mostrarError('error-lista', 'Error al cargar catálogos: ' + err.message);
  }
}

async function cargarTrabajadores() {
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadoresCache = datos.trabajadores || [];
    document.getElementById('m-trabajador').innerHTML =
      '<option value="">Selecciona un trabajador…</option>' +
      trabajadoresCache.map(t => `<option value="${t.id}">${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}</option>`).join('');
  } catch (err) {
    mostrarError('error-lista', 'Error al cargar trabajadores: ' + err.message);
  }
}

function etiquetaTipo(codigo) {
  const t = catalogoTipos.find(x => x.codigo === codigo);
  return t ? t.etiqueta : codigo;
}

function sincronizarSubsidioIess() {
  const tipo = document.getElementById('m-tipo').value;
  const t = catalogoTipos.find(x => x.codigo === tipo);
  document.getElementById('m-subsidiado').checked = t ? !!t.subsidiablePorDefecto : false;
}

// ------------------------------------------------------------
// KPIs (resumen)
// ------------------------------------------------------------
async function cargarResumen() {
  try {
    const d = await sissoFetch('/ausentismo/resumen');

    document.getElementById('kpi-grid').innerHTML = `
      <div class="kpi-tarjeta"><div class="kpi-numero">${d.totalAusencias}</div><div class="kpi-etiqueta">Ausencias (últimos 12 meses)</div></div>
      <div class="kpi-tarjeta"><div class="kpi-numero">${d.totalDias}</div><div class="kpi-etiqueta">Días perdidos totales</div></div>
      <div class="kpi-tarjeta"><div class="kpi-numero">${d.diasPromedioPorTrabajador}</div><div class="kpi-etiqueta">Días promedio por trabajador activo</div></div>
      <div class="kpi-tarjeta"><div class="kpi-numero">${d.topTrabajadores.length}</div><div class="kpi-etiqueta">Trabajadores con ausencias registradas</div></div>`;

    document.getElementById('chips-tipo').innerHTML = d.porTipo.length
      ? d.porTipo.map(t => `<div class="chip-tipo"><b>${t.dias}</b> días — ${etiquetaTipo(t.tipo)} (${t.ausencias})</div>`).join('')
      : '<div style="font-size:12px;color:var(--t3);">Sin ausencias registradas en los últimos 12 meses.</div>';
  } catch (err) {
    mostrarError('error-lista', 'Error al calcular el resumen: ' + err.message);
  }
}

// ------------------------------------------------------------
// Listado con filtros y paginacion
// ------------------------------------------------------------
function construirQuery(pagina) {
  const params = new URLSearchParams();
  const tipo = document.getElementById('f-tipo').value;
  const desde = document.getElementById('f-desde').value;
  const hasta = document.getElementById('f-hasta').value;
  if (tipo) params.set('tipo', tipo);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  params.set('pagina', pagina);
  params.set('porPagina', POR_PAGINA);
  return params.toString();
}

function aplicarFiltros() {
  paginaActual = 1;
  cargarLista();
}

async function cargarLista() {
  const tbody = document.getElementById('tabla-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="sisso-cargando">Cargando…</td></tr>';
  try {
    const datos = await sissoFetch(`/ausentismo?${construirQuery(paginaActual)}`);
    renderizarTabla(datos.ausencias || []);
    renderizarPaginacion(datos.paginacion);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderizarTabla(filas) {
  const tbody = document.getElementById('tabla-tbody');
  if (filas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="sisso-vacio">No hay ausencias registradas con estos filtros.</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(f => `
    <tr>
      <td style="font-weight:600;">${escHtml(f.nombre_completo)}<div style="font-size:11px;color:var(--t3);font-weight:400;">${escHtml(f.area || '—')}</div></td>
      <td><span class="tipo-chip">${etiquetaTipo(f.tipo)}</span>${f.subsidiado_iess ? '<span class="badge-iess">IESS</span>' : ''}</td>
      <td>${formatearFecha(f.fecha_inicio)}</td>
      <td>${formatearFecha(f.fecha_fin)}</td>
      <td style="text-align:center;font-weight:700;">${f.dias_calendario}</td>
      <td>${f.certificado_url ? `<a href="${f.certificado_url}" target="_blank" rel="noopener">Ver</a>` : '—'}</td>
      <td>
        <button class="btn-mini" onclick="abrirModal('${f.id}')">✎</button>
        <button class="btn-mini" onclick="eliminarItem('${f.id}')">🗑</button>
      </td>
    </tr>`).join('');
}

function renderizarPaginacion(p) {
  if (!p) { document.getElementById('paginacion').innerHTML = ''; return; }
  const totalPaginas = Math.max(Math.ceil(p.total / p.porPagina), 1);
  document.getElementById('paginacion').innerHTML = `
    <button ${p.pagina <= 1 ? 'disabled' : ''} onclick="irAPagina(${p.pagina - 1})">‹ Anterior</button>
    <span>Página ${p.pagina} de ${totalPaginas} — ${p.total} ausencia(s)</span>
    <button ${p.pagina >= totalPaginas ? 'disabled' : ''} onclick="irAPagina(${p.pagina + 1})">Siguiente ›</button>`;
}

function irAPagina(n) {
  paginaActual = n;
  cargarLista();
}

// ------------------------------------------------------------
// Modal crear/editar
// ------------------------------------------------------------
async function abrirModal(id) {
  itemEditandoId = id || null;
  certificadoBase64Pendiente = null;
  document.getElementById('error-modal').classList.remove('visible');
  document.getElementById('titulo-modal').textContent = id ? 'Editar ausencia' : 'Nueva ausencia';

  document.getElementById('m-trabajador').value = '';
  document.getElementById('m-trabajador').disabled = false;
  document.getElementById('m-tipo').selectedIndex = 0;
  document.getElementById('m-subsidiado').checked = false;
  document.getElementById('m-fecha-inicio').value = '';
  document.getElementById('m-fecha-fin').value = '';
  document.getElementById('m-cie10').value = '';
  document.getElementById('m-numero-certificado').value = '';
  document.getElementById('m-observaciones').value = '';
  document.getElementById('m-certificado-archivo').value = '';
  document.getElementById('m-certificado-actual').textContent = '';

  if (id) {
    try {
      const datos = await sissoFetch(`/ausentismo/${id}`);
      const a = datos.ausencia;
      document.getElementById('m-trabajador').value = a.trabajador_id;
      document.getElementById('m-trabajador').disabled = true; // no se cambia el trabajador de una ausencia existente
      document.getElementById('m-tipo').value = a.tipo;
      document.getElementById('m-subsidiado').checked = !!a.subsidiado_iess;
      document.getElementById('m-fecha-inicio').value = a.fecha_inicio ? a.fecha_inicio.split('T')[0] : '';
      document.getElementById('m-fecha-fin').value = a.fecha_fin ? a.fecha_fin.split('T')[0] : '';
      document.getElementById('m-cie10').value = a.diagnostico_cie10 || '';
      document.getElementById('m-numero-certificado').value = a.numero_certificado || '';
      document.getElementById('m-observaciones').value = a.observaciones || '';
      if (a.certificado_url) {
        document.getElementById('m-certificado-actual').innerHTML = `Certificado actual: <a href="${a.certificado_url}" target="_blank" rel="noopener">ver archivo</a> (sube uno nuevo para reemplazarlo)`;
      }
    } catch (err) {
      mostrarErrorModal(err.message);
    }
  }

  document.getElementById('modal-item').classList.add('visible');
}

function cerrarModal(idModal) {
  document.getElementById(idModal || 'modal-item').classList.remove('visible');
  if (!idModal) itemEditandoId = null;
}

function leerCertificado(input) {
  const archivo = input.files[0];
  if (!archivo) { certificadoBase64Pendiente = null; return; }
  const lector = new FileReader();
  lector.onload = (e) => { certificadoBase64Pendiente = e.target.result; };
  lector.onerror = () => { mostrarErrorModal('No se pudo leer el archivo del certificado.'); };
  lector.readAsDataURL(archivo);
}

async function guardarItem() {
  document.getElementById('error-modal').classList.remove('visible');

  const trabajadorId = document.getElementById('m-trabajador').value;
  const fechaInicio = document.getElementById('m-fecha-inicio').value;
  const fechaFin = document.getElementById('m-fecha-fin').value;

  if (!itemEditandoId && !trabajadorId) { mostrarErrorModal('Selecciona un trabajador.'); return; }
  if (!fechaInicio || !fechaFin) { mostrarErrorModal('Las fechas de inicio y fin son obligatorias.'); return; }
  if (fechaFin < fechaInicio) { mostrarErrorModal('La fecha de fin no puede ser anterior a la fecha de inicio.'); return; }

  const cuerpo = {
    trabajadorId: trabajadorId || undefined,
    tipo: document.getElementById('m-tipo').value,
    subsidiadoIess: document.getElementById('m-subsidiado').checked,
    fechaInicio,
    fechaFin,
    diagnosticoCie10: document.getElementById('m-cie10').value.trim() || undefined,
    numeroCertificado: document.getElementById('m-numero-certificado').value.trim() || undefined,
    observaciones: document.getElementById('m-observaciones').value.trim() || undefined,
  };
  if (certificadoBase64Pendiente) cuerpo.certificadoBase64 = certificadoBase64Pendiente;

  const boton = document.getElementById('btn-guardar-modal');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    if (itemEditandoId) {
      await sissoFetch(`/ausentismo/${itemEditandoId}`, { method: 'PUT', body: cuerpo });
    } else {
      await sissoFetch('/ausentismo', { method: 'POST', body: cuerpo });
    }
    cerrarModal();
    mostrarExito('exito-lista', 'Ausencia guardada correctamente.');
    await cargarResumen();
    await cargarLista();
  } catch (err) {
    mostrarErrorModal(err.message || 'Error al guardar.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

async function eliminarItem(id) {
  if (!confirm('¿Eliminar esta ausencia?')) return;
  try {
    await sissoFetch(`/ausentismo/${id}`, { method: 'DELETE' });
    mostrarExito('exito-lista', 'Ausencia eliminada.');
    await cargarResumen();
    await cargarLista();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// ------------------------------------------------------------
// Importacion masiva (Excel/CSV)
// ------------------------------------------------------------
function abrirModalImportar() {
  document.getElementById('archivo-excel').value = '';
  document.getElementById('preview-importar').style.display = 'none';
  document.getElementById('btn-confirmar-importar').disabled = true;
  filaImportacionActual = [];
  ocultarError('error-importar');
  ocultarExito('exito-importar');
  document.getElementById('modal-importar').classList.add('visible');
}

function formatearCeldaFecha(valor) {
  if (valor instanceof Date) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return (valor || '').toString().trim();
}

function previsualizarArchivo(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (filas.length === 0) {
        mostrarError('error-importar', 'El archivo no contiene filas de datos.');
        return;
      }

      filaImportacionActual = filas.map(f => ({
        documento: (f.documento || f.Documento || '').toString().trim(),
        tipo: (f.tipo || f.Tipo || '').toString().trim(),
        fechaInicio: formatearCeldaFecha(f.fechaInicio || f.FechaInicio || f['Fecha Inicio']),
        fechaFin: formatearCeldaFecha(f.fechaFin || f.FechaFin || f['Fecha Fin']),
        numeroCertificado: (f.numeroCertificado || f['N Certificado'] || '').toString().trim(),
        observaciones: (f.observaciones || f.Observaciones || '').toString().trim(),
      }));

      const preview = document.getElementById('preview-tabla');
      preview.innerHTML = '<thead><tr><th>Documento</th><th>Tipo</th><th>Desde</th><th>Hasta</th></tr></thead><tbody>' +
        filaImportacionActual.slice(0, 50).map(f => `<tr><td>${escHtml(f.documento)}</td><td>${escHtml(f.tipo)}</td><td>${escHtml(f.fechaInicio)}</td><td>${escHtml(f.fechaFin)}</td></tr>`).join('') +
        '</tbody>';
      document.getElementById('preview-resumen').textContent =
        `${filaImportacionActual.length} fila(s) detectada(s)` + (filaImportacionActual.length > 50 ? ' (mostrando las primeras 50)' : '') + '.';
      document.getElementById('preview-importar').style.display = 'block';
      document.getElementById('btn-confirmar-importar').disabled = false;
      ocultarError('error-importar');
    } catch (err) {
      mostrarError('error-importar', 'No se pudo leer el archivo. Asegúrate de que sea un Excel (.xlsx) o CSV válido.');
    }
  };
  lector.readAsBinaryString(archivo);
}

async function ejecutarImportacion() {
  ocultarError('error-importar');
  ocultarExito('exito-importar');

  const boton = document.getElementById('btn-confirmar-importar');
  boton.disabled = true;
  boton.textContent = 'Importando…';

  try {
    const resultado = await sissoFetch('/ausentismo/importar', {
      method: 'POST',
      body: { ausencias: filaImportacionActual },
    });
    const r = resultado.resumen;
    const msg = `Importación completa: ${r.creados} creada(s), ${r.fallidos} con error, de ${r.total} fila(s).`;
    mostrarExito('exito-importar', msg);

    if (r.fallidos > 0) {
      const errores = resultado.detalle.filter(d => d.estado === 'error').slice(0, 10)
        .map(d => `Fila ${d.fila} (${d.documento}): ${d.mensaje}`).join('\n');
      mostrarError('error-importar', 'Algunas filas no se pudieron importar:\n' + errores);
    }

    await cargarResumen();
    await cargarLista();
    setTimeout(() => { if (r.fallidos === 0) cerrarModal('modal-importar'); }, 2000);
  } catch (err) {
    mostrarError('error-importar', err.message || 'Error durante la importación.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Importar';
  }
}

// ------- Utilidades -------
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha.split('T')[0] + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function mostrarErrorModal(msg) { mostrarError('error-modal', msg); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 4000); }
function ocultarError(id) { document.getElementById(id).classList.remove('visible'); }
function ocultarExito(id) { document.getElementById(id).classList.remove('visible'); }
