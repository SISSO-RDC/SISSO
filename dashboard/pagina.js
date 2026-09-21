// ============================================================
// SISSO - Logica de la pagina (dashboard/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('dashboard', 'Dashboard');
  renderizarAccesosRapidos();
  renderizarCabeceraNuevaEvaluacion();
  await cargarDashboard();
});

// ------- Lote D (Fase 5): accesos rápidos diferenciados por rol -------
// Nota: no se agregan aqui datos clinicos nuevos ni consultas nuevas al
// backend -- son solo enlaces de navegacion hacia paginas que YA existen
// y que YA tienen su propio RBAC (ver shared/layout.js, arreglo MENU).
// Los KPIs/graficos de arriba siguen siendo los mismos para todos los
// roles, ya filtrados correctamente por dashboardController.js.
const ACCESOS_RAPIDOS_POR_ROL = {
  medico: [
    { icono: '📋', etiqueta: 'Historia clínica', href: '../historia-clinica/index.html' },
    { icono: '🩺', etiqueta: 'EMOs / Aptitud', href: '../aptitud/index.html' },
    { icono: '🔊', etiqueta: 'Audiometría', href: '../audiometria/index.html' },
    { icono: '💨', etiqueta: 'Espirometría', href: '../espirometria/index.html' },
    { icono: '📊', etiqueta: 'Vigilancia de la salud', href: '../vigilancia-salud/index.html' },
    { icono: '🧬', etiqueta: 'Enfermedad profesional', href: '../enfermedad-profesional/index.html' },
  ],
  sso: [
    { icono: '🗂️', etiqueta: 'Matriz de riesgos', href: '../matriz-riesgos/index.html' },
    { icono: '🚨', etiqueta: 'Accidentes/Incidentes', href: '../accidentes/index.html' },
    { icono: '🔁', etiqueta: 'CAPA', href: '../capa/index.html' },
    { icono: '🔎', etiqueta: 'Inspecciones', href: '../inspecciones/index.html' },
    { icono: '🌡️', etiqueta: 'Higiene industrial', href: '../higiene-industrial/index.html' },
    { icono: '🦺', etiqueta: 'EPP', href: '../epp/index.html' },
  ],
  th: [
    { icono: '👥', etiqueta: 'Trabajadores', href: '../trabajadores/index.html' },
    { icono: '📉', etiqueta: 'Ausentismo', href: '../ausentismo/index.html' },
    { icono: '🎓', etiqueta: 'Capacitaciones', href: '../capacitaciones/index.html' },
    { icono: '📅', etiqueta: 'Calendario EMOs', href: '../calendario-emos/index.html' },
    { icono: '📄', etiqueta: 'Certificados PDF', href: '../certificados-pdf/index.html' },
  ],
  admin: [
    { icono: '🏢', etiqueta: 'Mi Empresa', href: '../mi-empresa/index.html' },
    { icono: '⚙️', etiqueta: 'Configuración', href: '../configuracion/index.html' },
    { icono: '📈', etiqueta: 'Indicadores SSO', href: '../indicadores/index.html' },
    { icono: '📊', etiqueta: 'Reportes BI', href: '../reportes-bi/index.html' },
  ],
};

function renderizarAccesosRapidos() {
  const usuario = SissoSesion.obtenerUsuario();
  const accesos = ACCESOS_RAPIDOS_POR_ROL[usuario?.rol] || [];
  const cont = document.getElementById('accesos-rapidos');
  if (!cont || accesos.length === 0) return;
  cont.innerHTML = accesos.map(a => `
    <a class="acceso-rapido" href="${a.href}">
      <span class="icono">${a.icono}</span>
      <span class="etiqueta">${escHtml(a.etiqueta)}</span>
    </a>`).join('');
}

// ------- Lote D (Fase 6): "+ Nueva evaluación" -------
// Solo visible para medico: historia-clinica.js (destino final del
// orquestador) ya esta restringido a ese rol en shared/layout.js, asi
// que mostrar el boton a otros roles solo generaria un enlace que el
// RBAC del backend rechazaria igual -- mejor no ofrecerlo.
let neTrabajadores = [];
let neTrabajadorSeleccionado = null;
let neTipoSeleccionado = 'preocupacional_inicio';

function renderizarCabeceraNuevaEvaluacion() {
  const usuario = SissoSesion.obtenerUsuario();
  const cont = document.getElementById('cabecera-nueva-evaluacion');
  if (!cont) return;
  if (usuario?.rol === 'medico') {
    cont.innerHTML = `<button class="sisso-boton" data-on-click="abrirModalNuevaEvaluacion()">+ Nueva evaluación</button>`;
  }
}

async function abrirModalNuevaEvaluacion() {
  neTrabajadorSeleccionado = null;
  neTipoSeleccionado = 'preocupacional_inicio';
  document.getElementById('ne-buscador').value = '';
  document.getElementById('ne-error').classList.remove('visible');
  document.querySelectorAll('.tipo-evaluacion-opcion').forEach(el => el.classList.toggle('seleccionada', el.dataset.tipo === neTipoSeleccionado));
  document.getElementById('modal-nueva-evaluacion').classList.add('visible');

  if (neTrabajadores.length === 0) {
    try {
      const datos = await sissoFetch('/trabajadores');
      neTrabajadores = datos.trabajadores || [];
    } catch (err) {
      document.getElementById('ne-error').textContent = 'No se pudo cargar la lista de trabajadores: ' + err.message;
      document.getElementById('ne-error').classList.add('visible');
    }
  }
  filtrarTrabajadoresNuevaEvaluacion();
}

function cerrarModalNuevaEvaluacion() {
  document.getElementById('modal-nueva-evaluacion').classList.remove('visible');
}

function filtrarTrabajadoresNuevaEvaluacion() {
  const termino = document.getElementById('ne-buscador').value.trim().toLowerCase();
  const filtrados = termino
    ? neTrabajadores.filter(t => t.nombre_completo?.toLowerCase().includes(termino) || t.documento?.toLowerCase().includes(termino))
    : neTrabajadores;

  const cont = document.getElementById('ne-lista-trabajadores');
  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="trabajador-opcion" style="cursor:default;color:var(--t3);">Sin resultados.</div>`;
    return;
  }
  cont.innerHTML = filtrados.slice(0, 50).map(t => `
    <div class="trabajador-opcion ${neTrabajadorSeleccionado === t.id ? 'seleccionado' : ''}" data-on-click="seleccionarTrabajadorNuevaEvaluacion('${t.id}')">
      ${escHtml(t.nombre_completo)} — ${escHtml(t.documento || '')}
    </div>`).join('');
}

function seleccionarTrabajadorNuevaEvaluacion(id) {
  neTrabajadorSeleccionado = id;
  filtrarTrabajadoresNuevaEvaluacion();
}

function elegirTipoNuevaEvaluacion(el, tipo) {
  neTipoSeleccionado = tipo;
  document.querySelectorAll('.tipo-evaluacion-opcion').forEach(o => o.classList.remove('seleccionada'));
  el.classList.add('seleccionada');
}

function continuarNuevaEvaluacion() {
  if (!neTrabajadorSeleccionado) {
    const err = document.getElementById('ne-error');
    err.textContent = 'Selecciona un trabajador para continuar.';
    err.classList.add('visible');
    return;
  }
  window.location.href = `../historia-clinica/index.html?trabajador=${encodeURIComponent(neTrabajadorSeleccionado)}&tipo=${encodeURIComponent(neTipoSeleccionado)}`;
}

async function cargarDashboard() {
  try {
    const datos = await sissoFetch('/dashboard/resumen');
    renderizarKPIs(datos);
    renderizarGraficoAptitud(datos.distribucionAptitud);
    renderizarGraficoReba(datos.rebaPorArea);
    renderizarGraficoRula(datos.rulaResumen);
    renderizarEmosProximas(datos.emosProximas);
    renderizarActividadReciente(datos.actividadReciente);
  } catch (err) {
    console.error('Error al cargar el dashboard:', err);
  }
}

// ------- KPIs -------
function renderizarKPIs(datos) {
  document.getElementById('kpi-total').textContent = datos.totalTrabajadores;

  const aptitud = datos.distribucionAptitud;
  const contar = (val) => {
    const f = aptitud.find(a => a.aptitud === val);
    return f ? f.cantidad : 0;
  };
  document.getElementById('kpi-aptos').textContent = contar('apto');
  document.getElementById('kpi-restricciones').textContent = contar('con_restricciones');
  document.getElementById('kpi-no-aptos').textContent = contar('no_apto');
  document.getElementById('kpi-pendientes').textContent = contar('pendiente');
}

// ------- Gráfico: distribución de aptitud (dona) -------
function renderizarGraficoAptitud(datos) {
  if (!datos || datos.length === 0) {
    document.getElementById('c-apt').style.display = 'none';
    document.getElementById('sin-datos-aptitud').style.display = 'block';
    return;
  }

  const etiquetas = { apto: 'Apto', con_restricciones: 'Con restricciones', no_apto: 'No apto', pendiente: 'Pendiente' };
  const colores = { apto: '#16a34a', con_restricciones: '#d97706', no_apto: '#dc2626', pendiente: '#94a3b8' };

  new Chart(document.getElementById('c-apt'), {
    type: 'doughnut',
    data: {
      labels: datos.map(d => etiquetas[d.aptitud] || d.aptitud),
      datasets: [{
        data: datos.map(d => parseInt(d.cantidad, 10)),
        backgroundColor: datos.map(d => colores[d.aptitud] || '#94a3b8'),
        borderWidth: 2, borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} trabajadores` } }
      },
      cutout: '65%',
    }
  });
}

// ------- Gráfico: REBA por área (barras horizontales) -------
function renderizarGraficoReba(datos) {
  if (!datos || datos.length === 0) {
    document.getElementById('c-reba-d').style.display = 'none';
    document.getElementById('sin-datos-reba').style.display = 'block';
    return;
  }

  const coloresPorScore = (score) => {
    if (score <= 3) return '#16a34a';
    if (score <= 7) return '#d97706';
    if (score <= 10) return '#ea580c';
    return '#dc2626';
  };

  new Chart(document.getElementById('c-reba-d'), {
    type: 'bar',
    data: {
      labels: datos.map(d => d.area || 'Sin área'),
      datasets: [
        {
          label: 'Score máximo',
          data: datos.map(d => parseFloat(d.maximo)),
          backgroundColor: datos.map(d => coloresPorScore(parseFloat(d.maximo))),
          borderRadius: 6,
        },
        {
          label: 'Promedio',
          data: datos.map(d => parseFloat(d.promedio)),
          backgroundColor: datos.map(d => coloresPorScore(parseFloat(d.promedio)) + '80'),
          borderRadius: 6,
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      scales: {
        x: { min: 0, max: 15, grid: { color: '#e2e8f0' }, ticks: { font: { size: 11 } } },
        y: { ticks: { font: { size: 11 } } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } },
        tooltip: { callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} (escala 1-15)`
        }}
      }
    }
  });
}

// ------- Gráfico: RULA niveles (dona) -------
function renderizarGraficoRula(datos) {
  if (!datos || datos.length === 0) {
    document.getElementById('c-rula').style.display = 'none';
    document.getElementById('sin-datos-rula').style.display = 'block';
    return;
  }

  const etiquetas = {
    aceptable: 'Aceptable',
    puede_requerir_cambios: 'Puede requerir cambios',
    requiere_cambios_pronto: 'Requiere cambios pronto',
    requiere_cambios_ya: 'Requiere cambios ya',
  };
  const colores = {
    aceptable: '#16a34a',
    puede_requerir_cambios: '#d97706',
    requiere_cambios_pronto: '#ea580c',
    requiere_cambios_ya: '#dc2626',
  };

  new Chart(document.getElementById('c-rula'), {
    type: 'doughnut',
    data: {
      labels: datos.map(d => etiquetas[d.nivel_riesgo] || d.nivel_riesgo),
      datasets: [{
        data: datos.map(d => parseInt(d.cantidad, 10)),
        backgroundColor: datos.map(d => colores[d.nivel_riesgo] || '#94a3b8'),
        borderWidth: 2, borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } },
      },
      cutout: '60%',
    }
  });
}

// ------- Lista: EMOs próximas a vencer -------
function renderizarEmosProximas(datos) {
  const cont = document.getElementById('lista-emos');
  if (!datos || datos.length === 0) {
    cont.innerHTML = '<div class="sin-datos"><div class="sin-datos-icono">✅</div>No hay exámenes vencidos ni por vencer en los próximos 30 días.</div>';
    return;
  }

  cont.innerHTML = datos.map(d => {
    const vencida = d.dias_vencida > 0;
    const chip = vencida
      ? `<span class="sisso-chip rojo">Vencida hace ${d.dias_vencida}d</span>`
      : `<span class="sisso-chip ambar">Vence ${formatearFecha(d.fecha_vencimiento)}</span>`;
    return `<div class="emo-item"><span>${escHtml(d.nombre_completo)}</span>${chip}</div>`;
  }).join('');
}

// ------- Lista: Actividad reciente -------
function renderizarActividadReciente(datos) {
  const cont = document.getElementById('lista-actividad');
  if (!datos || datos.length === 0) {
    cont.innerHTML = '<div class="sin-datos"><div class="sin-datos-icono">📝</div>Aún no hay actividad registrada.</div>';
    return;
  }

  const iconos = { reba: '📐', rula: '📏', aptitud: '🩺' };
  const etiquetasTipo = { reba: 'REBA', rula: 'RULA', aptitud: 'Aptitud' };
  const etiquetasAptitud = { apto: 'Apto', con_restricciones: 'Con restricciones', no_apto: 'No apto', pendiente: 'Pendiente' };

  cont.innerHTML = datos.map(d => `
    <div class="actividad-item">
      <div class="actividad-icono ${d.tipo}">${iconos[d.tipo] || '📌'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(d.trabajador)}</div>
        <div style="color:var(--t3);">
          ${etiquetasTipo[d.tipo]}
          ${d.tipo === 'aptitud'
            ? ` · ${etiquetasAptitud[d.descripcion] || d.descripcion}`
            : d.valor !== null ? ` · Score ${d.valor}` : ''
          }
        </div>
      </div>
      <span style="font-size:10.5px;color:var(--t3);white-space:nowrap;margin-left:8px;">${formatearHora(d.creado_en)}</span>
    </div>`).join('');
}

// ------- Helpers -------
function formatearFecha(fecha) {
  if (!fecha) return '';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day:'2-digit', month:'short' });
}
function formatearHora(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleString('es-EC', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
