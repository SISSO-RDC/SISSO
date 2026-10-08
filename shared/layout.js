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

// ------------------------------------------------------------
// CORREGIDO en Auditoria N.15 (hallazgo MODERADO M15-10): tres
// modulos (mi-empresa.js, historia-clinica.js, puestos-trabajo.js)
// definian su propia copia local de una funcion "escAttr", con DOS
// implementaciones distintas segun el contexto donde se usaba --
// ninguna de las dos estaba mal para SU caso concreto, pero la
// duplicacion es exactamente el riesgo que describe el hallazgo: la
// proxima persona que copie una de las dos versiones al contexto
// equivocado introduciria una falla de escape real. Se centralizan
// ambas variantes aqui, con nombres que dejan claro CUANDO usar cada
// una -- no se puede tener una sola funcion "correcta para todo"
// porque los dos contextos tienen requisitos de escape distintos e
// incompatibles entre si (ver el comentario de cada una).
//
// escaparAtributoHtml: para un valor que va dentro de un atributo
// HTML normal (value="...", title="...", data-x="..."), SIN
// anidarlo ademas en un string de JavaScript. Uso tipico:
//   `<input value="${escaparAtributoHtml(dato)}">`
function escaparAtributoHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// escaparValorOnclickJs: para un valor que va DENTRO de un string
// JavaScript de comillas simples que a su vez esta dentro de un
// atributo de evento HTML entre comillas dobles, ej:
//   `<button data-on-click="accionEjemplo('${escaparValorOnclickJs(dato)}')">`
// (desde la Auditoria N.18 los atributos onclick/onchange/oninput se
// llaman data-on-click/data-on-change/data-on-input y los ejecuta el
// delegador de shared/csp-eventos.js, sin eval; el formato del valor
// no cambia).
// IMPORTANTE: escapar la comilla simple como entidad HTML (&#39;)
// NO alcanza aqui, a diferencia de escaparAtributoHtml -- el
// navegador decodifica las entidades HTML del atributo ANTES de que
// el delegador lea el texto de la expresion, asi que &#39; se
// convertiria de vuelta en un caracter ' literal justo a tiempo para
// romper el string, igual que si nunca se hubiera escapado. Por eso
// esta funcion escapa la comilla simple con una barra invertida
// (escape de string de JS), no con una entidad HTML, y ademas escapa
// la barra invertida misma primero (para que un valor que ya
// contenga "\'" no pueda forjar una comilla sin escapar).
//
// Todo caso nuevo de este patron DEBE usar esta funcion, nunca una
// copia local. Para valores complejos (objetos, texto libre largo)
// se puede usar escaparAtributoHtml(JSON.stringify(valor)): el
// delegador interpreta literales de texto con comillas dobles.
function escaparValorOnclickJs(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

const SissoLayout = (() => {

  // ------------------------------------------------------------
  // REDISENO DEL PANEL LATERAL (pedido de la persona usuaria, Sep 2026).
  // Problemas del menu anterior: (1) era interminable -- ~45 items en 5
  // secciones planas; (2) texto e items pequenos; (3) modulos mal
  // agrupados (p. ej. "Normativas" dentro de CLINICO, "Riesgo
  // psicosocial" y "Higiene" mezclados con gestion administrativa) y un
  // item duplicado ("Proximos examenes" apuntaba a la misma pagina que
  // "Calendario EMOs").
  //
  // Criterio de agrupacion (por DOMINIO de trabajo, no por tipo de
  // pantalla; mismo criterio de las plataformas EHS de referencia
  // -- Cority, VelocityEHS, Benchmark Gensuite -- que separan salud
  // ocupacional, seguridad/riesgos, cumplimiento y analitica):
  //   Inicio ........... lo que se abre todos los dias (fijo, sin grupo)
  //   Personas y organizacion .. quien trabaja y que puede hacer
  //   Salud ocupacional  .. todo lo clinico y su vigilancia
  //   Ergonomia ........ metodos de evaluacion ergonomica
  //   Seguridad y prevencion .. riesgos, incidentes y control operacional
  //   Cumplimiento y documentos .. norma, documentos, auditorias
  //   Analitica ........ reportes e indicadores
  //   Administracion ... perfil, configuracion, acerca de
  //
  // "roles" = roles que pueden VER el item ([] = todos). Se conserva
  // EXACTAMENTE la visibilidad por rol que tenia cada item (el backend
  // sigue siendo quien autoriza de verdad). Los `id` deben coincidir con
  // el que cada pagina pasa a SissoLayout.iniciar().
  // ------------------------------------------------------------
  const MENU = [
    { grupo: 'inicio', nombre: null, fijo: true, items: [
      { id: 'dashboard', label: 'Dashboard',        icono: 'grid',     href: '../dashboard/index.html',       roles: [] },
      { id: 'alertas',   label: 'Alertas',          icono: 'bell',     href: '../alertas/index.html',         roles: [] },
      { id: 'calendario', label: 'Calendario de EMOs', icono: 'calendar', href: '../calendario-emos/index.html', roles: [] },
    ] },

    { grupo: 'personas', nombre: 'Personas y organización', icono: 'users', items: [
      { id: 'empresa',        label: 'Mi empresa',           href: '../mi-empresa/index.html',        roles: ['admin', 'sso', 'medico'] },
      { id: 'trabajadores',   label: 'Trabajadores',         href: '../trabajadores/index.html',      roles: [] },
      { id: 'puestos',        label: 'Puestos de trabajo',   href: '../puestos-trabajo/index.html',   roles: ['admin', 'medico', 'sso', 'th'] },
      { id: 'contratistas',   label: 'Contratistas',         href: '../contratistas/index.html',      roles: ['admin', 'sso'] },
      { id: 'competencias',   label: 'Competencias',         href: '../competencias/index.html',      roles: ['admin', 'sso'] },
      { id: 'capacitaciones', label: 'Capacitaciones',       href: '../capacitaciones/index.html',    roles: [] },
      { id: 'ausentismo',     label: 'Ausentismo',           href: '../ausentismo/index.html',        roles: [] },
    ] },

    { grupo: 'salud', nombre: 'Salud ocupacional', icono: 'activity', items: [
      { subtitulo: 'Atención médica' },
      { id: 'emos',           label: 'EMOs / Aptitud',        href: '../aptitud/index.html',            roles: ['medico'] },
      { id: 'historia',       label: 'Historia clínica',      href: '../historia-clinica/index.html',   roles: ['medico'] },
      { id: 'consentimientos', label: 'Consentimientos',      href: '../consentimientos/index.html',    roles: ['medico', 'sso', 'th'] },
      { id: 'restricciones',  label: 'Restricciones médicas', href: '../restricciones-medicas/index.html', roles: ['medico', 'sso', 'th'] },
      { id: 'enfermedad-profesional', label: 'Enfermedad profesional', href: '../enfermedad-profesional/index.html', roles: ['medico', 'sso'] },
      { subtitulo: 'Exámenes complementarios' },
      { id: 'audiometria',    label: 'Audiometría',           href: '../audiometria/index.html',        roles: ['medico'] },
      { id: 'espirometria',   label: 'Espirometría',          href: '../espirometria/index.html',       roles: ['medico'] },
      { id: 'visiometria',    label: 'Visiometría',           href: '../visiometria/index.html',        roles: ['medico'] },
      { subtitulo: 'Vigilancia' },
      { id: 'vigilancia-salud', label: 'Vigilancia de la salud', href: '../vigilancia-salud/index.html', roles: ['medico', 'sso'] },
      { id: 'matriz-medico-puesto', label: 'Matriz médico-puesto', href: '../matriz-medico-puesto/index.html', roles: ['medico'] },
      { id: 'normas-examenes', label: 'Normas de exámenes',   href: '../normas-examenes/index.html',    roles: ['medico', 'admin', 'sso'] },
      { id: 'riesgo-psicosocial', label: 'Riesgo psicosocial', href: '../riesgo-psicosocial/index.html', roles: ['admin', 'sso', 'medico'] },
    ] },

    { grupo: 'ergonomia', nombre: 'Ergonomía', icono: 'figura', items: [
      { id: 'reba',    label: 'Calculadora REBA',     href: '../reba/index.html',    roles: ['medico', 'sso'] },
      { id: 'rula',    label: 'Calculadora RULA',     href: '../rula/index.html',    roles: ['medico', 'sso'] },
      { id: 'niosh',   label: 'Ecuación NIOSH',       href: '../niosh/index.html',   roles: ['medico', 'sso'] },
      { id: 'nordico', label: 'Cuestionario Nórdico', href: '../nordico/index.html', roles: ['medico', 'sso'] },
    ] },

    { grupo: 'seguridad', nombre: 'Seguridad y prevención', icono: 'escudo', items: [
      { subtitulo: 'Riesgos e inspecciones' },
      { id: 'matriz',       label: 'Matriz de riesgos',   href: '../matriz-riesgos/index.html',    roles: ['admin', 'medico', 'sso', 'th'] },
      { id: 'inspecciones', label: 'Inspecciones',        href: '../inspecciones/index.html',      roles: [] },
      { id: 'higiene-industrial', label: 'Higiene industrial', href: '../higiene-industrial/index.html', roles: [] },
      { id: 'quimicos',     label: 'Químicos y SDS',      href: '../quimicos/index.html',          roles: ['admin', 'sso'] },
      { subtitulo: 'Incidentes y acciones' },
      { id: 'accidentes',   label: 'Accidentes / Incidentes', href: '../accidentes/index.html',    roles: [] },
      { id: 'reportes-peligro', label: 'Reportes de peligro', href: '../reportes-peligro/index.html', roles: ['admin', 'sso'] },
      { id: 'capa',         label: 'Acciones CAPA',       href: '../capa/index.html',              roles: [] },
      { subtitulo: 'Control operacional' },
      { id: 'permisos-trabajo', label: 'Permisos de trabajo', href: '../permisos-trabajo/index.html', roles: ['admin', 'sso'] },
      { id: 'epp',          label: 'EPP',                 href: '../epp/index.html',               roles: [] },
      { id: 'emergencias',  label: 'Emergencias',         href: '../emergencias/index.html',       roles: ['admin', 'sso'] },
    ] },

    { grupo: 'cumplimiento', nombre: 'Cumplimiento y documentos', icono: 'documento', items: [
      { id: 'normativas',         label: 'Normativas',           href: '../normativas/index.html',          roles: [] },
      { id: 'obligaciones-legales', label: 'Obligaciones legales', href: '../obligaciones-legales/index.html', roles: ['admin', 'sso'] },
      { id: 'documentos-control', label: 'Control documental',   href: '../documentos-control/index.html',  roles: [] },
      { id: 'auditorias',         label: 'Auditorías',           href: '../auditorias/index.html',          roles: ['admin', 'sso'] },
      { id: 'certificados',       label: 'Certificados PDF',     href: '../certificados-pdf/index.html',    roles: [] },
    ] },

    { grupo: 'analitica', nombre: 'Analítica', icono: 'grafico', items: [
      { id: 'reportes',    label: 'Reportes BI',        href: '../reportes-bi/index.html', roles: [] },
      { id: 'indicadores', label: 'Indicadores SSO',    href: '../indicadores/index.html', roles: [] },
      { id: 'kpis',        label: 'KPIs meta vs. real', href: '../kpis/index.html',        roles: [] },
    ] },

    { grupo: 'administracion', nombre: 'Administración', icono: 'ajustes', items: [
      // Mi Perfil: firma digital/registro SENESCYT de quienes firman (medico, sso).
      // Oct 2026: ampliado de ['medico','sso'] a todos los roles que pueden
      // firmar documentos. Con la firma electronica avanzada (certificado
      // .p12), cualquier usuario que dicte una capacitacion (admin, th, sso,
      // medico -- ver capacitacionesController.crear) firma su certificado
      // con su propia credencial, asi que todos necesitan un lugar donde
      // cargarla. Los endpoints de backend ya eran 'autenticar' sin filtro
      // de rol; solo faltaba que la pantalla fuera alcanzable.
      { id: 'mi-perfil',     label: 'Mi perfil y firma', href: '../mi-perfil/index.html',     roles: ['admin', 'medico', 'sso', 'th'] },
      { id: 'configuracion', label: 'Configuración',     href: '../configuracion/index.html', roles: ['admin'] },
      { id: 'acerca-de',     label: 'Acerca de',         href: '../acerca-de/index.html',     roles: [] },
    ] },
  ];

  // Iconos de linea (estilo Feather, 24x24, trazo). Inline para no
  // depender de ningun recurso externo (CSP: img/font-src 'self').
  const ICONOS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    figura: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7"/><path d="M12 14l-4 7"/><path d="M12 14l4 7"/><path d="M6 10h12"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    grafico: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    ajustes: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    buscar: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    mas: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  };

  function icono(nombre, clase) {
    return `<svg class="sisso-ico${clase ? ' ' + clase : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre] || ''}</svg>`;
  }

  const ETIQUETAS_ROL = {
    admin: 'Administrador', sso: 'Seguridad y salud (SSO)', medico: 'Médico ocupacional',
    th: 'Talento Humano', superadmin: 'Superadministrador',
  };

  function puedeVerItem(item, rol) {
    return !item.roles || item.roles.length === 0 || item.roles.includes(rol);
  }

  function normalizarTexto(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Filtra cada grupo por rol; descarta subtitulos sin items debajo y
  // grupos que quedan vacios (un rol que no ve nada de "Salud
  // ocupacional" no debe ver ese encabezado colgando).
  function gruposVisibles(usuario) {
    const resultado = [];
    for (const g of MENU) {
      const items = [];
      let subtituloPendiente = null;
      for (const it of g.items) {
        if (it.subtitulo) { subtituloPendiente = it; continue; }
        if (!puedeVerItem(it, usuario.rol)) continue;
        if (subtituloPendiente) { items.push(subtituloPendiente); subtituloPendiente = null; }
        items.push(it);
      }
      if (items.some((it) => !it.subtitulo)) resultado.push({ ...g, items });
    }
    return resultado;
  }

  function claveExpandidos(usuario) { return `sisso_nav_expandido_${usuario.id}`; }

  function leerGrupoExpandido(usuario) {
    try { return localStorage.getItem(claveExpandidos(usuario)); } catch { return null; }
  }

  function htmlItem(item, moduloActivo) {
    const estaActivo = item.id === moduloActivo;
    const esPendiente = item.href === '#';
    return `<a href="${item.href}"
        class="sisso-nav-item${estaActivo ? ' activo' : ''}${esPendiente ? ' pendiente' : ''}"
        data-buscar="${escaparHtml(normalizarTexto(item.label))}"
        ${estaActivo ? 'aria-current="page"' : ''}
        ${esPendiente ? 'data-on-click="return false;" title="Próximamente"' : ''}>
        ${item.icono ? icono(item.icono) : ''}
        <span>${escaparHtml(item.label)}</span>
      </a>`;
  }

  function construirSidebar(moduloActivo, usuario) {
    const grupos = gruposVisibles(usuario);
    const grupoActivo = grupos.find((g) => g.items.some((it) => it.id === moduloActivo));
    const grupoGuardado = leerGrupoExpandido(usuario);
    // Acordeón EXCLUSIVO: solo UN grupo abierto a la vez. El grupo activo
    // (donde está la página actual) siempre manda sobre lo guardado, para
    // no perder la ubicación; si no hay ninguno activo (ej. Inicio), se
    // respeta el último grupo que el usuario abrió.
    const grupoAbierto = grupoActivo ? grupoActivo.grupo : grupoGuardado;

    const fijos = grupos.filter((g) => g.fijo).map((g) =>
      `<div class="sisso-nav-fijos">${g.items.map((it) => htmlItem(it, moduloActivo)).join('')}</div>`).join('');

    const gruposHtml = grupos.filter((g) => !g.fijo).map((g) => {
      const abierto = g.grupo === grupoAbierto;
      const itemsHtml = g.items.map((it) => it.subtitulo
        ? `<div class="sisso-nav-subtitulo">${escaparHtml(it.subtitulo)}</div>`
        : htmlItem({ ...it, label: it.label }, moduloActivo).replace('data-buscar="', `data-buscar="${escaparHtml(normalizarTexto(g.nombre))} `)
      ).join('');
      return `
        <div class="sisso-nav-grupo${g === grupoActivo ? ' tiene-activo' : ''}" data-grupo="${g.grupo}">
          <button type="button" class="sisso-nav-grupo-btn" aria-expanded="${abierto}" data-on-click="sissoToggleGrupo(this)">
            <span class="sisso-nav-grupo-icono">${icono(g.icono)}</span>
            <span class="sisso-nav-grupo-nombre">${escaparHtml(g.nombre)}</span>
            ${icono('chevron', 'sisso-nav-chevron')}
          </button>
          <div class="sisso-nav-grupo-items${abierto ? '' : ' colapsada'}">${itemsHtml}</div>
        </div>`;
    }).join('');

    const org = usuario.organizacion || {};
    const nombreOrg = org.nombre || 'Sistema';
    const marcaEmpresa = org.logoUrl
      ? `<img src="${escaparHtml(org.logoUrl)}" alt="${escaparHtml(org.nombre)}" class="sisso-sidebar-empresa-logo">`
      : `<span class="sisso-sidebar-empresa-inicial">${escaparHtml(nombreOrg.trim().charAt(0).toUpperCase())}</span>`;

    const partes = String(usuario.nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
    const iniciales = ((partes[0] || '?').charAt(0) + (partes.length > 1 ? partes[partes.length - 1].charAt(0) : '')).toUpperCase();
    const etiquetaRol = ETIQUETAS_ROL[usuario.rol] || String(usuario.rol || '').toUpperCase();

    return `
      <aside class="sisso-sidebar" aria-label="Navegación principal">
        <div class="sisso-sidebar-cabecera">
          <div class="sisso-sidebar-logo">
            <img src="../shared/logo.png" alt="SISSO" class="sisso-sidebar-logo-img">
            <div class="sisso-sidebar-marca-texto">
              <span class="sisso-sidebar-marca-sigla">SISSO</span>
              <span class="sisso-sidebar-lema">Sistema Integral de Salud y Seguridad Ocupacional</span>
            </div>
          </div>
          <div class="sisso-sidebar-empresa">
            ${marcaEmpresa}
            <div class="sisso-sidebar-empresa-texto">
              <span class="sisso-sidebar-empresa-etiqueta">Organización</span>
              <span class="sisso-sidebar-empresa-nombre" title="${escaparHtml(nombreOrg)}">${escaparHtml(nombreOrg)}</span>
            </div>
          </div>
          <div class="sisso-nav-buscar-caja">
            ${icono('buscar', 'sisso-nav-buscar-ico')}
            <input type="search" id="sisso-nav-buscar" class="sisso-nav-buscar" placeholder="Buscar módulo…" autocomplete="off" aria-label="Buscar módulo" data-on-input="sissoFiltrarMenu(this.value)">
          </div>
        </div>

        <nav class="sisso-nav">
          ${fijos}
          ${gruposHtml}
          <div class="sisso-nav-vacio" id="sisso-nav-vacio">Ningún módulo coincide con la búsqueda.</div>
        </nav>

        <div class="sisso-usuario">
          <div class="sisso-usuario-menu" id="sisso-usuario-menu">
            <button type="button" data-on-click="sissoCerrarMenuUsuario(); sissoAbrirCambioPassword()">Cambiar mi contraseña</button>
            <button type="button" data-on-click="sissoCerrarMenuUsuario(); sissoAbrirMfa()">Verificación en 2 pasos</button>
            <button type="button" data-on-click="sissoCerrarMenuUsuario(); sissoAbrirSesiones()">Sesiones activas</button>
            <hr>
            <button type="button" class="peligro" data-on-click="sissoCerrarMenuUsuario(); sissoCerrarSesionConConfirmacion()">Cerrar sesión</button>
          </div>
          <div class="sisso-usuario-fila">
            <span class="sisso-avatar">${escaparHtml(iniciales)}</span>
            <div class="sisso-usuario-datos">
              <div class="sisso-usuario-nombre" title="${escaparHtml(usuario.nombreCompleto)}">${escaparHtml(usuario.nombreCompleto)}</div>
              <div class="sisso-usuario-rol">${escaparHtml(etiquetaRol)}</div>
            </div>
            <button type="button" class="sisso-usuario-btn" aria-label="Opciones de cuenta" title="Cuenta y seguridad" data-on-click="sissoAlternarMenuUsuario()">${icono('mas')}</button>
          </div>
        </div>
      </aside>`;
  }

  function construirTopbar(tituloModulo, moduloActivo) {
    const grupo = MENU.find((g) => g.items.some((it) => it.id === moduloActivo));
    const nombreGrupo = grupo ? (grupo.nombre || 'Inicio') : '';
    const migas = nombreGrupo
      ? `<span class="sisso-topbar-migas">${escaparHtml(nombreGrupo)}<span class="sep">/</span></span>` : '';
    return `
      <div class="sisso-topbar">
        <button type="button" class="sisso-boton-menu-movil" id="sisso-boton-menu-movil" data-on-click="sissoAlternarSidebarMovil()" aria-label="Abrir menú" title="Menú">☰</button>
        ${migas}<span class="sisso-topbar-titulo">${tituloModulo}</span>
        <div class="sisso-topbar-derecha" id="sisso-topbar-acciones">
          <button type="button" class="sisso-boton-modo-privado" id="sisso-boton-modo-privado" data-on-click="sissoAlternarModoPrivado()" title="Difumina el contenido en pantalla sin cerrar sesión. No reemplaza los permisos del sistema.">
            👁️ <span class="texto-boton">Modo privado</span>
          </button>
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
    async iniciar(moduloActivo, tituloModulo, contenedorId = 'sisso-app') {
      // Verificar sesion activa (si no hay, intenta un refresco
      // silencioso antes de redirigir al login -- ver
      // sissoRequerirSesion en shared/api.js).
      await sissoRequerirSesion();
      if (!SissoSesion.haySesion()) return; // ya redirigiendo al login, no seguir construyendo el layout

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
            ${construirTopbar(tituloModulo, moduloActivo)}
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
      } else if (usuario.disclaimerNormativoAceptado === false) {
        // Solo se muestra si YA paso el cambio de contrasena forzado
        // (evita apilar dos modales bloqueantes a la vez). Se vuelve a
        // mostrar automaticamente si sube DISCLAIMER_NORMATIVO_VERSION_ACTUAL
        // en el backend, aunque el usuario ya lo hubiera aceptado antes.
        sissoMostrarModalDisclaimerNormativo();
      }

      // Lote G (Fase 14, responsive): overlay para cerrar el sidebar
      // movil al tocar fuera de el. Mismo criterio que el overlay de
      // modo privado -- se inyecta una sola vez por pagina.
      if (!document.getElementById('sisso-sidebar-overlay')) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="sisso-sidebar-overlay" id="sisso-sidebar-overlay" data-on-click="sissoCerrarSidebarMovil()"></div>`);
      }

      // Lote E (Fase 9): overlay del modo privado, inyectado una vez
      // por pagina fuera de .sisso-contenido para que NUNCA quede
      // difuminado ni bloqueado por su propio filtro/pointer-events.
      if (!document.getElementById('sisso-modo-privado-overlay')) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="sisso-modo-privado-overlay" id="sisso-modo-privado-overlay" data-on-click="sissoAlternarModoPrivado()">
            <div class="sisso-modo-privado-banner"><span class="punto"></span> Modo privado activo — toca para reactivar la pantalla</div>
          </div>`);
      }
      sissoAplicarEstadoModoPrivado();
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
 * Lote E (Fase 9 del plan "Perfil inteligente de empresa"): Modo
 * privado. Es UNICAMENTE una capa visual -- difumina el contenido
 * de la pagina actual y bloquea los clics dentro de el mientras
 * esta activo (overlay encima, con pointer-events:none en el
 * contenido real). NO sustituye el RBAC ni el RLS del backend: los
 * datos siguen llegando al navegador igual que siempre (por eso
 * "impedir interaccion accidental" se resuelve con pointer-events,
 * no dejando de pedirlos); esto solo evita que alguien mirando la
 * pantalla por encima del hombro los vea.
 *
 * Se guarda en sessionStorage (no localStorage, y no es un dato
 * clinico -- es una preferencia de interfaz) para que se mantenga
 * activo al navegar entre paginas del mismo pestana/sesion de
 * navegador, pero SIEMPRE arranque apagado en una pestana nueva:
 * eso evita el riesgo de que quede "pegado" activado en un equipo
 * compartido despues de cerrar y reabrir el navegador.
 */
/**
 * Lote G (Fase 14, responsive): abre/cierra el sidebar como panel
 * deslizante en pantallas angostas (ver el @media en
 * shared/estilos.css). En escritorio estas funciones no tienen
 * efecto visible porque el boton de hamburguesa esta oculto y el
 * sidebar nunca recibe la clase que lo saca de pantalla.
 */
function sissoAlternarSidebarMovil() {
  document.querySelector('.sisso-sidebar')?.classList.toggle('sidebar-movil-abierto');
  document.getElementById('sisso-sidebar-overlay')?.classList.toggle('visible');
}

function sissoCerrarSidebarMovil() {
  document.querySelector('.sisso-sidebar')?.classList.remove('sidebar-movil-abierto');
  document.getElementById('sisso-sidebar-overlay')?.classList.remove('visible');
}

const SISSO_CLAVE_MODO_PRIVADO = 'sisso_modo_privado_activo';

function sissoAplicarEstadoModoPrivado() {
  const activo = sessionStorage.getItem(SISSO_CLAVE_MODO_PRIVADO) === 'true';
  const contenido = document.querySelector('.sisso-contenido');
  const overlay = document.getElementById('sisso-modo-privado-overlay');
  const boton = document.getElementById('sisso-boton-modo-privado');
  if (contenido) contenido.classList.toggle('modo-privado-activo', activo);
  if (overlay) overlay.classList.toggle('visible', activo);
  if (boton) boton.classList.toggle('activo', activo);
}

function sissoAlternarModoPrivado() {
  const activoActual = sessionStorage.getItem(SISSO_CLAVE_MODO_PRIVADO) === 'true';
  sessionStorage.setItem(SISSO_CLAVE_MODO_PRIVADO, String(!activoActual));
  sissoAplicarEstadoModoPrivado();
}

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
 * Abre/cierra un grupo del panel lateral y recuerda, por usuario, cuales
 * grupos quedaron abiertos (localStorage). Global porque la llama un
 * data-on-click generado dinamicamente dentro del sidebar.
 */
function sissoToggleGrupo(boton) {
  const usuario = SissoSesion.obtenerUsuario();
  if (!usuario) return;
  const contenedor = boton.nextElementSibling;
  const yaAbierto = !contenedor.classList.contains('colapsada');

  // Acordeón EXCLUSIVO: al abrir un grupo se cierran todos los demás,
  // para que el panel no vuelva a crecer sin límite con varios grupos
  // abiertos a la vez (ese era justamente el problema original).
  document.querySelectorAll('.sisso-nav-grupo').forEach((g) => {
    const btn = g.querySelector('.sisso-nav-grupo-btn');
    const items = g.querySelector('.sisso-nav-grupo-items');
    items.classList.add('colapsada');
    btn.setAttribute('aria-expanded', 'false');
  });
  contenedor.classList.toggle('colapsada', yaAbierto);
  boton.setAttribute('aria-expanded', String(!yaAbierto));

  const grupoAbierto = yaAbierto ? '' : boton.closest('.sisso-nav-grupo').dataset.grupo;
  try {
    localStorage.setItem(`sisso_nav_expandido_${usuario.id}`, grupoAbierto);
  } catch { /* localStorage no disponible: solo no se recuerda la preferencia */ }
}

/**
 * Buscador del panel lateral: filtra modulos por nombre (o nombre de su
 * grupo), sin distinguir mayusculas ni tildes. Mientras hay texto se
 * muestran todos los grupos con coincidencias, abiertos.
 */
function sissoFiltrarMenu(valor) {
  const nav = document.querySelector('.sisso-nav');
  if (!nav) return;
  const q = String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  nav.classList.toggle('filtrando', q.length > 0);

  let coincidencias = 0;
  nav.querySelectorAll('.sisso-nav-item').forEach((a) => {
    const ok = !q || (a.dataset.buscar || '').includes(q);
    a.classList.toggle('oculto', !ok);
    if (ok) coincidencias += 1;
  });
  nav.querySelectorAll('.sisso-nav-grupo').forEach((g) => {
    g.classList.toggle('oculto', !g.querySelector('.sisso-nav-item:not(.oculto)'));
  });
  const fijos = nav.querySelector('.sisso-nav-fijos');
  if (fijos) fijos.classList.toggle('oculto', q.length > 0 && !fijos.querySelector('.sisso-nav-item:not(.oculto)'));
  document.getElementById('sisso-nav-vacio')?.classList.toggle('visible', q.length > 0 && coincidencias === 0);
}

/** Menu de cuenta (contrasena, 2 pasos, sesiones, cerrar sesion) del pie del panel. */
function sissoAlternarMenuUsuario() {
  document.getElementById('sisso-usuario-menu')?.classList.toggle('visible');
}
function sissoCerrarMenuUsuario() {
  document.getElementById('sisso-usuario-menu')?.classList.remove('visible');
}
document.addEventListener('click', (evento) => {
  if (!evento.target.closest('.sisso-usuario')) sissoCerrarMenuUsuario();
});

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
          ${forzado ? '' : '<button data-on-click="sissoCerrarModalCambioPassword()" style="padding:11px 18px;background:#fff;color:#334155;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Cancelar</button>'}
          <button id="sisso-cp-boton" data-on-click="sissoConfirmarCambioPassword(${forzado})" style="padding:11px 18px;background:#0d9488;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Guardar nueva contraseña</button>
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
// Disclaimer normativo (una sola vez por usuario, persistido en
// base de datos -- ver migration_096_normativas_sisso.sql y
// authController.js: aceptarDisclaimerNormativo/DISCLAIMER_NORMATIVO_VERSION_ACTUAL).
//
// A diferencia del bloqueo por cambio de contrasena, este modal NO
// impide interactuar con el resto de la pagina de fondo (no hay
// forma de "escapar" sin pasar por login de nuevo si se cierra la
// pestana), pero SI exige marcar la casilla de aceptacion antes de
// habilitar el boton -- igual que un termino y condicion estandar.
// ------------------------------------------------------------
// Debe coincidir con DISCLAIMER_NORMATIVO_VERSION_ACTUAL en
// authController.js -- es solo para mostrarla en pantalla, la
// version real que decide si se pide de nuevo vive en el backend.
const DISCLAIMER_NORMATIVO_VERSION_MOSTRADA = '2026-09-terminos-v2';

async function sissoMostrarModalDisclaimerNormativo() {
  if (document.getElementById('sisso-modal-disclaimer-normativo')) return;

  let listaHtml = '<li>Cargando listado de normativas…</li>';
  document.body.insertAdjacentHTML('beforeend', construirHtmlDisclaimerNormativo(listaHtml));

  try {
    const datos = await sissoFetch('/normativas?pais=ecuador');
    const normativas = Array.isArray(datos.normativas) ? datos.normativas : [];
    const vigentes = normativas.filter((n) => n.estado !== 'derogada');
    listaHtml = vigentes.length
      ? vigentes.map((n) => `<li>${escaparHtml(n.numero_acto ? n.numero_acto + ' — ' : '')}${escaparHtml(n.titulo)}</li>`).join('')
      : '<li>No se pudo cargar el detalle; puede revisarlo luego en "Normativas" desde el menú.</li>';
  } catch {
    listaHtml = '<li>No se pudo cargar el detalle; puede revisarlo luego en "Normativas" desde el menú.</li>';
  }

  const contenedorLista = document.getElementById('sisso-disclaimer-normativo-lista');
  if (contenedorLista) contenedorLista.innerHTML = listaHtml;
}

function construirHtmlDisclaimerNormativo(listaHtmlInicial) {
  return `
    <div id="sisso-modal-disclaimer-normativo" style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;">
      <div style="background:#fff;border-radius:14px;padding:26px;width:620px;max-width:94vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="font-size:16px;font-weight:800;margin-bottom:4px;">📋 Descargo de responsabilidad y condiciones de uso de SISSO</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:14px;">Versión ${escaparHtml(DISCLAIMER_NORMATIVO_VERSION_MOSTRADA)} — por favor lea antes de continuar.</div>

        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">1. Alcance operativo y autonomía profesional</div>
        <div style="font-size:12.5px;color:#475569;margin-bottom:12px;line-height:1.55;">
          SISSO (Sistema Integral de Salud y Seguridad Ocupacional) es una herramienta tecnológica de gestión,
          automatización y registro. Los reportes, cálculos automáticos (como REBA, RULA, NIOSH, IPER) y
          sugerencias generadas por el sistema sirven como soporte técnico, pero no sustituyen ni reemplazan
          el criterio profesional, clínico, legal o preventivo del Médico Ocupacional, los responsables de
          Seguridad y Salud Ocupacional (SSO) ni de Talento Humano. La validación final de aptitudes y
          dictámenes médicos es responsabilidad exclusiva del profesional acreditado.
        </div>

        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">2. Veracidad e integridad de la información</div>
        <div style="font-size:12.5px;color:#475569;margin-bottom:12px;line-height:1.55;">
          El usuario y la empresa registrada son los únicos responsables de la exactitud, veracidad y
          actualización de la información ingresada en la plataforma (datos del trabajador, antecedentes,
          mediciones, ausentismo y registros de inspección). RonnDu Corp no asume responsabilidad por
          dictámenes, reportes o sanciones derivadas de datos erróneos, incompletos o falsificados por los
          usuarios.
        </div>

        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">3. Protección de datos sensibles y confidencialidad médica</div>
        <div style="font-size:12.5px;color:#475569;margin-bottom:6px;line-height:1.55;">
          La plataforma maneja información confidencial de salud y personal. De acuerdo con el control de
          acceso basado en roles (RBAC) de SISSO:
        </div>
        <ul style="font-size:12.5px;color:#475569;margin:0 0 12px;padding-left:20px;line-height:1.55;">
          <li>Los datos clínicos individuales (historias clínicas, diagnósticos CIE-10, exámenes) son de
              acceso exclusivo del personal médico autorizado.</li>
          <li>Los roles administrativos, SSO y Talento Humano únicamente acceden a medidas operativas,
              restricciones laborales o consolidados agregados, conforme al principio de necesidad de
              conocer.</li>
          <li>El usuario se compromete a mantener estricta confidencialidad de la información a la que tenga
              acceso y a no compartir credenciales ni códigos de autenticación (MFA).</li>
        </ul>

        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">4. Uso de firmas digitales y validez de documentos</div>
        <div style="font-size:12.5px;color:#475569;margin-bottom:12px;line-height:1.55;">
          El usuario declara que las firmas capturadas en pantalla, consentimientos informados y documentos
          escaneados cargados en el sistema responden a procedimientos reales y autorizados por los
          titulares de los datos, asumiendo la responsabilidad legal de su custodia y validez.
        </div>

        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">5. Marca registrada y propiedad de la plataforma</div>
        <div style="font-size:12.5px;color:#475569;margin-bottom:12px;line-height:1.55;">
          El nombre "SISSO", su logotipo y la identidad visual de la plataforma son marca y propiedad
          exclusiva de <strong>RonnDu Corp</strong>. Queda prohibido su uso, reproducción, copia o
          explotación total o parcial, en cualquier medio, sin autorización previa y por escrito de RonnDu
          Corp. El acceso otorgado al usuario es una licencia de uso de la plataforma, no una cesión de
          derechos sobre la marca, el software ni sus contenidos.
        </div>

        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">6. Alcance normativo</div>
        <div style="font-size:12.5px;color:#475569;margin-bottom:8px;line-height:1.55;">
          SISSO se apoya en la normativa ecuatoriana vigente sobre seguridad y salud en el trabajo,
          incluyendo el Reglamento de los Servicios Integrales de Salud en el Trabajo (SISAT — Acuerdo
          Ministerial MSP 00004-2026). El listado completo, con enlaces a los textos oficiales, está
          disponible en cualquier momento en <strong>Normativas</strong> desde el menú lateral.
        </div>
        <ul class="sisso-disclaimer-lista" id="sisso-disclaimer-normativo-lista">${listaHtmlInicial}</ul>
        <div style="font-size:12px;color:#64748b;margin-bottom:16px;line-height:1.5;">
          Este listado es informativo y de referencia. SISSO no reemplaza el criterio de un profesional
          de la salud ocupacional ni de un asesor legal, y no certifica cumplimiento normativo integral
          por sí solo — el cumplimiento efectivo depende de cómo cada organización implemente y verifique
          sus procesos.
        </div>

        <label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:#334155;margin-bottom:16px;cursor:pointer;">
          <input type="checkbox" id="sisso-disclaimer-normativo-check" style="margin-top:2px;" data-on-change="sissoActualizarBotonDisclaimerNormativo()">
          <span>He leído, comprendo y acepto los Términos de Uso, Responsabilidades y Políticas de
          Confidencialidad de SISSO descritos arriba.</span>
        </label>
        <div id="sisso-disclaimer-normativo-error" style="display:none;background:#fef2f2;color:#b91c1c;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px;"></div>
        <div style="display:flex;justify-content:flex-end;">
          <button id="sisso-disclaimer-normativo-boton" data-on-click="sissoAceptarDisclaimerNormativo()" disabled
            style="padding:11px 18px;background:#94a3b8;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:not-allowed;font-family:inherit;">
            Aceptar y continuar
          </button>
        </div>
      </div>
    </div>`;
}

function sissoActualizarBotonDisclaimerNormativo() {
  const marcado = document.getElementById('sisso-disclaimer-normativo-check').checked;
  const boton = document.getElementById('sisso-disclaimer-normativo-boton');
  boton.disabled = !marcado;
  boton.style.background = marcado ? '#0d9488' : '#94a3b8';
  boton.style.cursor = marcado ? 'pointer' : 'not-allowed';
}

async function sissoAceptarDisclaimerNormativo() {
  const errorEl = document.getElementById('sisso-disclaimer-normativo-error');
  const boton = document.getElementById('sisso-disclaimer-normativo-boton');
  errorEl.style.display = 'none';

  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch('/auth/aceptar-disclaimer-normativo', { method: 'POST' });

    // Igual que en sissoConfirmarCambioPassword: se actualiza la sesion
    // en memoria para que no vuelva a pedirse dentro de la misma sesion.
    const usuario = SissoSesion.obtenerUsuario();
    if (usuario) {
      usuario.disclaimerNormativoAceptado = true;
      sessionStorage.setItem('sisso_usuario', JSON.stringify(usuario));
    }

    const modal = document.getElementById('sisso-modal-disclaimer-normativo');
    if (modal) modal.remove();
  } catch (err) {
    errorEl.textContent = err.message || 'No se pudo registrar la aceptación. Intente nuevamente.';
    errorEl.style.display = 'block';
    boton.disabled = false;
    boton.textContent = 'Continuar';
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
          <button data-on-click="sissoCerrarModalMfa()" style="padding:11px 18px;background:#fff;color:#334155;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Cerrar</button>
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
    <button id="sisso-mfa-btn-desactivar" data-on-click="sissoDesactivarMfa()" style="width:100%;padding:11px;background:#fef2f2;color:#b91c1c;border:1.5px solid #fecaca;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Desactivar verificación en 2 pasos</button>`;
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
    <button id="sisso-mfa-btn-confirmar" data-on-click="sissoConfirmarMfaSetup()" style="width:100%;padding:11px;background:#0d9488;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Activar verificación en 2 pasos</button>`;
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
          <button id="sisso-sesiones-btn-cerrar-otras" data-on-click="sissoRevocarOtrasSesiones()" style="padding:9px 14px;background:#fef2f2;color:#b91c1c;border:1.5px solid #fecaca;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">
            Cerrar todas las demás
          </button>
          <button data-on-click="sissoCerrarModalSesiones()" style="padding:9px 16px;background:#fff;color:#334155;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cerrar</button>
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
          ${s.esSesionActual ? '' : `<button data-on-click="sissoRevocarSesion('${escaparHtml(s.familiaId)}')" style="flex-shrink:0;padding:5px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Cerrar</button>`}
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
