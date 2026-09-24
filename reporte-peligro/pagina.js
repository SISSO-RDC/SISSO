// ============================================================
// SISSO - Logica de la pagina publica de reporte de peligro
// (reporte-peligro/index.html). Sin autenticacion: no carga
// shared/layout.js (esa pagina asume una sesion existente).
//
// Lote 1 del plan de cierre de brechas frente a plataformas EHS
// globales (Cority/VelocityEHS/Benchmark Gensuite, ver analisis
// Sep 2026).
// ============================================================
let clasificacionElegida = null;
let archivoAdjuntoBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
  // Prellena el codigo de la empresa si llego por el enlace/QR
  // generado en Mi Empresa (?org=CODIGO). El campo sigue editable
  // por si alguien escanea un QR ajeno o lo escribe a mano.
  const parametros = new URLSearchParams(window.location.search);
  const codigoPrellenado = parametros.get('org');
  if (codigoPrellenado) {
    document.getElementById('f-codigo').value = codigoPrellenado;
  }
});

function elegirClasificacion(elemento) {
  document.querySelectorAll('.rp-clasificacion-opcion').forEach((el) => el.classList.remove('activa'));
  elemento.classList.add('activa');
  clasificacionElegida = elemento.getAttribute('data-valor');
}

document.addEventListener('change', (evento) => {
  if (evento.target.id === 'f-identificarse') {
    document.getElementById('caja-nombre').style.display = evento.target.checked ? 'block' : 'none';
    return;
  }
  if (evento.target.id === 'f-foto') {
    const archivo = evento.target.files[0];
    archivoAdjuntoBase64 = null;
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (e) => { archivoAdjuntoBase64 = e.target.result; };
    lector.readAsDataURL(archivo);
  }
});

async function enviarReporte() {
  ocultarError('error-form');

  const codigoOrganizacion = document.getElementById('f-codigo').value.trim();
  const descripcion = document.getElementById('f-descripcion').value.trim();
  const area = document.getElementById('f-area').value.trim();
  const ubicacionTexto = document.getElementById('f-ubicacion').value.trim();
  const identificarse = document.getElementById('f-identificarse').checked;
  const reportanteNombre = document.getElementById('f-nombre').value.trim();

  if (!codigoOrganizacion) { mostrarError('error-form', 'Ingrese el código de la empresa.'); return; }
  if (!clasificacionElegida) { mostrarError('error-form', 'Seleccione qué está reportando.'); return; }
  if (descripcion.length < 10) { mostrarError('error-form', 'Describa lo que observó (mínimo 10 caracteres).'); return; }
  if (identificarse && !reportanteNombre) { mostrarError('error-form', 'Ingrese su nombre, o desmarque "Quiero identificarme".'); return; }

  const boton = document.getElementById('btn-enviar');
  boton.disabled = true;
  boton.textContent = 'Enviando…';

  try {
    const datos = await sissoFetch('/reportes-peligro/publico', {
      method: 'POST',
      body: {
        codigoOrganizacion,
        clasificacion: clasificacionElegida,
        descripcion,
        area: area || undefined,
        ubicacionTexto: ubicacionTexto || undefined,
        anonimo: !identificarse,
        reportanteNombre: identificarse ? reportanteNombre : undefined,
        archivoBase64: archivoAdjuntoBase64 || undefined,
      },
    });

    document.getElementById('texto-exito').textContent = datos.mensaje || 'Su reporte fue registrado.';
    document.getElementById('vista-formulario').style.display = 'none';
    document.getElementById('vista-exito').style.display = 'block';
  } catch (err) {
    mostrarError('error-form', err.message || 'No se pudo registrar el reporte. Intente de nuevo.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Enviar reporte';
  }
}

function reiniciarFormulario() {
  clasificacionElegida = null;
  archivoAdjuntoBase64 = null;
  document.querySelectorAll('.rp-clasificacion-opcion').forEach((el) => el.classList.remove('activa'));
  document.getElementById('f-descripcion').value = '';
  document.getElementById('f-area').value = '';
  document.getElementById('f-ubicacion').value = '';
  document.getElementById('f-foto').value = '';
  document.getElementById('f-identificarse').checked = false;
  document.getElementById('f-nombre').value = '';
  document.getElementById('caja-nombre').style.display = 'none';
  document.getElementById('vista-exito').style.display = 'none';
  document.getElementById('vista-formulario').style.display = 'block';
}

function mostrarError(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
}
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
