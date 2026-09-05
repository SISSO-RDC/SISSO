// ============================================================
// SISSO - Mi Empresa
// ============================================================

let organizacionActual = null;

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('empresa', 'Mi Empresa');
  await cargarPerfil();
});

async function cargarPerfil() {
  try {
    const datos = await sissoFetch('/organizacion');
    organizacionActual = datos.organizacion;
    renderizar(datos.organizacion, datos.resumen);
  } catch (err) {
    document.getElementById('contenido-empresa').innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

function renderizar(org, resumen) {
  const etiquetasPlan = { gratis: 'Gratis', profesional: 'Profesional', empresarial: 'Empresarial' };

  document.getElementById('contenido-empresa').innerHTML = `
    <div class="resumen-grid" style="margin-bottom:20px;">
      <div class="resumen-item"><div class="numero">${resumen.trabajadores_activos}</div><div class="etiqueta">Trabajadores activos</div></div>
      <div class="resumen-item"><div class="numero">${resumen.usuarios_activos}</div><div class="etiqueta">Usuarios del sistema</div></div>
      <div class="resumen-item"><div class="numero">${resumen.puestos_trabajo}</div><div class="etiqueta">Puestos de trabajo</div></div>
    </div>

    <div class="logo-caja">
      <div class="logo-preview" id="logo-preview">
        ${org.logo_url ? `<img src="${org.logo_url}" alt="Logo">` : '<span style="font-size:11px;color:var(--t3);">Sin logo</span>'}
      </div>
      <div>
        <input type="file" id="input-logo" accept="image/*" style="display:none;" onchange="subirLogo(event)">
        <button class="sisso-boton secundario" onclick="document.getElementById('input-logo').click()">📷 ${org.logo_url ? 'Cambiar' : 'Subir'} logo</button>
        <div style="font-size:11px;color:var(--t3);margin-top:6px;">Se usa en los PDF generados por el sistema (consentimientos, certificados, historia clínica).</div>
      </div>
    </div>

    <div class="datos-solo-lectura">
      <div><strong>Razón social</strong>${escHtml(org.nombre)}</div>
      <div><strong>Código SISSO</strong>${escHtml(org.codigo)}</div>
      <div><strong>RUC / NIT</strong>${escHtml(org.ruc_nit || '—')}</div>
      <div><strong>Plan</strong>${etiquetasPlan[org.plan] || org.plan}</div>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:18px;">Estos datos los gestiona el equipo de SISSO. Si necesitas corregir alguno, contáctanos.</div>

    <div class="sisso-error" id="error-form"></div>
    <div class="sisso-exito" id="exito-form"></div>

    <div class="fila-campos" style="margin-bottom:12px;">
      <div class="sisso-campo"><label class="sisso-etiqueta">Dirección</label><input id="e-direccion" class="sisso-input" value="${escAttr(org.direccion)}"></div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Teléfono</label><input id="e-telefono" class="sisso-input" value="${escAttr(org.telefono)}"></div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Correo de contacto</label><input id="e-email" type="email" class="sisso-input" value="${escAttr(org.email_contacto)}"></div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Código CIIU (actividad económica)</label><input id="e-ciiu" class="sisso-input" value="${escAttr(org.actividad_economica_ciiu)}"></div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Descripción de la actividad económica</label><input id="e-actividad-desc" class="sisso-input" value="${escAttr(org.actividad_economica_desc)}"></div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Representante legal</label><input id="e-representante" class="sisso-input" value="${escAttr(org.representante_legal)}"></div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Responsable de SST — nombre</label><input id="e-sst-nombre" class="sisso-input" value="${escAttr(org.responsable_sst_nombre)}"></div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Responsable de SST — cargo</label><input id="e-sst-cargo" class="sisso-input" value="${escAttr(org.responsable_sst_cargo)}"></div>
    </div>

    <button class="sisso-boton" id="btn-guardar" onclick="guardarPerfil()" style="margin-top:16px;">Guardar cambios</button>
  `;
}

async function guardarPerfil() {
  document.getElementById('error-form').classList.remove('visible');
  document.getElementById('exito-form').classList.remove('visible');

  const cuerpo = {
    direccion: document.getElementById('e-direccion').value.trim() || undefined,
    telefono: document.getElementById('e-telefono').value.trim() || undefined,
    emailContacto: document.getElementById('e-email').value.trim() || undefined,
    actividadEconomicaCiiu: document.getElementById('e-ciiu').value.trim() || undefined,
    actividadEconomicaDesc: document.getElementById('e-actividad-desc').value.trim() || undefined,
    representanteLegal: document.getElementById('e-representante').value.trim() || undefined,
    responsableSstNombre: document.getElementById('e-sst-nombre').value.trim() || undefined,
    responsableSstCargo: document.getElementById('e-sst-cargo').value.trim() || undefined,
  };

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch('/organizacion', { method: 'PUT', body: cuerpo });
    mostrarExito('exito-form', 'Datos guardados correctamente.');
  } catch (err) {
    mostrarError('error-form', err.message || 'Error al guardar los datos.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar cambios';
  }
}

async function subirLogo(evento) {
  const archivo = evento.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = async () => {
    try {
      const datos = await sissoFetch('/organizacion/logo', { method: 'PUT', body: { logoBase64: lector.result } });
      document.getElementById('logo-preview').innerHTML = `<img src="${datos.organizacion.logo_url}" alt="Logo">`;
      // Para que el sidebar muestre el logo nuevo de inmediato, sin
      // tener que cerrar sesion y volver a entrar.
      SissoSesion.actualizarLogoOrganizacion(datos.organizacion.logo_url);
    } catch (err) {
      alert('Error al subir el logo: ' + err.message);
    }
  };
  lector.readAsDataURL(archivo);
}

// ------- Utilidades -------
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
// CORREGIDO en Auditoria N.15 (hallazgo MODERADO M15-10): antes
// definia aqui su propia copia local de escAttr; ahora usa la
// version centralizada de shared/layout.js (escaparAtributoHtml),
// para el caso de un valor dentro de un atributo HTML simple
// (value="..."), sin JavaScript anidado.
const escAttr = escaparAtributoHtml;
function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 4000); }
