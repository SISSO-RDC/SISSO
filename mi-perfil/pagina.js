// ============================================================
// SISSO - Logica de la pagina (mi-perfil/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('mi-perfil', 'Mi Perfil');
  await cargarMiFirma();
  inicializarCanvasFirmaConfig();
  await cargarFirmaElectronica();
});

// ------- Mi firma digital y credencial profesional (Auditoria N.15) -------
let ctxFirmaConfig, dibujandoFirmaConfig = false;

async function cargarMiFirma() {
  try {
    const datos = await sissoFetch('/usuarios/mi-firma-digital');
    document.getElementById('input-senescyt').value = datos.registroSenescytEspecialidad || '';
    if (datos.tieneFirma) {
      document.getElementById('imagen-firma-existente').src = datos.url;
      document.getElementById('fecha-firma-existente').textContent = datos.actualizadoEn
        ? 'Registrada el ' + new Date(datos.actualizadoEn).toLocaleDateString('es-EC')
        : '';
      document.getElementById('vista-firma-existente').style.display = 'block';
      document.getElementById('zona-canvas-firma').style.display = 'none';
    } else {
      document.getElementById('vista-firma-existente').style.display = 'none';
      document.getElementById('zona-canvas-firma').style.display = 'block';
    }
  } catch (err) {
    mostrarError('error-firma', 'No se pudo cargar tu firma digital: ' + err.message);
  }
}

function mostrarCanvasFirma() {
  document.getElementById('vista-firma-existente').style.display = 'none';
  document.getElementById('zona-canvas-firma').style.display = 'block';
}

// Mismo patron de captura de firma que historia-clinica.js (Bloque Q).
function inicializarCanvasFirmaConfig() {
  const canvas = document.getElementById('lienzo-firma-config');
  const ajustar = () => {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctxFirmaConfig = canvas.getContext('2d');
    ctxFirmaConfig.scale(ratio, ratio);
    ctxFirmaConfig.lineWidth = 2.2;
    ctxFirmaConfig.lineCap = 'round';
    ctxFirmaConfig.strokeStyle = '#1a1d23';
  };
  window.addEventListener('resize', ajustar);
  ajustar();

  function posicion(e) {
    const rect = canvas.getBoundingClientRect();
    const punto = e.touches ? e.touches[0] : e;
    return { x: punto.clientX - rect.left, y: punto.clientY - rect.top };
  }
  function iniciar(e) { dibujandoFirmaConfig = true; const p = posicion(e); ctxFirmaConfig.beginPath(); ctxFirmaConfig.moveTo(p.x, p.y); e.preventDefault(); }
  function mover(e) { if (!dibujandoFirmaConfig) return; const p = posicion(e); ctxFirmaConfig.lineTo(p.x, p.y); ctxFirmaConfig.stroke(); e.preventDefault(); }
  function terminar() { dibujandoFirmaConfig = false; }

  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', mover);
  window.addEventListener('mouseup', terminar);
  canvas.addEventListener('touchstart', iniciar, { passive: false });
  canvas.addEventListener('touchmove', mover, { passive: false });
  canvas.addEventListener('touchend', terminar);
}

function limpiarFirmaConfig() {
  const canvas = document.getElementById('lienzo-firma-config');
  ctxFirmaConfig.clearRect(0, 0, canvas.width, canvas.height);
}

function firmaConfigTieneContenido() {
  const canvas = document.getElementById('lienzo-firma-config');
  if (!canvas.width || !canvas.height) return false;
  const datos = ctxFirmaConfig.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < datos.length; i += 4) { if (datos[i] !== 0) return true; }
  return false;
}

async function guardarMiFirma() {
  if (!firmaConfigTieneContenido()) {
    mostrarError('error-firma', 'Dibuja tu firma antes de guardar.');
    return;
  }
  try {
    const imagenBase64 = document.getElementById('lienzo-firma-config').toDataURL('image/png');
    await sissoFetch('/usuarios/mi-firma-digital', { method: 'PUT', body: JSON.stringify({ imagenBase64 }) });
    mostrarExito('exito-firma', 'Firma digital guardada.');
    await cargarMiFirma();
  } catch (err) {
    mostrarError('error-firma', 'No se pudo guardar la firma: ' + err.message);
  }
}

async function eliminarMiFirma() {
  if (!confirm('¿Eliminar tu firma digital registrada? Tendrás que volver a dibujarla si la necesitas más adelante.')) return;
  try {
    await sissoFetch('/usuarios/mi-firma-digital', { method: 'DELETE' });
    mostrarExito('exito-firma', 'Firma digital eliminada.');
    await cargarMiFirma();
  } catch (err) {
    mostrarError('error-firma', 'No se pudo eliminar la firma: ' + err.message);
  }
}

async function guardarRegistroSenescyt() {
  try {
    const registroSenescytEspecialidad = document.getElementById('input-senescyt').value.trim();
    await sissoFetch('/usuarios/mi-firma-digital/registro-senescyt', {
      method: 'PUT', body: JSON.stringify({ registroSenescytEspecialidad }),
    });
    mostrarExito('exito-firma', 'Registro SENESCYT guardado.');
  } catch (err) {
    mostrarError('error-firma', 'No se pudo guardar el registro SENESCYT: ' + err.message);
  }
}

function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 4000); }

// ------- Firma electrónica AVANZADA (certificado .p12) -- Oct 2026 -------
// Distinta de "Mi firma digital" de arriba (esa es una imagen dibujada en
// canvas). Esta es un certificado X.509 real con validez legal: firma
// criptográficamente el PDF completo (PKCS#7/CMS).
let feArchivoBase64 = null;

document.addEventListener('change', (evento) => {
  if (evento.target.id !== 'fe-archivo') return;
  const archivo = evento.target.files[0];
  feArchivoBase64 = null;
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = (e) => { feArchivoBase64 = e.target.result; };
  lector.readAsDataURL(archivo);
});

async function cargarFirmaElectronica() {
  document.getElementById('fe-cargando').style.display = 'block';
  document.getElementById('fe-sin-certificado').style.display = 'none';
  document.getElementById('fe-con-certificado').style.display = 'none';
  try {
    const datos = await sissoFetch('/firma-electronica/mi-certificado');
    document.getElementById('fe-cargando').style.display = 'none';
    if (!datos.certificado) {
      document.getElementById('fe-sin-certificado').style.display = 'block';
      return;
    }
    renderizarCertificadoFirmaElectronica(datos.certificado);
  } catch (err) {
    document.getElementById('fe-cargando').style.display = 'none';
    mostrarError('error-firma-electronica', 'No se pudo cargar tu certificado: ' + err.message);
  }
}

function renderizarCertificadoFirmaElectronica(cert) {
  document.getElementById('fe-con-certificado').style.display = 'block';
  document.getElementById('fe-sin-certificado').style.display = 'none';
  document.getElementById('fe-titular').textContent = cert.titular_cn;
  document.getElementById('fe-emisor').textContent = cert.emisor_cn || '—';
  document.getElementById('fe-vencimiento').textContent = new Date(cert.fecha_vencimiento).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  document.getElementById('fe-activo').checked = cert.activo;

  let chip = '';
  if (cert.vencido) chip = '<span class="sisso-chip rojo">Vencido</span>';
  else if (cert.porVencer) chip = `<span class="sisso-chip ambar">Vence en ${cert.diasHastaVencimiento} días</span>`;
  else chip = '<span class="sisso-chip verde">Vigente</span>';
  document.getElementById('fe-chip-estado').innerHTML = chip;

  // Un certificado vencido no se puede activar -- si quedo activo de antes
  // y vencio desde entonces, mostramos el checkbox desmarcable pero no
  // marcable de nuevo (el backend lo rechazaria igual).
  document.getElementById('fe-activo').disabled = cert.vencido && !cert.activo;
}

function mostrarFormularioNuevoCertificado() {
  feArchivoBase64 = null;
  document.getElementById('fe-archivo').value = '';
  document.getElementById('fe-passphrase').value = '';
  document.getElementById('fe-con-certificado').style.display = 'none';
  document.getElementById('fe-sin-certificado').style.display = 'block';
}

async function cargarCertificadoFirmaElectronica() {
  const passphrase = document.getElementById('fe-passphrase').value;
  if (!feArchivoBase64) { mostrarError('error-firma-electronica', 'Selecciona el archivo .p12.'); return; }
  if (!passphrase) { mostrarError('error-firma-electronica', 'Ingresa la contraseña del certificado.'); return; }

  try {
    await sissoFetch('/firma-electronica/cargar', {
      method: 'POST',
      body: { archivoBase64: feArchivoBase64, passphrase },
    });
    feArchivoBase64 = null;
    mostrarExito('exito-firma-electronica', 'Certificado cargado. Actívalo si quieres que se use automáticamente.');
    await cargarFirmaElectronica();
  } catch (err) {
    mostrarError('error-firma-electronica', err.message || 'No se pudo cargar el certificado.');
  }
}

async function cambiarActivacionFirmaElectronica(activo) {
  try {
    await sissoFetch('/firma-electronica/activar', { method: 'PATCH', body: { activo } });
    mostrarExito('exito-firma-electronica', activo ? 'Firma automática activada.' : 'Firma automática desactivada.');
  } catch (err) {
    document.getElementById('fe-activo').checked = !activo; // revertir el checkbox si el backend lo rechazo
    mostrarError('error-firma-electronica', err.message || 'No se pudo cambiar el estado.');
  }
}

async function eliminarCertificadoFirmaElectronica() {
  if (!confirm('¿Eliminar tu certificado de firma electrónica? Tus documentos futuros dejarán de firmarse automáticamente hasta que cargues uno nuevo.')) return;
  try {
    await sissoFetch('/firma-electronica/mi-certificado', { method: 'DELETE' });
    mostrarExito('exito-firma-electronica', 'Certificado eliminado.');
    await cargarFirmaElectronica();
  } catch (err) {
    mostrarError('error-firma-electronica', err.message || 'No se pudo eliminar el certificado.');
  }
}
