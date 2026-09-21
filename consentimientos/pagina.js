// ============================================================
// SISSO - Logica de la pagina (consentimientos/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let trabajadores = [];
let trabajadorActualId = null;
let tiposConsentimiento = [];
let tipoElegido = null;

// --- Estado del canvas de firma ---
let ctx, dibujando = false, hayTrazo = false;
// --- Estado de la foto del documento firmado fisicamente ---
let fotoFirmaBase64 = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('consentimientos', 'Consentimientos Informados');
  await cargarTrabajadores();
  await cargarTipos();
  inicializarCanvas();

  const trabajadorPreseleccionado = localStorage.getItem('sisso_trabajador_id');
  if (trabajadorPreseleccionado) document.getElementById('sel-trabajador').value = trabajadorPreseleccionado;
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
    mostrarError('error-trabajador', err.message);
  }
}

async function cargarTipos() {
  try {
    const datos = await sissoFetch('/consentimientos/tipos');
    tiposConsentimiento = datos.tipos || [];
    document.getElementById('tipos-grid').innerHTML = tiposConsentimiento.map(t => `
      <div class="tipo-tarjeta" data-on-click="elegirTipo(${escaparAtributoHtml(JSON.stringify(t.codigo))})">
        <div class="tipo-tarjeta-titulo">${escHtml(t.nombre)}</div>
        <div class="tipo-tarjeta-version">Versión ${t.version}</div>
      </div>`).join('');
  } catch (err) {
    document.getElementById('tipos-grid').innerHTML = `<div class="sisso-vacio">Error al cargar tipos: ${escHtml(err.message)}</div>`;
  }
}

// ------- Elegir trabajador -------
function elegirTrabajador() {
  ocultarError('error-trabajador');
  const id = document.getElementById('sel-trabajador').value;
  if (!id) { mostrarError('error-trabajador', 'Selecciona un trabajador.'); return; }

  trabajadorActualId = id;
  const t = trabajadores.find(x => x.id === id);
  document.getElementById('titulo-trabajador').textContent = t ? `${t.nombre_completo} — ${t.documento}` : 'Trabajador';

  document.getElementById('caja-seleccion-trabajador').style.display = 'none';
  document.getElementById('caja-principal').style.display = 'block';
  document.getElementById('caja-firma').style.display = 'none';

  cargarConsentimientos();
}

function cambiarTrabajador() {
  trabajadorActualId = null;
  tipoElegido = null;
  document.getElementById('caja-seleccion-trabajador').style.display = 'block';
  document.getElementById('caja-principal').style.display = 'none';
}

// ------- Elegir tipo de consentimiento -------
function elegirTipo(codigo) {
  tipoElegido = tiposConsentimiento.find(t => t.codigo === codigo);
  if (!tipoElegido) return;

  document.getElementById('titulo-tipo-elegido').textContent = `2. Leer y firmar — ${tipoElegido.nombre}`;
  document.getElementById('texto-legal').textContent = tipoElegido.texto_legal;
  document.getElementById('caja-firma').style.display = 'block';
  cambiarModoFirma('electronica');
  fotoFirmaBase64 = null;
  document.getElementById('input-foto-firma').value = '';
  document.getElementById('previsualizacion-foto-firma').style.display = 'none';
  document.getElementById('btn-firmar-fisico').disabled = true;
  ajustarTamanoCanvas(); // el contenedor ya es visible: ahora si mide el tamano real
  limpiarFirma();
  ocultarError('error-firma');
  ocultarExito('exito-firma');
  document.getElementById('caja-firma').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ------- Canvas de firma -------
function inicializarCanvas() {
  const canvas = document.getElementById('lienzo-firma');

  ajustarTamanoCanvas(); // primera medicion (el contenedor puede estar oculto todavia; se vuelve a medir en elegirTipo())
  window.addEventListener('resize', ajustarTamanoCanvas);

  function posicion(e) {
    const rect = canvas.getBoundingClientRect();
    const punto = e.touches ? e.touches[0] : e;
    return { x: punto.clientX - rect.left, y: punto.clientY - rect.top };
  }

  function iniciar(e) {
    dibujando = true;
    hayTrazo = true;
    const p = posicion(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.preventDefault();
  }
  function mover(e) {
    if (!dibujando) return;
    const p = posicion(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    e.preventDefault();
  }
  function terminar() { dibujando = false; }

  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', mover);
  window.addEventListener('mouseup', terminar);
  canvas.addEventListener('touchstart', iniciar, { passive: false });
  canvas.addEventListener('touchmove', mover, { passive: false });
  canvas.addEventListener('touchend', terminar);
}

// ------- Medir/redimensionar el canvas -------
//
// BUG CORREGIDO: esto se llamaba solo una vez, en DOMContentLoaded,
// mientras el contenedor #caja-firma todavia tenia display:none (se
// muestra recien cuando el usuario elige un tipo de consentimiento).
// Un elemento oculto mide 0x0, asi que canvas.width/height quedaban
// en 0 para siempre: el cursor se movia pero no habia superficie
// real donde dibujar. Ahora esta funcion es independiente y se
// vuelve a llamar en elegirTipo(), justo despues de mostrar la caja
// (momento en el que el canvas ya tiene su tamano real en pantalla).
function ajustarTamanoCanvas() {
  const canvas = document.getElementById('lienzo-firma');
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return; // todavia oculto, no hay nada que medir
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a1d23';
}

function limpiarFirma() {
  const canvas = document.getElementById('lienzo-firma');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hayTrazo = false;
}

// ------- Confirmar firma (subir al backend) -------
async function confirmarFirma() {
  ocultarError('error-firma');
  ocultarExito('exito-firma');

  if (!hayTrazo) { mostrarError('error-firma', 'El trabajador debe dibujar su firma antes de confirmar.'); return; }
  if (!tipoElegido) { mostrarError('error-firma', 'Selecciona un tipo de consentimiento.'); return; }

  const boton = document.getElementById('btn-firmar');
  boton.disabled = true;
  boton.textContent = 'Guardando firma…';

  try {
    const canvas = document.getElementById('lienzo-firma');
    const firmaBase64 = canvas.toDataURL('image/png');

    await sissoFetch(`/consentimientos/trabajadores/${trabajadorActualId}/firmar`, {
      method: 'POST',
      body: { tipoConsentimientoCodigo: tipoElegido.codigo, firmaBase64 }
    });

    mostrarExito('exito-firma', 'Consentimiento firmado y registrado correctamente.');
    document.getElementById('caja-firma').style.display = 'none';
    tipoElegido = null;
    await cargarConsentimientos();

  } catch (err) {
    mostrarError('error-firma', err.message || 'Error al registrar la firma.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Confirmar consentimiento firmado';
  }
}

// ------- Alternar entre firma electronica y firma fisica -------
function cambiarModoFirma(modo) {
  const esElectronica = modo === 'electronica';
  document.getElementById('btn-modo-electronica').classList.toggle('activo', esElectronica);
  document.getElementById('btn-modo-fisica').classList.toggle('activo', !esElectronica);
  document.getElementById('bloque-firma-electronica').style.display = esElectronica ? 'block' : 'none';
  document.getElementById('bloque-firma-fisica').style.display = esElectronica ? 'none' : 'block';
}

// ------- Imprimir el documento en blanco (para firmar a mano) -------
// N.18 (CSP estricta): antes el boton llamaba imprimirEnBlanco(tipoElegido.codigo)
// directamente en el atributo onclick; una variable de script no es
// accesible desde el delegador de eventos, asi que se envuelve aqui.
function imprimirEnBlancoTipoElegido() {
  if (!tipoElegido) { mostrarError('error-firma', 'Selecciona un tipo de consentimiento.'); return; }
  return imprimirEnBlanco(tipoElegido.codigo);
}

async function imprimirEnBlanco(codigoTipo) {
  ocultarError('error-firma');
  try {
    const blob = await sissoDescargarArchivo(`/consentimientos/tipos/${codigoTipo}/pdf-blanco?trabajadorId=${trabajadorActualId}`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    mostrarError('error-firma', err.message || 'Error al generar el PDF en blanco.');
  }
}

// ------- Elegir/previsualizar la foto del documento ya firmado -------
function previsualizarFotoFirma(evento) {
  const archivo = evento.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = () => {
    fotoFirmaBase64 = lector.result;
    const img = document.getElementById('previsualizacion-foto-firma');
    img.src = fotoFirmaBase64;
    img.style.display = 'block';
    document.getElementById('btn-firmar-fisico').disabled = false;
  };
  lector.readAsDataURL(archivo);
}

// ------- Confirmar firma fisica (subir foto/escaneo al backend) -------
async function confirmarFirmaFisica() {
  ocultarError('error-firma');
  ocultarExito('exito-firma');

  if (!fotoFirmaBase64) { mostrarError('error-firma', 'Elige la foto del documento firmado antes de confirmar.'); return; }
  if (!tipoElegido) { mostrarError('error-firma', 'Selecciona un tipo de consentimiento.'); return; }

  const boton = document.getElementById('btn-firmar-fisico');
  boton.disabled = true;
  boton.textContent = 'Subiendo documento…';

  try {
    await sissoFetch(`/consentimientos/trabajadores/${trabajadorActualId}/firmar-fisico`, {
      method: 'POST',
      body: { tipoConsentimientoCodigo: tipoElegido.codigo, imagenBase64: fotoFirmaBase64 }
    });

    mostrarExito('exito-firma', 'Documento firmado físicamente registrado correctamente.');
    document.getElementById('caja-firma').style.display = 'none';
    tipoElegido = null;
    fotoFirmaBase64 = null;
    await cargarConsentimientos();

  } catch (err) {
    mostrarError('error-firma', err.message || 'Error al registrar el documento firmado.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Confirmar documento firmado';
  }
}

// ------- Descargar el PDF de un consentimiento ya firmado -------
async function descargarPdfFirmado(id) {
  try {
    const blob = await sissoDescargarArchivo(`/consentimientos/${id}/pdf`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    alert('Error al descargar el PDF: ' + err.message);
  }
}

// CORREGIDO tras auditoria de seguridad (hallazgo G12): la imagen de
// la firma ya no tiene una URL publica permanente (backend:
// consentimientosController.js/cloudinaryService.js). Se abre la
// pestaña ANTES de esperar el fetch (ver nota completa en
// reba/index.html:verEvidenciaFirmada) para que el navegador no
// bloquee el popup.
async function verFirmaFirmada(id, event) {
  if (event) event.preventDefault();
  const ventana = window.open('', '_blank');
  try {
    const datos = await sissoFetch(`/consentimientos/${id}/firma-url`);
    if (ventana) ventana.location.href = datos.url;
  } catch (err) {
    if (ventana) ventana.close();
    alert(err.message || 'No se pudo obtener el enlace de la firma.');
  }
  return false;
}

// ------- Listar consentimientos del trabajador -------
async function cargarConsentimientos() {
  const cont = document.getElementById('lista-consentimientos');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  try {
    const datos = await sissoFetch(`/consentimientos/trabajadores/${trabajadorActualId}`);
    const lista = datos.consentimientos || [];

    if (lista.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Este trabajador aún no tiene consentimientos firmados.</div>';
      return;
    }

    cont.innerHTML = lista.map(c => `
      <div class="consent-item ${c.revocado ? 'revocado' : ''}">
        <div class="consent-info">
          <strong>${escHtml(c.tipo_consentimiento_nombre)}</strong>
          <div class="consent-meta">
            Firmado el ${formatearFechaHora(c.creado_en)} por ${escHtml(c.registrado_por_nombre)}
            · ${c.metodo_firma === 'fisica_escaneada' ? '🖨 Papel escaneado' : '✍ Electrónica'}
            ${c.revocado ? ` · Revocado el ${formatearFechaHora(c.revocado_en)}` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <a href="#" data-on-click="return verFirmaFirmada('${c.id}', event)" class="btn-mini">✍ Ver firma</a>
          <button class="btn-mini" data-on-click="descargarPdfFirmado('${c.id}')">📄 PDF</button>
          ${c.revocado
            ? '<span class="sisso-chip rojo">Revocado</span>'
            : `<button class="btn-mini" data-on-click="revocar('${c.id}')">Revocar</button>`
          }
        </div>
      </div>`).join('');

  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

async function revocar(id) {
  const motivo = prompt('Motivo de la revocación (mínimo 5 caracteres):');
  if (!motivo || motivo.trim().length < 5) {
    if (motivo !== null) alert('El motivo debe tener al menos 5 caracteres.');
    return;
  }

  try {
    await sissoFetch(`/consentimientos/${id}/revocar`, {
      method: 'POST',
      body: { motivoRevocacion: motivo.trim() }
    });
    await cargarConsentimientos();
  } catch (err) {
    alert('Error al revocar: ' + err.message);
  }
}

// ------- Helpers -------
function formatearFechaHora(fecha) {
  return new Date(fecha).toLocaleString('es-EC', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
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
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
}
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
