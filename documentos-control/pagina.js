// ============================================================
// SISSO - Logica de reportes-peligro/index.html (Control Documental,
// Lote 2, Sep 2026). Gestion (crear/nueva version): admin, sso.
// Lectura y acuse: cualquier rol.
// ============================================================
let usuariosOrganizacion = [];
let documentoActualId = null;
let archivoNuevoBase64 = null;
let rolActual = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('documentos-control', 'Control documental');
  rolActual = SissoSesion.obtenerUsuario()?.rol;
  if (rolActual === 'admin' || rolActual === 'sso') {
    document.getElementById('btn-nuevo').style.display = 'inline-block';
    await cargarUsuarios();
  }
  await cargarListado();
});

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/usuarios');
    usuariosOrganizacion = datos.usuarios || [];
  } catch (err) { usuariosOrganizacion = []; }
}

async function cargarListado() {
  const cont = document.getElementById('lista-documentos');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  const categoria = document.getElementById('f-categoria').value;
  const parametros = new URLSearchParams();
  if (categoria) parametros.set('categoria', categoria);

  try {
    const datos = await sissoFetch(`/documentos-control?${parametros.toString()}`);
    const documentos = datos.documentos || [];
    if (documentos.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay documentos vigentes con este filtro.</div>';
      return;
    }
    cont.innerHTML = documentos.map(d => `
      <div class="dc-item" data-on-click="abrirDetalle('${d.id}')">
        <div class="dc-cabecera">
          <div><span class="sisso-chip azul">${etiquetaCategoria(d.categoria)}</span> <strong>${escHtml(d.numero_documento)}</strong> — ${escHtml(d.titulo)}</div>
          <span class="dc-meta">v${d.version}</span>
        </div>
        <div class="dc-meta">
          Propietario: ${escHtml(d.propietario_nombre || '—')}
          ${d.fecha_proxima_revision ? ' · Próxima revisión: ' + formatearFecha(d.fecha_proxima_revision) : ''}
          ${d.requiere_acuse ? ' · ' + d.total_acuses + ' acuse(s)' : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-error visible">${escHtml(err.message || 'Error al cargar los documentos.')}</div>`;
  }
}

async function abrirDetalle(id) {
  documentoActualId = id;
  document.getElementById('vista-listado').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  await cargarDetalle();
}
function volverAlListado() {
  document.getElementById('vista-detalle').style.display = 'none';
  document.getElementById('vista-listado').style.display = 'block';
  documentoActualId = null;
  cargarListado();
}

async function cargarDetalle() {
  ocultarError('error-detalle'); ocultarExito('exito-detalle');
  try {
    const datos = await sissoFetch(`/documentos-control/${documentoActualId}`);
    const d = datos.documento;

    document.getElementById('resumen-documento').innerHTML = `
      <div class="dc-cabecera">
        <div><span class="sisso-chip azul">${etiquetaCategoria(d.categoria)}</span> <strong>${escHtml(d.numero_documento)}</strong> — v${d.version}
        ${d.estado === 'obsoleto' ? '<span class="sisso-chip gris">Obsoleto</span>' : '<span class="sisso-chip verde">Vigente</span>'}</div>
      </div>
      <div style="margin-top:8px;font-size:14px;font-weight:600;">${escHtml(d.titulo)}</div>
      <div class="dc-meta" style="margin-top:6px;">
        Propietario: ${escHtml(d.propietario_nombre || '—')} · Aprobador: ${escHtml(d.aprobador_nombre || '—')}
        ${d.fecha_proxima_revision ? ' · Próxima revisión: ' + formatearFecha(d.fecha_proxima_revision) : ''}
      </div>`;

    let accionesHtml = `<button class="sisso-boton secundario" data-on-click="verPdf()">Ver PDF</button>`;
    if (d.requiere_acuse) {
      accionesHtml += datos.yaAcuso
        ? ' <span class="sisso-chip verde">Ya diste acuse de lectura</span>'
        : ' <button class="sisso-boton" data-on-click="darAcuse()">Confirmar que leí este documento</button>';
    }
    if ((rolActual === 'admin' || rolActual === 'sso') && d.estado === 'vigente') {
      accionesHtml += ` <button class="sisso-boton secundario" data-on-click="abrirModalNuevaVersion('${d.id}', '${escAttr(d.numero_documento)}')">Publicar nueva versión</button>`;
    }
    document.getElementById('acciones-documento').innerHTML = accionesHtml;

    document.getElementById('historial-documento').innerHTML = (datos.historial || []).map(h => `
      <div class="dc-meta">v${h.version} — ${h.estado === 'obsoleto' ? 'Obsoleto' : 'Vigente'} — ${formatearFecha(h.creado_en)}</div>
    `).join('');

    const cajaAcuses = document.getElementById('caja-acuses');
    if (d.requiere_acuse) {
      cajaAcuses.style.display = 'block';
      document.getElementById('lista-acuses').innerHTML = (datos.acuses || []).length === 0
        ? '<div class="sisso-vacio">Nadie ha confirmado la lectura todavía.</div>'
        : datos.acuses.map(a => `<div class="dc-meta">${escHtml(a.nombre_completo)} — ${formatearFecha(a.leido_en)}</div>`).join('');
    } else {
      cajaAcuses.style.display = 'none';
    }
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar el documento.');
  }
}

async function verPdf() {
  try {
    const datos = await sissoFetch(`/documentos-control/${documentoActualId}/url`);
    window.open(datos.url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al abrir el documento.');
  }
}

async function darAcuse() {
  try {
    await sissoFetch(`/documentos-control/${documentoActualId}/acuse`, { method: 'POST' });
    mostrarExito('exito-detalle', 'Acuse registrado.');
    await cargarDetalle();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al registrar el acuse.');
  }
}

// ======= Modal nuevo documento / nueva version =======
function abrirModalNuevo() {
  document.getElementById('titulo-modal-nuevo').textContent = 'Nuevo documento';
  document.getElementById('m-reemplaza-a').value = '';
  document.getElementById('m-numero').value = '';
  document.getElementById('m-numero').disabled = false;
  document.getElementById('m-titulo').value = '';
  document.getElementById('m-proxima-revision').value = '';
  document.getElementById('m-archivo').value = '';
  archivoNuevoBase64 = null;
  ocultarError('error-modal-nuevo');
  llenarSelectsUsuarios();
  document.getElementById('modal-nuevo').classList.add('visible');
}
function abrirModalNuevaVersion(id, numeroDocumento) {
  abrirModalNuevo();
  document.getElementById('titulo-modal-nuevo').textContent = `Nueva versión de ${numeroDocumento}`;
  document.getElementById('m-reemplaza-a').value = id;
  document.getElementById('m-numero').value = numeroDocumento;
  document.getElementById('m-numero').disabled = true;
}
function llenarSelectsUsuarios() {
  const opciones = '<option value="">Selecciona…</option>' +
    usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)}</option>`).join('');
  document.getElementById('m-propietario').innerHTML = opciones;
  document.getElementById('m-aprobador').innerHTML = '<option value="">— Ninguno —</option>' +
    usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)}</option>`).join('');
}

document.addEventListener('change', (evento) => {
  if (evento.target.id === 'm-archivo') {
    const archivo = evento.target.files[0];
    archivoNuevoBase64 = null;
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (e) => { archivoNuevoBase64 = e.target.result; };
    lector.readAsDataURL(archivo);
  }
});

async function confirmarNuevoDocumento() {
  ocultarError('error-modal-nuevo');
  const numeroDocumento = document.getElementById('m-numero').value.trim();
  const titulo = document.getElementById('m-titulo').value.trim();
  const categoria = document.getElementById('m-categoria').value;
  const propietarioId = document.getElementById('m-propietario').value;
  const aprobadorId = document.getElementById('m-aprobador').value;
  const fechaProximaRevision = document.getElementById('m-proxima-revision').value;
  const requiereAcuse = document.getElementById('m-requiere-acuse').checked;
  const reemplazaA = document.getElementById('m-reemplaza-a').value;

  if (!reemplazaA && !numeroDocumento) { mostrarError('error-modal-nuevo', 'Ingresa el código del documento.'); return; }
  if (!titulo) { mostrarError('error-modal-nuevo', 'Ingresa el título.'); return; }
  if (!propietarioId) { mostrarError('error-modal-nuevo', 'Selecciona un propietario.'); return; }
  if (!archivoNuevoBase64) { mostrarError('error-modal-nuevo', 'Adjunta el archivo PDF.'); return; }

  try {
    await sissoFetch('/documentos-control', {
      method: 'POST',
      body: {
        numeroDocumento: reemplazaA ? undefined : numeroDocumento,
        titulo, categoria, propietarioId, aprobadorId: aprobadorId || undefined,
        fechaProximaRevision: fechaProximaRevision || undefined, requiereAcuse,
        archivoBase64: archivoNuevoBase64, reemplazaA: reemplazaA || undefined,
      },
    });
    cerrarModales();
    if (documentoActualId) { await cargarDetalle(); } else { await cargarListado(); }
  } catch (err) {
    mostrarError('error-modal-nuevo', err.message || 'Error al guardar el documento.');
  }
}

function cerrarModales() { document.getElementById('modal-nuevo').classList.remove('visible'); }

// ======= Utilidades =======
function etiquetaCategoria(c) {
  const mapa = { politica: 'Política', procedimiento: 'Procedimiento', instructivo: 'Instructivo', formato: 'Formato', otro: 'Otro' };
  return mapa[c] || c;
}
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
const escHtml = escaparHtml;
const escAttr = escaparAtributoHtml;
function mostrarError(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 5000); }
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
