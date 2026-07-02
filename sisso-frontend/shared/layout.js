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

const SissoLayout = (() => {

  // Definicion completa del menu lateral, en el mismo orden que
  // el original. "roles" es la lista de roles que pueden VER ese
  // item — si el array esta vacio, lo ven todos los roles.
  const MENU = [
    { seccion: 'GENERAL' },
    { id: 'dashboard',    label: 'Dashboard',          icono: '⊞',  href: '../dashboard/index.html',      roles: [] },
    { id: 'empresa',      label: 'Mi Empresa',         icono: '🏢', href: '#',                          roles: ['admin'] },
    { id: 'trabajadores', label: 'Trabajadores',       icono: '👥', href: '../trabajadores/index.html',   roles: [] },
    { id: 'alertas',      label: 'Alertas',            icono: '🔔', href: '#',                          roles: [] },
    { id: 'calendario',   label: 'Calendario EMOs',    icono: '📅', href: '#',                          roles: [] },

    { seccion: 'CLÍNICO' },
    { id: 'emos',         label: 'EMOs / Aptitud',     icono: '🩺', href: '../aptitud/index.html',        roles: ['medico'] },
    { id: 'historia',     label: 'Historia clínica',   icono: '📋', href: '../aptitud/index.html',        roles: ['medico'] },
    { id: 'consentimientos', label: 'Consentimientos', icono: '✍️', href: '../consentimientos/index.html', roles: ['medico', 'sso', 'th'] },
    { id: 'audiometria',  label: 'Audiometría',        icono: '🔊', href: '#',                          roles: ['medico'] },
    { id: 'espirometria', label: 'Espirometría',       icono: '💨', href: '#',                          roles: ['medico'] },
    { id: 'visiometria',  label: 'Visiometría',        icono: '👁️', href: '#',                          roles: ['medico'] },

    { seccion: 'ERGONOMÍA' },
    { id: 'puestos',      label: 'Puestos de trabajo', icono: '🪑', href: '#',                          roles: ['medico', 'sso'] },
    { id: 'reba',         label: 'Calculadora REBA',   icono: '📐', href: '../reba/index.html',           roles: ['medico', 'sso'] },
    { id: 'rula',         label: 'Calculadora RULA',   icono: '📏', href: '../rula/index.html',           roles: ['medico', 'sso'] },
    { id: 'niosh',        label: 'Ecuación NIOSH',     icono: '⚖️', href: '#',                          roles: ['medico', 'sso'] },
    { id: 'nordico',      label: 'Cuestionario Nórdico', icono: '🗂️', href: '#',                        roles: ['medico', 'sso'] },

    { seccion: 'GESTIÓN' },
    { id: 'ausentismo',   label: 'Ausentismo',         icono: '📉', href: '#',                          roles: [] },
    { id: 'proximos',     label: 'Próximos exámenes',  icono: '⏰', href: '#',                          roles: [] },
    { id: 'matriz',       label: 'Matriz de riesgos',  icono: '🗂️', href: '#',                          roles: ['medico', 'sso'] },
    { id: 'reportes',     label: 'Reportes BI',        icono: '📊', href: '#',                          roles: ['medico', 'sso'] },
    { id: 'indicadores',  label: 'Indicadores SSO',    icono: '📈', href: '#',                          roles: [] },
    { id: 'certificados', label: 'Certificados PDF',   icono: '📄', href: '#',                          roles: [] },

    { seccion: 'SISTEMA' },
    { id: 'configuracion', label: 'Configuración',     icono: '⚙️', href: '../configuracion/index.html', roles: ['admin'] },
  ];

  function puedeVerItem(item, rol) {
    return !item.roles || item.roles.length === 0 || item.roles.includes(rol);
  }

  function construirSidebar(moduloActivo, usuario) {
    const itemsHtml = MENU.map(item => {
      // Es un separador de seccion, no un item de menu
      if (item.seccion) {
        return `<div class="sisso-nav-seccion">${item.seccion}</div>`;
      }

      if (!puedeVerItem(item, usuario.rol)) return '';

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
      <div class="sisso-sidebar">
        <div class="sisso-sidebar-logo">
          <div class="sisso-sidebar-icono">S</div>
          <div>
            <div class="sisso-sidebar-nombre">SISSO</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);">${usuario.organizacion?.nombre || 'Sistema'}</div>
          </div>
        </div>
        ${itemsHtml}
        <div style="margin-top:auto;padding:12px;border-top:1px solid rgba(255,255,255,.06);">
          <div style="font-size:11px;color:rgba(255,255,255,.3);margin-bottom:8px;padding:0 4px;">
            ${usuario.nombreCompleto}
            <span style="display:block;font-size:10px;margin-top:1px;">${usuario.rol?.toUpperCase()}</span>
          </div>
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
