// ============================================================
// SISSO - Panel de Normativas.
//
// CREADO a pedido de la persona usuaria (Sep 2026): boton/pantalla
// unica con TODAS las normativas sobre las que se sustenta SISSO,
// para que cualquier usuario pueda escogerlas y leerlas en PDF.
// Motivada directamente por la integracion del Acuerdo Ministerial
// MSP 00004-2026 (SISAT) -- ver migration_096_normativas_sisso.sql.
//
// Contrato usado:
//   GET  /normativas?pais=ecuador   -> { normativas: [...] }
//   POST /normativas                (solo superadmin)
//   PUT  /normativas/:id            (solo superadmin)
//   GET  /catalogo-paises           (para poblar el filtro de pais)
// ============================================================
const escHtml = escaparHtml;
let normativas = [];
let esSuperadmin = false;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('normativas', 'Normativas');
  const usuario = SissoSesion.obtenerUsuario();
  if (!usuario) return;
  esSuperadmin = usuario.rol === 'superadmin';
  if (esSuperadmin) document.getElementById('btn-nueva-normativa').style.display = '';

  await cargarPaises();
  await cargarNormativas();
});

async function cargarPaises() {
  try {
    const datos = await sissoFetch('/catalogo-paises');
    const select = document.getElementById('f-pais');
    (datos.paises || []).forEach((p) => {
      const opcion = document.createElement('option');
      opcion.value = p.clave;
      opcion.textContent = `${p.bandera_emoji || ''} ${p.nombre}`.trim();
      select.appendChild(opcion);
    });
    // Ecuador es hoy el unico perfil normativo completo -- lo dejamos
    // preseleccionado para no abrumar con paises sin contenido aun.
    select.value = 'ecuador';
  } catch {
    // Si el catalogo de paises falla, el filtro simplemente queda en "Todos".
  }
}

async function cargarNormativas() {
  const contenedor = document.getElementById('lista-normativas');
  contenedor.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  try {
    const pais = document.getElementById('f-pais').value;
    const query = pais ? `?pais=${encodeURIComponent(pais)}` : '';
    const datos = await sissoFetch(`/normativas${query}`);
    normativas = Array.isArray(datos.normativas) ? datos.normativas : [];
    renderizarNormativas();
  } catch (err) {
    contenedor.innerHTML = `<div class="sisso-error">No se pudo cargar el listado: ${escHtml(err.message || 'error desconocido')}</div>`;
  }
}

function renderizarNormativas() {
  const contenedor = document.getElementById('lista-normativas');
  const filtroEstado = document.getElementById('f-estado').value;
  const lista = normativas.filter((n) => !filtroEstado || n.estado === filtroEstado);

  if (lista.length === 0) {
    contenedor.innerHTML = '<p style="color:var(--t3);font-size:13px;">No hay normativas para este filtro.</p>';
    return;
  }

  contenedor.innerHTML = lista.map((n) => {
    const claseTag = n.estado === 'derogada' ? 'derogada' : (n.estado === 'vigente' ? 'vigente' : '');
    const etiquetaEstado = n.estado === 'derogada' ? 'Derogada' : (n.estado === 'vigente' ? 'Vigente' : 'Pendiente confirmar vigencia');
    const fechas = [
      n.fecha_expedicion ? `Expedida: ${n.fecha_expedicion}` : null,
      n.fecha_publicacion_ro ? `R.O.: ${n.fecha_publicacion_ro}` : null,
    ].filter(Boolean).join(' · ');

    return `
      <div class="nv-item">
        <div class="nv-cabecera">
          <div>
            <span class="nv-tag ${claseTag}">${escHtml(etiquetaEstado)}</span>
            <span class="nv-tag">${escHtml(n.tipo || '')}</span>
            <div class="nv-titulo">${escHtml(n.numero_acto ? n.numero_acto + ' — ' : '')}${escHtml(n.titulo)}</div>
            <div class="nv-meta">${escHtml(n.entidad_emisora || '')}${fechas ? ' · ' + escHtml(fechas) : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${n.url_pdf
              ? `<a class="sisso-boton pequeno" href="${escaparAtributoHtml(n.url_pdf)}" target="_blank" rel="noopener noreferrer">Ver PDF</a>`
              : `<span class="sisso-boton pequeno secundario" style="cursor:default;" title="El enlace al PDF aún no fue cargado">PDF no disponible</span>`}
            ${esSuperadmin ? `<button class="sisso-boton pequeno secundario" data-on-click="abrirModalNormativa('${n.id}')">Editar</button>` : ''}
          </div>
        </div>
        ${n.resumen ? `<div class="nv-resumen">${escHtml(n.resumen)}</div>` : ''}
        ${n.ambito_sisso ? `<div class="nv-ambito"><strong>En SISSO:</strong> ${escHtml(n.ambito_sisso)}</div>` : ''}
        ${n.deroga_a ? `<div class="nv-ambito">Deroga: ${escHtml(n.deroga_a)}</div>` : ''}
        ${n.derogada_por ? `<div class="nv-ambito">Derogada por: ${escHtml(n.derogada_por)}</div>` : ''}
        <div class="nv-meta" style="margin-top:8px;">Fuente de esta ficha: ${escHtml(n.fuente_cita || '—')}</div>
      </div>`;
  }).join('');
}

// ------------------------------------------------------------
// Alta / edición (solo superadmin)
// ------------------------------------------------------------
function abrirModalNormativa(id) {
  document.getElementById('error-modal-normativa').textContent = '';
  const normativa = id ? normativas.find((n) => n.id === id) : null;

  document.getElementById('titulo-modal-normativa').textContent = normativa ? 'Editar normativa' : 'Nueva normativa';
  document.getElementById('m-id').value = normativa ? normativa.id : '';
  document.getElementById('m-tipo').value = normativa ? normativa.tipo : 'reglamento';
  document.getElementById('m-numero').value = normativa ? (normativa.numero_acto || '') : '';
  document.getElementById('m-titulo').value = normativa ? normativa.titulo : '';
  document.getElementById('m-entidad').value = normativa ? (normativa.entidad_emisora || '') : '';
  document.getElementById('m-fecha-expedicion').value = normativa ? (normativa.fecha_expedicion || '') : '';
  document.getElementById('m-fecha-ro').value = normativa ? (normativa.fecha_publicacion_ro || '') : '';
  document.getElementById('m-estado').value = normativa ? normativa.estado : 'vigente';
  document.getElementById('m-resumen').value = normativa ? (normativa.resumen || '') : '';
  document.getElementById('m-ambito').value = normativa ? (normativa.ambito_sisso || '') : '';
  document.getElementById('m-url-pdf').value = normativa ? (normativa.url_pdf || '') : '';
  document.getElementById('m-fuente-cita').value = normativa ? (normativa.fuente_cita || '') : '';

  document.getElementById('modal-normativa').classList.add('visible');
}

function cerrarModales() {
  document.getElementById('modal-normativa').classList.remove('visible');
}

async function confirmarNormativa() {
  const errorEl = document.getElementById('error-modal-normativa');
  errorEl.textContent = '';

  const id = document.getElementById('m-id').value;
  const cuerpo = {
    tipo: document.getElementById('m-tipo').value,
    numero_acto: document.getElementById('m-numero').value.trim() || null,
    titulo: document.getElementById('m-titulo').value.trim(),
    entidad_emisora: document.getElementById('m-entidad').value.trim() || null,
    fecha_expedicion: document.getElementById('m-fecha-expedicion').value || null,
    fecha_publicacion_ro: document.getElementById('m-fecha-ro').value || null,
    estado: document.getElementById('m-estado').value,
    resumen: document.getElementById('m-resumen').value.trim() || null,
    ambito_sisso: document.getElementById('m-ambito').value.trim() || null,
    url_pdf: document.getElementById('m-url-pdf').value.trim() || null,
    fuente_cita: document.getElementById('m-fuente-cita').value.trim(),
  };

  if (!cuerpo.titulo) { errorEl.textContent = 'El título es obligatorio.'; return; }
  if (!cuerpo.fuente_cita) { errorEl.textContent = 'Indique de dónde se tomó esta ficha (fuente_cita).'; return; }

  try {
    if (id) {
      await sissoFetch(`/normativas/${id}`, { method: 'PUT', body: cuerpo });
    } else {
      await sissoFetch('/normativas', { method: 'POST', body: cuerpo });
    }
    cerrarModales();
    await cargarNormativas();
  } catch (err) {
    errorEl.textContent = err.message || 'Error al guardar la normativa.';
  }
}
