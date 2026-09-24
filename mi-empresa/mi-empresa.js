// ============================================================
// SISSO - Mi Empresa
// ============================================================

let organizacionActual = null;
let resumenActual = null; // usado por configurador-sectorial.js como sugerencia inicial de numero de trabajadores

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('empresa', 'Mi Empresa');

  // N.17 C-17-03: esta pagina ahora es visible tambien a sso/medico
  // (antes solo admin), pero SOLO para la tarjeta de "Propuestas
  // Sectoriales" -- el resto de la pagina (perfil de la empresa,
  // logo, configurador de sector) sigue siendo admin-only porque
  // GET /organizacion y GET /auth/usuarios lo son en el backend
  // (organizacionRoutes.js). Para sso/medico esa tarjeta ni se
  // muestra ni se llama a esos endpoints (evita un 403 innecesario).
  const rol = SissoSesion.obtenerUsuario()?.rol;
  if (rol === 'admin') {
    await cargarPerfil();
    await cargarQrReportePeligro();
  } else {
    document.getElementById('tarjeta-perfil-empresa').style.display = 'none';
    document.getElementById('tarjeta-qr-reporte-peligro').style.display = 'none';
  }

  await SissoPropuestasSectoriales.iniciar(rol);
});

async function cargarPerfil() {
  try {
    // CORREGIDO en Auditoria N.15 (pedido de la persona usuaria):
    // "Responsable del Departamento Médico" y "Responsable de SST"
    // ahora se eligen de un listado real de usuarios de la
    // organizacion (via /auth/usuarios), no se escriben a mano --
    // ver renderizar() para el detalle de que rol puede aparecer en
    // cada campo.
    const [datos, datosUsuarios] = await Promise.all([
      sissoFetch('/organizacion'),
      sissoFetch('/auth/usuarios'),
    ]);
    organizacionActual = datos.organizacion;
    resumenActual = datos.resumen;
    renderizar(datos.organizacion, datos.resumen, datosUsuarios.usuarios || []);
  } catch (err) {
    document.getElementById('contenido-empresa').innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// CREADO en Auditoria N.15: arma las opciones de un <select> a partir
// de una lista de usuarios candidatos, marcando seleccionado el que
// coincide con el nombre ya guardado en la organizacion -- o, si no
// hay ninguno guardado todavia y solo existe UN candidato posible, lo
// preselecciona (pedido explicito de la persona usuaria: "en caso de
// haber un solo usuario... se llenará automáticamente"). Si no hay
// ningun candidato, el select queda deshabilitado con un aviso.
function opcionesResponsable(candidatos, nombreGuardado, idSelect) {
  if (candidatos.length === 0) {
    return { disabled: true, html: `<option value="">No hay usuarios con este rol en tu organización</option>` };
  }
  const opciones = ['<option value="">Selecciona…</option>'];
  let seEncontroCoincidencia = false;
  for (const u of candidatos) {
    const seleccionado = nombreGuardado && u.nombre_completo === nombreGuardado;
    if (seleccionado) seEncontroCoincidencia = true;
    opciones.push(`<option value="${escaparAtributoHtml(u.nombre_completo)}" ${seleccionado ? 'selected' : ''}>${escHtml(u.nombre_completo)} (${u.rol})</option>`);
  }
  // Auto-seleccionar si hay un solo candidato posible y todavia no
  // hay nada guardado (no pisa una eleccion previa del admin).
  if (!seEncontroCoincidencia && !nombreGuardado && candidatos.length === 1) {
    opciones[1] = opciones[1].replace('>', ' selected>');
  }
  return { disabled: false, html: opciones.join('') };
}

function renderizar(org, resumen, usuarios) {
  const etiquetasPlan = { gratis: 'Gratis', profesional: 'Profesional', empresarial: 'Empresarial' };

  // "en el caso del responsable de SST estarán tanto médicos como sso":
  const candidatosSst = usuarios.filter(u => u.rol === 'medico' || u.rol === 'sso');
  // Responsable del Departamento Médico: solo médicos.
  const candidatosMedico = usuarios.filter(u => u.rol === 'medico');

  const optSst = opcionesResponsable(candidatosSst, org.responsable_sst_nombre, 'e-sst-nombre');
  const optMedico = opcionesResponsable(candidatosMedico, org.responsable_medico_nombre, 'e-medico-nombre');

  document.getElementById('contenido-empresa').innerHTML = `
    <div class="resumen-grid" style="margin-bottom:20px;">
      <div class="resumen-item"><div class="numero">${resumen.trabajadores_activos}</div><div class="etiqueta">Trabajadores activos</div></div>
      <div class="resumen-item"><div class="numero">${resumen.usuarios_activos}</div><div class="etiqueta">Usuarios del sistema</div></div>
      <div class="resumen-item"><div class="numero">${resumen.puestos_trabajo}</div><div class="etiqueta">Puestos de trabajo</div></div>
    </div>

    <div class="sector-caja">
      ${org.sector_empresarial_clave ? `
        <div class="sector-caja-info">
          <div class="sector-icono-grande">${escHtml(org.sector_icono || '🏢')}</div>
          <div>
            <div style="font-weight:700; font-size:13.5px;">${escHtml(org.sector_etiqueta || org.sector_empresarial_clave)}</div>
            <div style="font-size:11.5px; color:var(--t3);">${org.numero_trabajadores_declarado != null ? `${org.numero_trabajadores_declarado} trabajadores declarados · ` : ''}${org.pais_bandera ? `${org.pais_bandera} ${escHtml(org.pais_nombre || '')}${org.pais_estado === 'en_desarrollo' ? ' (normativa en desarrollo)' : ''} · ` : ''}Perfil sectorial configurado</div>
          </div>
        </div>
        <button class="sisso-boton secundario" data-on-click="abrirConfiguradorSectorial()">🧭 Editar configuración</button>
      ` : `
        <div class="sector-sin-configurar">Todavía no configuraste el perfil sectorial de tu empresa (riesgos, exámenes y EPP sugeridos según tu sector).</div>
        <button class="sisso-boton" data-on-click="abrirConfiguradorSectorial()">🧭 Configurar perfil sectorial</button>
      `}
    </div>

    <div class="logo-caja">
      <div class="logo-preview" id="logo-preview">
        ${org.logo_url ? `<img src="${org.logo_url}" alt="Logo">` : '<span style="font-size:11px;color:var(--t3);">Sin logo</span>'}
      </div>
      <div>
        <input type="file" id="input-logo" accept="image/*" style="display:none;" data-on-change="subirLogo(event)">
        <button class="sisso-boton secundario" data-on-click="sissoClickEn('input-logo')">📷 ${org.logo_url ? 'Cambiar' : 'Subir'} logo</button>
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
      <div class="sisso-campo">
        <label class="sisso-etiqueta">Responsable de SST — nombre</label>
        <select id="e-sst-nombre" class="sisso-select" ${optSst.disabled ? 'disabled' : ''}>${optSst.html}</select>
      </div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Responsable de SST — cargo</label><input id="e-sst-cargo" class="sisso-input" value="${escAttr(org.responsable_sst_cargo)}"></div>
      <!-- CREADO en Auditoria N.15 (pedido de la persona usuaria): "falta
           el responsable del Departamento Médico" -- el backend ya
           soportaba estos 2 campos (organizacionController.js,
           migracion 074) pero nunca se habian mostrado en esta pantalla. -->
      <div class="sisso-campo">
        <label class="sisso-etiqueta">Responsable del Departamento Médico — nombre</label>
        <select id="e-medico-nombre" class="sisso-select" ${optMedico.disabled ? 'disabled' : ''}>${optMedico.html}</select>
      </div>
      <div class="sisso-campo"><label class="sisso-etiqueta">Responsable del Departamento Médico — cargo</label><input id="e-medico-cargo" class="sisso-input" value="${escAttr(org.responsable_medico_cargo)}" placeholder="Ej: Médico Ocupacional"></div>
    </div>

    <button class="sisso-boton" id="btn-guardar" data-on-click="guardarPerfil()" style="margin-top:16px;">Guardar cambios</button>
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
    responsableMedicoNombre: document.getElementById('e-medico-nombre').value.trim() || undefined,
    responsableMedicoCargo: document.getElementById('e-medico-cargo').value.trim() || undefined,
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

// ------- Lote 1 (Sep 2026): enlace/QR del canal de reporte de peligro -------
async function cargarQrReportePeligro() {
  const cont = document.getElementById('contenido-qr-reporte');
  try {
    const datos = await sissoFetch('/organizacion/qr-reporte-peligro');
    cont.innerHTML = `
      <img src="${datos.qrDataUrl}" alt="Código QR del canal de reporte de peligro" style="width:180px;height:180px;display:block;margin:0 auto 12px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" class="sisso-input" readonly value="${escAttr(datos.url)}" id="enlace-reporte-peligro" style="flex:1;font-size:12px;">
        <button class="sisso-boton secundario" data-on-click="copiarEnlaceReporte()">Copiar</button>
      </div>`;
  } catch (err) {
    cont.innerHTML = '';
    mostrarError('qr-error', err.message || 'Error al generar el código QR.');
  }
}

async function copiarEnlaceReporte() {
  const campo = document.getElementById('enlace-reporte-peligro');
  if (!campo) return;
  try {
    await navigator.clipboard.writeText(campo.value);
    mostrarExito('qr-exito', 'Enlace copiado.');
  } catch (err) {
    campo.select();
    mostrarError('qr-error', 'No se pudo copiar automáticamente. Selecciona y copia el enlace manualmente.');
  }
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
