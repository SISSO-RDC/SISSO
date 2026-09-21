// ============================================================
// SISSO - Logica de la pagina (epp/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let esGestor = false;
let trabajadores = [];
let catalogo = [];
let ctxFirma = null;
let dibujando = false;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('epp', 'EPP');

  const usuario = SissoSesion.obtenerUsuario();
  esGestor = ['admin', 'sso'].includes(usuario.rol);

  if (esGestor) {
    document.getElementById('caja-crear-entrega').style.display = 'block';
    document.getElementById('caja-crear-catalogo').style.display = 'block';
    await cargarTrabajadores();
    inicializarCanvasFirma();
  }

  await cargarCatalogoParaSelect();
  await cargarEntregas();
  await cargarCatalogoLista();
});

function cambiarTab(tab) {
  document.getElementById('tab-entregas').classList.toggle('activo', tab === 'entregas');
  document.getElementById('tab-catalogo').classList.toggle('activo', tab === 'catalogo');
  document.getElementById('vista-entregas').style.display = tab === 'entregas' ? 'block' : 'none';
  document.getElementById('vista-catalogo').style.display = tab === 'catalogo' ? 'block' : 'none';
}

// ======= Canvas de firma (simple) =======
function inicializarCanvasFirma() {
  const canvas = document.getElementById('lienzo-firma-epp');
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctxFirma = canvas.getContext('2d');
  ctxFirma.scale(ratio, ratio);
  ctxFirma.strokeStyle = '#1f2937';
  ctxFirma.lineWidth = 2;
  ctxFirma.lineCap = 'round';

  function posicion(evento) {
    const r = canvas.getBoundingClientRect();
    const punto = evento.touches ? evento.touches[0] : evento;
    return { x: punto.clientX - r.left, y: punto.clientY - r.top };
  }
  function iniciar(evento) {
    evento.preventDefault();
    dibujando = true;
    const p = posicion(evento);
    ctxFirma.beginPath();
    ctxFirma.moveTo(p.x, p.y);
  }
  function mover(evento) {
    if (!dibujando) return;
    evento.preventDefault();
    const p = posicion(evento);
    ctxFirma.lineTo(p.x, p.y);
    ctxFirma.stroke();
  }
  function terminar() { dibujando = false; }

  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', mover);
  canvas.addEventListener('mouseup', terminar);
  canvas.addEventListener('mouseleave', terminar);
  canvas.addEventListener('touchstart', iniciar, { passive: false });
  canvas.addEventListener('touchmove', mover, { passive: false });
  canvas.addEventListener('touchend', terminar);
}
function limpiarFirma() {
  const canvas = document.getElementById('lienzo-firma-epp');
  ctxFirma.clearRect(0, 0, canvas.width, canvas.height);
}

// ======= Trabajadores / catálogo para selects =======
async function cargarTrabajadores() {
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadores = datos.trabajadores || [];
    document.getElementById('e-trabajador').innerHTML = '<option value="">Selecciona…</option>' +
      trabajadores.map(t => `<option value="${t.id}">${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}</option>`).join('');
  } catch (err) {
    document.getElementById('e-trabajador').innerHTML = '<option value="">Error al cargar</option>';
  }
}

async function cargarCatalogoParaSelect() {
  try {
    const datos = await sissoFetch('/epp/catalogo');
    catalogo = datos.catalogo || [];
    const sel = document.getElementById('e-epp');
    if (sel) {
      sel.innerHTML = '<option value="">Selecciona…</option>' +
        catalogo.map(c => `<option value="${c.id}">${escHtml(c.nombre)} (${escHtml(c.tipo)})</option>`).join('');
    }
  } catch (err) { /* silencioso: el catálogo puede estar vacío al inicio */ }
}

// ======= Entregas =======
async function crearEntrega() {
  ocultarError('error-entrega');
  ocultarExito('exito-entrega');

  const trabajadorId = document.getElementById('e-trabajador').value;
  const eppId = document.getElementById('e-epp').value;
  const fechaEntrega = document.getElementById('e-fecha').value;
  const cantidad = parseInt(document.getElementById('e-cantidad').value, 10) || 1;
  const motivo = document.getElementById('e-motivo').value;

  if (!trabajadorId) { mostrarError('error-entrega', 'Selecciona un trabajador.'); return; }
  if (!eppId) { mostrarError('error-entrega', 'Selecciona un EPP del catálogo.'); return; }
  if (!fechaEntrega) { mostrarError('error-entrega', 'Indica la fecha de entrega.'); return; }

  const canvas = document.getElementById('lienzo-firma-epp');
  const firmaBase64 = canvas.toDataURL('image/png');
  // Un canvas vacio tambien genera una imagen valida (transparente);
  // solo enviamos la firma si el usuario realmente dibujo algo.
  const contexto = canvas.getContext('2d');
  const pixeles = contexto.getImageData(0, 0, canvas.width, canvas.height).data;
  const hayTrazo = pixeles.some((valor, indice) => indice % 4 === 3 && valor !== 0);

  const boton = document.getElementById('btn-crear-entrega');
  boton.disabled = true;
  boton.textContent = 'Registrando…';

  try {
    await sissoFetch('/epp/entregas', {
      method: 'POST',
      body: {
        trabajadorId, eppId, fechaEntrega, cantidad, motivo,
        firmaBase64: hayTrazo ? firmaBase64 : undefined,
      },
    });
    mostrarExito('exito-entrega', 'Entrega registrada.');
    limpiarFirma();
    await cargarEntregas();
  } catch (err) {
    mostrarError('error-entrega', err.message || 'Error al registrar la entrega.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Registrar entrega';
  }
}

async function cargarEntregas() {
  const cont = document.getElementById('tabla-entregas');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  const estado = document.getElementById('f-estado').value;
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);

  try {
    const datos = await sissoFetch(`/epp/entregas?${parametros.toString()}`);
    const entregas = datos.entregas || [];
    if (entregas.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay entregas registradas.</div>';
      return;
    }
    cont.innerHTML = `
      <table class="tabla-epp">
        <thead><tr><th>Trabajador</th><th>EPP</th><th>Entrega</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${entregas.map(e => `
            <tr>
              <td>${escHtml(e.trabajador_nombre || '—')}</td>
              <td>${escHtml(e.epp_nombre)}</td>
              <td>${formatearFecha(e.fecha_entrega)}</td>
              <td>${e.fecha_vencimiento_estimada ? formatearFecha(e.fecha_vencimiento_estimada) : '—'}</td>
              <td>${chipDeEstado(e.estado)}</td>
              <td>
                ${e.tiene_firma ? `<button class="btn-mini" data-on-click="verFirma('${e.id}')">Ver firma</button>` : ''}
                ${esGestor && e.estado !== 'repuesto' ? `<button class="btn-mini" data-on-click="marcarRepuesto('${e.id}')">Marcar repuesto</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

async function verFirma(id) {
  try {
    const datos = await sissoFetch(`/epp/entregas/${id}/firma`);
    window.open(datos.url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    alert('Error al abrir la firma: ' + (err.message || ''));
  }
}

async function marcarRepuesto(id) {
  if (!confirm('¿Marcar esta entrega como repuesta?')) return;
  try {
    await sissoFetch(`/epp/entregas/${id}/marcar-repuesto`, { method: 'PUT' });
    await cargarEntregas();
  } catch (err) {
    alert('Error: ' + (err.message || ''));
  }
}

// ======= Catálogo =======
async function crearItemCatalogo() {
  ocultarError('error-catalogo');
  ocultarExito('exito-catalogo');

  const nombre = document.getElementById('k-nombre').value.trim();
  const tipo = document.getElementById('k-tipo').value.trim();
  const vidaUtil = document.getElementById('k-vida-util').value;
  const norma = document.getElementById('k-norma').value.trim();

  if (!nombre) { mostrarError('error-catalogo', 'Indica el nombre.'); return; }
  if (!tipo) { mostrarError('error-catalogo', 'Indica el tipo.'); return; }

  const boton = document.getElementById('btn-crear-catalogo');
  boton.disabled = true;
  boton.textContent = 'Agregando…';

  try {
    await sissoFetch('/epp/catalogo', {
      method: 'POST',
      body: { nombre, tipo, vidaUtilMeses: vidaUtil ? parseInt(vidaUtil, 10) : undefined, normaReferencia: norma || undefined },
    });
    mostrarExito('exito-catalogo', 'Agregado al catálogo.');
    document.getElementById('k-nombre').value = '';
    document.getElementById('k-tipo').value = '';
    document.getElementById('k-vida-util').value = '';
    document.getElementById('k-norma').value = '';
    await cargarCatalogoParaSelect();
    await cargarCatalogoLista();
  } catch (err) {
    mostrarError('error-catalogo', err.message || 'Error al agregar al catálogo.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Agregar al catálogo';
  }
}

async function cargarCatalogoLista() {
  const cont = document.getElementById('lista-catalogo');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  try {
    const datos = await sissoFetch('/epp/catalogo');
    const items = datos.catalogo || [];
    if (items.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Catálogo vacío todavía.</div>';
      return;
    }
    cont.innerHTML = `
      <table class="tabla-epp">
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Vida útil</th><th>Norma</th></tr></thead>
        <tbody>
          ${items.map(c => `
            <tr>
              <td>${escHtml(c.nombre)}</td>
              <td>${escHtml(c.tipo)}</td>
              <td>${c.vida_util_meses ? c.vida_util_meses + ' meses' : '—'}</td>
              <td>${escHtml(c.norma_referencia || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// ======= Utilidades =======
function chipDeEstado(estado) {
  const mapa = { vigente: 'verde', vencido: 'rojo', repuesto: 'gris' };
  const etiquetas = { vigente: 'Vigente', vencido: 'Vencido', repuesto: 'Repuesto' };
  return `<span class="sisso-chip ${mapa[estado] || 'gris'}">${etiquetas[estado] || estado}</span>`;
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
