// ============================================================
// SISSO - Modulo compartido de layout.
//
// Inyecta el sidebar (menu lateral) y el topbar en cada pagina
// interna. Cada pagina llama a SissoLayout.iniciar('reba') y
// este modulo construye el HTML del menu, marca el item activo,
// oculta los items que el rol del usuario actual no debe ver,
// y agrega el boton de cerrar sesion.
//
// Por que un solo archivo: si se agrega un modulo nuevo al menu,
// se agrega aqui una vez y aparece en TODAS las paginas.
// ============================================================

// ------------------------------------------------------------
// CORREGIDO tras auditoria de seguridad (hallazgo G9): esta funcion
// es global (no esta dentro del IIFE de SissoLayout) a proposito,
// para que cualquier modulo que cargue shared/layout.js (es decir,
// todas las paginas internas) tenga una unica funcion de escape de
// HTML disponible, en vez de que cada modulo defina su propia copia
// local (escHtml, escCert, escHtmlBI, etc. — que hoy siguen
// existiendo en varios modulos y funcionan bien, pero duplican la
// misma logica). Los modulos nuevos deberian usar esta en vez de
// definir una copia propia.
//
// Por que hace falta: este archivo interpola datos que vienen de la
// base de datos (nombre de la organizacion, nombre del usuario)
// directamente en innerHTML sin escapar (ver construirSidebar mas
// abajo). Como layout.js corre en CADA pagina autenticada, un
// nombre de organizacion o de usuario con HTML/JS embebido
// ejecutaria ese script en el navegador de TODOS los usuarios de esa
// organizacion, en cada carga de pagina — un XSS persistente con
// alcance amplio. Escapar antes de interpolar neutraliza eso.
// ------------------------------------------------------------
function escaparHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SissoLayout = (() => {

  // Definicion completa del menu lateral, en el mismo orden que
  // el original. "roles" es la lista de roles que pueden VER ese
  // item — si el array esta vacio, lo ven todos los roles.
  const MENU = [
    { seccion: 'GENERAL' },

    { id: 'dashboard',    label: 'Dashboard',          icono: '⊞',  href: '../dashboard/index.html',      roles: [] },
    { id: 'empresa',      label: 'Mi Empresa',         icono: '🏢', href: '../mi-empresa/index.html',   roles: ['admin'] },
    { id: 'trabajadores', label: 'Trabajadores',       icono: '👥', href: '../trabajadores/index.html',   roles: [] },
    { id: 'alertas',      label: 'Alertas',            icono: '🔔', href: '../alertas/index.html',      roles: [] },
    { id: 'calendario',   label: 'Calendario EMOs',    icono: '📅', href: '../calendario-emos/index.html', roles: [] },

    { seccion: 'CLÍNICO' },
    { id: 'emos',         label: 'EMOs / Aptitud',     icono: '🩺', href: '../aptitud/index.html',        roles: ['medico'] },
    { id: 'historia',     label: 'Historia clínica',   icono: '📋', href: '../historia-clinica/index.html', roles: ['medico'] },
    { id: 'consentimientos', label: 'Consentimientos', icono: '✍️', href: '../consentimientos/index.html', roles: ['medico', 'sso', 'th'] },
    { id: 'audiometria',  label: 'Audiometría',        icono: '🔊', href: '../audiometria/index.html', roles: ['medico'] },
    { id: 'espirometria', label: 'Espirometría',       icono: '💨', href: '../espirometria/index.html', roles: ['medico'] },
    { id: 'visiometria',  label: 'Visiometría',        icono: '👁️', href: '../visiometria/index.html',  roles: ['medico'] },
    // CORREGIDO tras Auditoria SISSO N.06 (puntos 17 y 25): modulos
    // medicos nuevos. "enfermedad-profesional" es exclusivo del
    // medico (SSO tiene su propia vista preventiva agregada, sin
    // acceso clinico, dentro del mismo modulo). "restricciones" la
    // ve tambien SSO/TH pero en modo solo-lectura de la medida
    // laboral (nunca el motivo clinico) — ver restriccionesMedicasController.js.
    { id: 'enfermedad-profesional', label: 'Enfermedad profesional', icono: '🧬', href: '../enfermedad-profesional/index.html', roles: ['medico', 'sso'] },
    { id: 'restricciones', label: 'Restricciones médicas', icono: '🚧', href: '../restricciones-medicas/index.html', roles: ['medico', 'sso', 'th'] },
    // CORREGIDO tras Auditoria SISSO N.06 (puntos 15 y 16 / CRITICO
    // 2 y CRITICO 4). Matriz medico-ocupacional: solo medico (decide
    // que vigilancia clinica recibe cada puesto). Vigilancia de la
    // salud: medico gestiona, sso solo lee (datos ya agregados).
    { id: 'matriz-medico-puesto', label: 'Matriz médico-puesto', icono: '🗂️', href: '../matriz-medico-puesto/index.html', roles: ['medico'] },
    { id: 'vigilancia-salud', label: 'Vigilancia de la salud', icono: '📊', href: '../vigilancia-salud/index.html', roles: ['medico', 'sso'] },

    { seccion: 'ERGONOMÍA' },
    { id: 'puestos',      label: 'Puestos de trabajo', icono: '🪑', href: '../puestos-trabajo/index.html', roles: ['admin', 'medico', 'sso', 'th'] },
    { id: 'reba',         label: 'Calculadora REBA',   icono: '📐', href: '../reba/index.html',           roles: ['medico', 'sso'] },
    { id: 'rula',         label: 'Calculadora RULA',   icono: '📏', href: '../rula/index.html',           roles: ['medico', 'sso'] },
    { id: 'niosh',        label: 'Ecuación NIOSH',     icono: '⚖️', href: '../niosh/index.html',        roles: ['medico', 'sso'] },
    { id: 'nordico',      label: 'Cuestionario Nórdico', icono: '🗂️', href: '../nordico/index.html',    roles: ['medico', 'sso'] },

    { seccion: 'GESTIÓN' },
    { id: 'ausentismo',   label: 'Ausentismo',         icono: '📉', href: '../ausentismo/index.html',  roles: [] },
    // CORREGIDO tras Auditoria SISSO N.06 (punto 18 / CRITICO 1):
    // ciclo integral de accidentes/incidentes/casi accidentes.
    // Gestion (crear/investigar/accionar) restringida a admin/sso en
    // el backend; el menu queda visible a todos porque cualquier
    // usuario autenticado puede LEER (mismo criterio que ausentismo).
    { id: 'accidentes',   label: 'Accidentes/Incidentes', icono: '🚨', href: '../accidentes/index.html', roles: [] },
    { id: 'capa',         label: 'CAPA',                icono: '🔁', href: '../capa/index.html', roles: [] },
    { id: 'inspecciones', label: 'Inspecciones',        icono: '🔎', href: '../inspecciones/index.html', roles: [] },
    { id: 'proximos',     label: 'Próximos exámenes',  icono: '⏰', href: '../calendario-emos/index.html', roles: [] },
    { id: 'matriz',       label: 'Matriz de riesgos',  icono: '🗂️', href: '../matriz-riesgos/index.html', roles: ['admin', 'medico', 'sso', 'th'] },
    { id: 'reportes',     label: 'Reportes BI',        icono: '📊', href: '../reportes-bi/index.html', roles: [] },
    { id: 'indicadores',  label: 'Indicadores SSO',    icono: '📈', href: '../indicadores/index.html',  roles: [] },
    { id: 'certificados', label: 'Certificados PDF',   icono: '📄', href: '../certificados-pdf/index.html', roles: [] },

    { seccion: 'SISTEMA' },
    { id: 'configuracion', label: 'Configuración',     icono: '⚙️', href: '../configuracion/index.html', roles: ['admin'] },
  ];

  function puedeVerItem(item, rol) {
    return !item.roles || item.roles.length === 0 || item.roles.includes(rol);
  }

  // CORREGIDO (mejora de UX solicitada: "el menu es muy largo, que
  // cada seccion se pueda contraer/expandir"). Se guarda que
  // secciones estan colapsadas en localStorage (no sessionStorage:
  // asi la preferencia se mantiene entre sesiones, no solo mientras
  // dura la pestana) bajo una clave por usuario, para que cada quien
  // recuerde su propia preferencia en un equipo compartido.
  function claveColapso(usuario) {
    return `sisso_secciones_colapsadas_${usuario.id}`;
  }

  function leerSeccionesColapsadas(usuario) {
    try {
      return new Set(JSON.parse(localStorage.getItem(claveColapso(usuario)) || '[]'));
    } catch {
      return new Set();
    }
  }

  function guardarSeccionesColapsadas(usuario, set) {
    try {
      localStorage.setItem(claveColapso(usuario), JSON.stringify([...set]));
    } catch { /* localStorage no disponible (modo privado, etc.): no es critico */ }
  }

  // Agrupa el MENU plano en secciones, filtrando por rol y
  // descartando secciones que terminan sin ningun item visible (por
  // ejemplo, un rol que no ve nada de "CLÍNICO" no deberia ver un
  // encabezado "CLÍNICO" vacio colgando en su sidebar).
  function agruparPorSeccion(usuario) {
    const secciones = [];
    let actual = null;
    for (const item of MENU) {
      if (item.seccion) {
        actual = { nombre: item.seccion, items: [] };
        secciones.push(actual);
        continue;
      }
      if (puedeVerItem(item, usuario.rol) && actual) {
        actual.items.push(item);
      }
    }
    return secciones.filter((s) => s.items.length > 0);
  }

  function construirSidebar(moduloActivo, usuario) {
    const secciones = agruparPorSeccion(usuario);
    const colapsadas = leerSeccionesColapsadas(usuario);
    // La seccion que contiene el modulo activo siempre se ve
    // expandida al cargar la pagina, sin importar la preferencia
    // guardada -- perderse de vista donde uno esta parado seria peor
    // que el menu largo que esto intenta arreglar.
    const seccionActiva = secciones.find((s) => s.items.some((it) => it.id === moduloActivo));

    const seccionesHtml = secciones.map((seccion) => {
      const estaColapsada = colapsadas.has(seccion.nombre) && seccion !== seccionActiva;
      const itemsHtml = seccion.items.map((item) => {
        const estaActivo = item.id === moduloActivo;
        const esPendiente = item.href === '#';
        return `<a
          href="${item.href}"
          class="sisso-nav-item${estaActivo ? ' activo' : ''}${esPendiente ? ' pendiente' : ''}"
          ${esPendiente ? 'onclick="return false;" title="Próximamente"' : ''}
          style="${esPendiente ? 'opacity:.4;cursor:not-allowed;' : ''}"
        >
          <span style="width:18px;text-align:center">${item.icono}</span>
          <span>${item.label}</span>
          ${esPendiente ? '<span style="margin-left:auto;font-size:9px;font-weight:700;background:rgba(255,255,255,.12);color:rgba(255,255,255,.4);padding:1px 5px;border-radius:8px">PRONTO</span>' : ''}
        </a>`;
      }).join('');

      return `
        <button type="button" class="sisso-nav-seccion-btn" aria-expanded="${!estaColapsada}" onclick="sissoToggleSeccion(this, '${escaparHtml(seccion.nombre)}')">
          <span class="sisso-nav-seccion">${escaparHtml(seccion.nombre)}</span>
          <span class="sisso-nav-seccion-flecha">▼</span>
        </button>
        <div class="sisso-nav-seccion-items${estaColapsada ? ' colapsada' : ''}">${itemsHtml}</div>`;
    }).join('');

    const org = usuario.organizacion || {};
    const franjaEmpresa = org.logoUrl
      ? `<div class="sisso-sidebar-empresa">
           <img src="${escaparHtml(org.logoUrl)}" alt="${escaparHtml(org.nombre)}" class="sisso-sidebar-empresa-logo">
           <span class="sisso-sidebar-empresa-nombre">${escaparHtml(org.nombre) || 'Empresa'}</span>
         </div>`
      : `<div class="sisso-sidebar-empresa">
           <span class="sisso-sidebar-empresa-nombre">${escaparHtml(org.nombre) || 'Sistema'}</span>
         </div>`;

    return `
      <div class="sisso-sidebar">
        <div class="sisso-sidebar-logo">
          <img src="../shared/logo.png" alt="SISSO" class="sisso-sidebar-logo-img">
          <div class="sisso-sidebar-nombre">SISSO</div>
        </div>
        ${franjaEmpresa}
        ${seccionesHtml}
        <div style="margin-top:auto;padding:12px;border-top:1px solid rgba(255,255,255,.06);">
          <div style="font-size:11px;color:rgba(255,255,255,.3);margin-bottom:8px;padding:0 4px;">
            ${escaparHtml(usuario.nombreCompleto)}
            <span style="display:block;font-size:10px;margin-top:1px;">${escaparHtml(usuario.rol?.toUpperCase())}</span>
          </div>
          <button onclick="sissoAbrirCambioPassword()" style="width:100%;padding:7px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.6);border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:6px;">
            Cambiar mi contraseña
          </button>
          <button onclick="sissoAbrirMfa()" style="width:100%;padding:7px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.6);border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:6px;">
            Verificación en 2 pasos
          </button>
          <button onclick="sissoAbrirSesiones()" style="width:100%;padding:7px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.6);border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:6px;">
            Sesiones activas
          </button>
          <button onclick="sissoCerrarSesionConConfirmacion()" style="width:100%;padding:7px;background:rgba(220,38,38,.15);color:#fca5a5;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">
            Cerrar sesión
          </button>
        </div>
      </div>`;
  }

  function construirTopbar(tituloModulo) {
    return `
      <div class="sisso-topbar">
        <span class="sisso-topbar-titulo">${tituloModulo}</span>
        <div class="sisso-topbar-derecha" id="sisso-topbar-acciones">
          <!-- Las paginas individuales pueden inyectar botones aqui con SissoLayout.agregarAccionTopbar() -->
        </div>
      </div>`;
  }

  return {
    /**
     * Inicializa el layout en la pagina actual.
     * Debe llamarse despues de que el DOM cargue (en DOMContentLoaded).
     *
     * @param {string} moduloActivo - id del modulo actual (ej: 'reba')
     * @param {string} tituloModulo - texto a mostrar en el topbar (ej: 'Calculadora REBA')
     * @param {string} [contenedorId='sisso-app'] - id del div raiz donde se inyecta el layout
     */
    iniciar(moduloActivo, tituloModulo, contenedorId = 'sisso-app') {
      // Verificar sesion activa (si no hay, redirige al login automaticamente)
      sissoRequerirSesion();

      const usuario = SissoSesion.obtenerUsuario();
      const contenedor = document.getElementById(contenedorId);
      if (!contenedor) {
        console.error(`SissoLayout.iniciar: no se encontro el elemento con id="${contenedorId}"`);
        return;
      }

      // Construir el layout y dejar el contenido de la pagina dentro de .sisso-contenido
      const htmlContenidoPagina = contenedor.innerHTML;
      contenedor.innerHTML = `
        <div class="sisso-layout">
          ${construirSidebar(moduloActivo, usuario)}
          <div class="sisso-main">
            ${construirTopbar(tituloModulo)}
            <div class="sisso-contenido">
              ${htmlContenidoPagina}
            </div>
          </div>
        </div>`;

      // Si el admin le reseteo la contrasena a este usuario, se le
      // exige elegir una propia ANTES de poder usar el resto del
      // sistema, en cualquier pagina (por eso vive aqui, en el
      // layout compartido, y no en una sola pagina).
      if (usuario.requiereCambioPassword) {
        sissoMostrarModalCambioPassword(true);
      }
    },

    /**
     * Agrega un boton u otro elemento HTML a la zona de acciones del topbar.
     * Se llama despues de SissoLayout.iniciar(), desde el modulo especifico.
     * @param {string} html
     */
    agregarAccionTopbar(html) {
      const zona = document.getElementById('sisso-topbar-acciones');
      if (zona) zona.insertAdjacentHTML('beforeend', html);
    },
  };
})();

/**
 * Pide confirmacion antes de cerrar la sesion.
 * Esta funcion esta en el scope global porque la llama un onclick
 * generado dinamicamente dentro del sidebar.
 */
async function sissoCerrarSesionConConfirmacion() {
  if (confirm('¿Deseas cerrar tu sesión?')) {
    await sissoCerrarSesion();
  }
}

/**
 * Contrae/expande una seccion del sidebar y recuerda la preferencia
 * en localStorage (por usuario) para las proximas visitas. Global
 * por el mismo motivo que sissoCerrarSesionConConfirmacion: la llama
 * un onclick generado dinamicamente dentro del sidebar.
 */
function sissoToggleSeccion(boton, nombreSeccion) {
  const usuario = SissoSesion.obtenerUsuario();
  if (!usuario) return;

  const contenedor = boton.nextElementSibling;
  const clave = `sisso_secciones_colapsadas_${usuario.id}`;
  let colapsadas;
  try {
    colapsadas = new Set(JSON.parse(localStorage.getItem(clave) || '[]'));
  } catch {
    colapsadas = new Set();
  }

  const vaAColapsarse = !contenedor.classList.contains('colapsada');
  contenedor.classList.toggle('colapsada', vaAColapsarse);
  boton.setAttribute('aria-expanded', String(!vaAColapsarse));

  if (vaAColapsarse) colapsadas.add(nombreSeccion);
  else colapsadas.delete(nombreSeccion);

  try {
    localStorage.setItem(clave, JSON.stringify([...colapsadas]));
  } catch { /* localStorage no disponible: no es critico, solo no se recuerda la preferencia */ }
}

/**
 * Boton "Cambiar mi contraseña" del sidebar: abre el mismo modal
 * que el flujo forzado, pero sin bloquear el resto de la pantalla
 * (el usuario puede cancelar si cambio de opinion).
 */
function sissoAbrirCambioPassword() {
  sissoMostrarModalCambioPassword(false);
}

/**
 * Inyecta y muestra el modal de cambio de contrasena.
 *
 * @param {boolean} forzado - si es true, no se puede cancelar ni
 *   cerrar sin completar el cambio (caso: admin reseteo la
 *   contrasena y el sistema exige que el usuario elija una propia
 *   antes de continuar).
 */
function sissoMostrarModalCambioPassword(forzado) {
  // Evita duplicar el modal si ya esta abierto.
  if (document.getElementById('sisso-modal-cambiar-password')) return;

  const html = `
    <div id="sisso-modal-cambiar-password" style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;">
      <div style="background:#fff;border-radius:14px;padding:26px;width:420px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="font-size:16px;font-weight:800;margin-bottom:6px;">${forzado ? 'Debes cambiar tu contraseña' : 'Cambiar mi contraseña'}</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:18px;">
          ${forzado
            ? 'Un administrador reseteó tu contraseña. Elige una nueva antes de continuar.'
            : 'Ingresa tu contraseña actual y la nueva contraseña.'}
        </div>
        <div id="sisso-cp-error" style="display:none;background:#fef2f2;color:#b91c1c;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px;"></div>

        <label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:5px;">Contraseña actual (o la temporal que te dieron)</label>
        <input id="sisso-cp-actual" type="password" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:14px;box-sizing:border-box;font-family:inherit;">

        <label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:5px;">Nueva contraseña (mínimo 12 caracteres)</label>
        <input id="sisso-cp-nueva" type="password" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:20px;box-sizing:border-box;font-family:inherit;">

        <div style="display:flex;gap:10px;justify-content:flex-end;">
          ${forzado ? '' : '<button onclick="sissoCerrarModalCambioPassword()" style="padding:11px 18px;background:#fff;color:#334155;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Cancelar</button>'}
          <button id="sisso-cp-boton" onclick="sissoConfirmarCambioPassword(${forzado})" style="padding:11px 18px;background:#0d9488;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Guardar nueva contraseña</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('sisso-cp-actual').focus();
}

function sissoCerrarModalCambioPassword() {
  const el = document.getElementById('sisso-modal-cambiar-password');
  if (el) el.remove();
}

async function sissoConfirmarCambioPassword(forzado) {
  const errorEl = document.getElementById('sisso-cp-error');
  errorEl.style.display = 'none';

  const passwordActual = document.getElementById('sisso-cp-actual').value;
  const passwordNueva = document.getElementById('sisso-cp-nueva').value;

  if (!passwordActual || !passwordNueva) {
    errorEl.textContent = 'Completa ambos campos.';
    errorEl.style.display = 'block';
    return;
  }
  if (passwordNueva.length < 12) {
    errorEl.textContent = 'La nueva contraseña debe tener al menos 12 caracteres.';
    errorEl.style.display = 'block';
    return;
  }
  if (passwordNueva === passwordActual) {
    errorEl.textContent = 'La nueva contraseña debe ser diferente de la actual.';
    errorEl.style.display = 'block';
    return;
  }

  const boton = document.getElementById('sisso-cp-boton');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch('/auth/cambiar-password', {
      method: 'PUT',
      body: { passwordActual, passwordNueva }
    });

    // Actualizamos la sesion local para que ya no vuelva a pedirse.
    // CORREGIDO: sessionStorage en vez de localStorage (ver nota de
    // seguridad en shared/api.js).
    const usuario = SissoSesion.obtenerUsuario();
    if (usuario) {
      usuario.requiereCambioPassword = false;
      sessionStorage.setItem('sisso_usuario', JSON.stringify(usuario));
    }

    sissoCerrarModalCambioPassword();
  } catch (err) {
    errorEl.textContent = err.message || 'Error al cambiar la contraseña.';
    errorEl.style.display = 'block';
    boton.disabled = false;
    boton.textContent = 'Guardar nueva contraseña';
  }
}

// ------------------------------------------------------------
// Verificacion en 2 pasos (MFA / TOTP).
// Boton "Verificación en 2 pasos" del sidebar. El modal se adapta
// segun el estado actual: si el usuario NO tiene MFA, muestra el
// QR para activarlo; si YA lo tiene, muestra la opcion de
// desactivarlo (pidiendo la contrasena, ver
// authController.js:deshabilitarMfa).
// ------------------------------------------------------------
async function sissoAbrirMfa() {
  if (document.getElementById('sisso-modal-mfa')) return;

  const html = `
    <div id="sisso-modal-mfa" style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;">
      <div style="background:#fff;border-radius:14px;padding:26px;width:420px;max-width:92vw;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="font-size:16px;font-weight:800;margin-bottom:6px;">Verificación en 2 pasos</div>
        <div id="sisso-mfa-contenido" style="font-size:13px;color:#64748b;">Cargando…</div>
        <div style="display:flex;justify-content:flex-end;margin-top:18px;">
          <button onclick="sissoCerrarModalMfa()" style="padding:11px 18px;background:#fff;color:#334155;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Cerrar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  try {
    const perfil = await sissoFetch('/auth/perfil');
    if (perfil.usuario.mfaHabilitado) {
      sissoRenderizarMfaActivo();
    } else {
      await sissoRenderizarMfaSetup();
    }
  } catch (err) {
    document.getElementById('sisso-mfa-contenido').innerHTML =
      `<div style="background:#fef2f2;color:#b91c1c;padding:10px 12px;border-radius:8px;">Error al cargar: ${escaparHtml(err.message)}</div>`;
  }
}

function sissoCerrarModalMfa() {
  const el = document.getElementById('sisso-modal-mfa');
  if (el) el.remove();
}

function sissoRenderizarMfaActivo() {
  document.getElementById('sisso-mfa-contenido').innerHTML = `
    <div style="background:#f0fdf4;color:#166534;padding:10px 12px;border-radius:8px;margin-bottom:16px;font-weight:700;">✓ La verificación en 2 pasos está activa en tu cuenta.</div>
    <div id="sisso-mfa-error" style="display:none;background:#fef2f2;color:#b91c1c;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px;"></div>
    <label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:5px;">Escribe tu contraseña para desactivarla</label>
    <input id="sisso-mfa-password" type="password" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:12px;box-sizing:border-box;font-family:inherit;">
    <label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:5px;">Código de tu app de autenticación</label>
    <input id="sisso-mfa-codigo-desactivar" type="text" inputmode="numeric" maxlength="6" placeholder="000000" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:16px;text-align:center;letter-spacing:4px;margin-bottom:12px;box-sizing:border-box;font-family:inherit;">
    <button id="sisso-mfa-btn-desactivar" onclick="sissoDesactivarMfa()" style="width:100%;padding:11px;background:#fef2f2;color:#b91c1c;border:1.5px solid #fecaca;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Desactivar verificación en 2 pasos</button>`;
}

// CORREGIDO tras auditoria de seguridad (hallazgo CRITICO): ahora se
// exige contrasena + codigo TOTP vigente, no solo contrasena (ver
// authController.js:deshabilitarMfa para el detalle de por que).
async function sissoDesactivarMfa() {
  const errorEl = document.getElementById('sisso-mfa-error');
  errorEl.style.display = 'none';
  const password = document.getElementById('sisso-mfa-password').value;
  const codigo = document.getElementById('sisso-mfa-codigo-desactivar').value.trim();
  if (!password) {
    errorEl.textContent = 'Ingresa tu contraseña.';
    errorEl.style.display = 'block';
    return;
  }
  if (!codigo) {
    errorEl.textContent = 'Ingresa el código de 6 dígitos de tu app de autenticación.';
    errorEl.style.display = 'block';
    return;
  }
  const boton = document.getElementById('sisso-mfa-btn-desactivar');
  boton.disabled = true;
  boton.textContent = 'Desactivando…';
  try {
    await sissoFetch('/auth/mfa/deshabilitar', { method: 'POST', body: { password, codigo } });
    sissoCerrarModalMfa();
  } catch (err) {
    errorEl.textContent = err.message || 'Error al desactivar.';
    errorEl.style.display = 'block';
    boton.disabled = false;
    boton.textContent = 'Desactivar verificación en 2 pasos';
  }
}

async function sissoRenderizarMfaSetup() {
  const datos = await sissoFetch('/auth/mfa/iniciar-configuracion', { method: 'POST' });
  document.getElementById('sisso-mfa-contenido').innerHTML = `
    <p style="margin:0 0 12px;">1. Escanea este código con Google Authenticator, Authy o similar:</p>
    <div style="text-align:center;margin-bottom:14px;">
      <img src="${datos.qrCodeDataUrl}" alt="Código QR de MFA" style="width:180px;height:180px;border:1px solid #e2e8f0;border-radius:8px;">
      <div style="font-size:11px;color:#94a3b8;margin-top:6px;">¿No puedes escanear? Código manual: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${datos.secreto}</code></div>
    </div>
    <p style="margin:0 0 8px;">2. Escribe el código de 6 dígitos que te muestra la app para confirmar:</p>
    <div id="sisso-mfa-error" style="display:none;background:#fef2f2;color:#b91c1c;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:12px;"></div>
    <input id="sisso-mfa-codigo" type="text" inputmode="numeric" maxlength="6" placeholder="000000" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:16px;text-align:center;letter-spacing:4px;margin-bottom:14px;box-sizing:border-box;font-family:inherit;">
    <button id="sisso-mfa-btn-confirmar" onclick="sissoConfirmarMfaSetup()" style="width:100%;padding:11px;background:#0d9488;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Activar verificación en 2 pasos</button>`;
  document.getElementById('sisso-mfa-codigo').focus();
}

async function sissoConfirmarMfaSetup() {
  const errorEl = document.getElementById('sisso-mfa-error');
  errorEl.style.display = 'none';
  const codigo = document.getElementById('sisso-mfa-codigo').value.trim();
  if (!codigo || codigo.length !== 6) {
    errorEl.textContent = 'Ingresa el código de 6 dígitos.';
    errorEl.style.display = 'block';
    return;
  }
  const boton = document.getElementById('sisso-mfa-btn-confirmar');
  boton.disabled = true;
  boton.textContent = 'Verificando…';
  try {
    await sissoFetch('/auth/mfa/confirmar', { method: 'POST', body: { codigo } });
    sissoRenderizarMfaActivo();
  } catch (err) {
    errorEl.textContent = err.message || 'Código incorrecto.';
    errorEl.style.display = 'block';
    boton.disabled = false;
    boton.textContent = 'Activar verificación en 2 pasos';
  }
}

// ------------------------------------------------------------
// Gestión de sesiones activas (hallazgo MODERADO de la auditoría).
// Botón "Sesiones activas" del sidebar: lista los dispositivos con
// sesión abierta (ver GET /api/auth/sesiones en authController.js)
// y permite cerrar cualquiera de ellos individualmente, o todos los
// demás de una vez, sin tener que esperar a que expiren solos.
// ------------------------------------------------------------
async function sissoAbrirSesiones() {
  if (document.getElementById('sisso-modal-sesiones')) return;

  const html = `
    <div id="sisso-modal-sesiones" style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;">
      <div style="background:#fff;border-radius:14px;padding:26px;width:460px;max-width:92vw;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="font-size:16px;font-weight:800;margin-bottom:6px;">Sesiones activas</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:14px;">Dispositivos donde tu cuenta tiene una sesión abierta actualmente.</div>
        <div id="sisso-sesiones-contenido" style="font-size:13px;color:#64748b;">Cargando…</div>
        <div style="display:flex;justify-content:space-between;margin-top:18px;gap:8px;">
          <button id="sisso-sesiones-btn-cerrar-otras" onclick="sissoRevocarOtrasSesiones()" style="padding:9px 14px;background:#fef2f2;color:#b91c1c;border:1.5px solid #fecaca;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">
            Cerrar todas las demás
          </button>
          <button onclick="sissoCerrarModalSesiones()" style="padding:9px 16px;background:#fff;color:#334155;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cerrar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  await sissoCargarSesiones();
}

function sissoCerrarModalSesiones() {
  const el = document.getElementById('sisso-modal-sesiones');
  if (el) el.remove();
}

function sissoFormatearFechaHoraSesion(fechaISO) {
  if (!fechaISO) return '—';
  const f = new Date(fechaISO);
  return f.toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Resumen legible del user agent (no pretende ser un parser preciso
// de dispositivos, solo dar una pista util a simple vista: navegador
// + sistema operativo aproximado).
function sissoResumenDispositivo(userAgent) {
  if (!userAgent) return 'Dispositivo desconocido';
  let so = 'Dispositivo';
  if (/windows/i.test(userAgent)) so = 'Windows';
  else if (/mac os/i.test(userAgent)) so = 'macOS';
  else if (/android/i.test(userAgent)) so = 'Android';
  else if (/iphone|ipad/i.test(userAgent)) so = 'iOS';
  else if (/linux/i.test(userAgent)) so = 'Linux';

  let navegador = 'Navegador';
  if (/edg\//i.test(userAgent)) navegador = 'Edge';
  else if (/chrome\//i.test(userAgent)) navegador = 'Chrome';
  else if (/firefox\//i.test(userAgent)) navegador = 'Firefox';
  else if (/safari\//i.test(userAgent)) navegador = 'Safari';

  return `${navegador} · ${so}`;
}

async function sissoCargarSesiones() {
  const cont = document.getElementById('sisso-sesiones-contenido');
  try {
    const datos = await sissoFetch('/auth/sesiones');
    if (!datos.sesiones || datos.sesiones.length === 0) {
      cont.innerHTML = '<div>No hay sesiones activas.</div>';
      return;
    }

    cont.innerHTML = datos.sesiones.map((s) => `
      <div style="border:1.5px solid ${s.esSesionActual ? '#99f6e4' : '#e2e8f0'};background:${s.esSesionActual ? '#f0fdfa' : '#fff'};border-radius:10px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:13px;color:#1e293b;">
              ${escaparHtml(sissoResumenDispositivo(s.userAgent))}
              ${s.esSesionActual ? '<span style="margin-left:6px;font-size:10px;font-weight:700;background:#0d9488;color:#fff;padding:1px 6px;border-radius:8px;">ESTA SESIÓN</span>' : ''}
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:3px;">
              Iniciada: ${sissoFormatearFechaHoraSesion(s.creadoEn)}
              ${s.ipOrigen ? ` · IP: ${escaparHtml(s.ipOrigen)}` : ''}
            </div>
          </div>
          ${s.esSesionActual ? '' : `<button onclick="sissoRevocarSesion('${escaparHtml(s.familiaId)}')" style="flex-shrink:0;padding:5px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Cerrar</button>`}
        </div>
      </div>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<div style="background:#fef2f2;color:#b91c1c;padding:10px 12px;border-radius:8px;">Error al cargar: ${escaparHtml(err.message)}</div>`;
  }
}

async function sissoRevocarSesion(familiaId) {
  try {
    await sissoFetch(`/auth/sesiones/${encodeURIComponent(familiaId)}`, { method: 'DELETE' });
    await sissoCargarSesiones();
  } catch (err) {
    alert(err.message || 'No se pudo cerrar esa sesión.');
  }
}

async function sissoRevocarOtrasSesiones() {
  if (!confirm('¿Cerrar todas las demás sesiones? Los otros dispositivos tendrán que iniciar sesión de nuevo.')) return;
  const boton = document.getElementById('sisso-sesiones-btn-cerrar-otras');
  boton.disabled = true;
  boton.textContent = 'Cerrando…';
  try {
    await sissoFetch('/auth/sesiones', { method: 'DELETE' });
    await sissoCargarSesiones();
  } catch (err) {
    alert(err.message || 'No se pudieron cerrar las sesiones.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Cerrar todas las demás';
  }
}
