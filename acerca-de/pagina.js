// ============================================================
// SISSO - Logica de la pagina (acerca-de/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('acerca-de', 'Acerca de');
  await cargarAcercaDe();
});

async function cargarAcercaDe() {
  const contenedor = document.getElementById('datos-acerca-de');
  try {
    const datos = await sissoFetch('/plataforma/acerca-de');
    contenedor.innerHTML =
      '<div class="sisso-info-fila"><span class="sisso-info-etiqueta">Aplicación</span><span class="sisso-info-valor">' + escaparTexto(datos.aplicacion) + '</span></div>' +
      '<div class="sisso-info-fila"><span class="sisso-info-etiqueta">Propietario</span><span class="sisso-info-valor">' + escaparTexto(datos.dueno) + '</span></div>' +
      '<div class="sisso-info-fila"><span class="sisso-info-etiqueta">Versión</span><span class="sisso-info-valor" style="font-family:var(--mono, monospace);">' + escaparTexto(datos.version) + '</span></div>' +
      '<div class="sisso-info-fila"><span class="sisso-info-etiqueta">Contacto</span><span class="sisso-info-valor">' + escaparTexto(datos.correoContacto) + '</span></div>';
  } catch (err) {
    contenedor.innerHTML = '<div class="empty">No se pudo cargar la información de la plataforma: ' + escaparTexto(err.message) + '</div>';
  }
}

function escaparTexto(valor) {
  const div = document.createElement('div');
  div.textContent = valor == null ? '' : String(valor);
  return div.innerHTML;
}

async function enviarSugerenciaCorreccion() {
  const sugerencia = document.getElementById('input-sugerencia').value.trim();
  const correccion = document.getElementById('input-correccion').value.trim();
  const boton = document.getElementById('btn-enviar-sugerencia');

  document.getElementById('error-sugerencia').classList.remove('visible');
  document.getElementById('exito-sugerencia').classList.remove('visible');

  if (!sugerencia && !correccion) {
    mostrarError('error-sugerencia', 'Escribe una sugerencia o una corrección antes de enviar.');
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Enviando…';
  try {
    const resp = await sissoFetch('/plataforma/sugerencias', {
      method: 'POST',
      body: JSON.stringify({ sugerencia, correccion }),
    });
    mostrarExito('exito-sugerencia', resp.mensaje || 'Enviado. Gracias por tu sugerencia.');
    document.getElementById('input-sugerencia').value = '';
    document.getElementById('input-correccion').value = '';
  } catch (err) {
    mostrarError('error-sugerencia', 'No se pudo enviar: ' + err.message);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Enviar';
  }
}

function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 5000); }
