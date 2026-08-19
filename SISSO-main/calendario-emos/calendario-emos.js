// ============================================================
// SISSO - Calendario EMOs / Proximos examenes
// ============================================================

let trabajadoresCompleto = [];
let filtroUrgencia = null; // null = todos

const INFO_URGENCIA = {
  vencido:    { etiqueta: 'Vencido',            color: 'var(--red2)',  bg: 'var(--red3)' },
  critico:    { etiqueta: 'Crítico (≤15 días)', color: 'var(--red2)',  bg: 'var(--red3)' },
  proximo:    { etiqueta: 'Próximo (≤30 días)', color: 'var(--amb2)',  bg: 'var(--amb3)' },
  proximo_60: { etiqueta: 'Próximo (≤60 días)', color: 'var(--amb2)',  bg: 'var(--amb3)' },
  normal:     { etiqueta: 'Al día',             color: 'var(--grn2)',  bg: 'var(--grn3)' },
  sin_fecha:  { etiqueta: 'Sin fecha registrada', color: 'var(--t2)',  bg: 'var(--bg3)' },
};

const ORDEN_RESUMEN = ['vencido', 'critico', 'proximo', 'proximo_60', 'normal', 'sin_fecha'];
const ETIQUETAS_RESUMEN = {
  vencido: 'Vencidos', critico: 'Críticos (≤15d)', proximo: 'Próximos (≤30d)',
  proximo_60: 'Próximos (≤60d)', normal: 'Al día', sin_fecha: 'Sin fecha',
};

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('calendario', 'Calendario EMOs');
  await cargarDatos();
});

async function cargarDatos() {
  try {
    const datos = await sissoFetch('/trabajadores/proximos-examenes');
    trabajadoresCompleto = datos.trabajadores || [];
    renderizarResumen(datos.resumen || {});
    filtrarYRenderizar();
  } catch (err) {
    mostrarError(err.message);
  }
}

function renderizarResumen(resumen) {
  const total = Object.values(resumen).reduce((a, b) => a + b, 0);
  const cont = document.getElementById('resumen-grid');
  const chipTodos = `
    <div class="resumen-item ${filtroUrgencia === null ? 'activo' : ''}" onclick="aplicarFiltro(null)">
      <div class="numero">${total}</div><div class="etiqueta">Todos</div>
    </div>`;
  const chipsUrgencia = ORDEN_RESUMEN.filter(u => resumen[u]).map(u => `
    <div class="resumen-item ${filtroUrgencia === u ? 'activo' : ''}" onclick="aplicarFiltro('${u}')">
      <div class="numero" style="color:${INFO_URGENCIA[u].color};">${resumen[u]}</div>
      <div class="etiqueta">${ETIQUETAS_RESUMEN[u]}</div>
    </div>`).join('');
  cont.innerHTML = chipTodos + chipsUrgencia;
}

function aplicarFiltro(urgencia) {
  filtroUrgencia = urgencia;
  document.querySelectorAll('.resumen-item').forEach(el => el.classList.remove('activo'));
  filtrarYRenderizar();
  renderizarResumenActivoVisual();
}

function renderizarResumenActivoVisual() {
  // Vuelve a pintar el resumen para reflejar el filtro activo sin re-consultar el backend.
  const resumen = trabajadoresCompleto.reduce((acc, t) => { acc[t.urgencia] = (acc[t.urgencia] || 0) + 1; return acc; }, {});
  renderizarResumen(resumen);
}

function filtrarYRenderizar() {
  const busqueda = document.getElementById('buscar').value.trim().toLowerCase();
  let lista = trabajadoresCompleto;
  if (filtroUrgencia) lista = lista.filter(t => t.urgencia === filtroUrgencia);
  if (busqueda) lista = lista.filter(t => t.nombre_completo.toLowerCase().includes(busqueda) || t.documento.toLowerCase().includes(busqueda));
  renderizarTabla(lista);
}

function renderizarTabla(lista) {
  const tbody = document.getElementById('tabla-tbody');
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="sisso-vacio">No hay trabajadores que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(t => {
    const info = INFO_URGENCIA[t.urgencia];
    const diasTexto = t.urgencia === 'sin_fecha' ? '—'
      : t.dias_restantes < 0 ? `Venció hace ${Math.abs(t.dias_restantes)} días`
      : t.dias_restantes === 0 ? 'Vence hoy'
      : `En ${t.dias_restantes} días`;
    return `
      <tr>
        <td style="font-weight:600;">${escHtml(t.nombre_completo)}<div style="font-size:11px;color:var(--t3);font-weight:400;">${escHtml(t.documento)}</div></td>
        <td style="color:var(--t3);">${escHtml(t.area || '—')}${t.puesto ? ' — ' + escHtml(t.puesto) : ''}</td>
        <td>${formatearFecha(t.fecha_emo)}</td>
        <td>${formatearFecha(t.fecha_vencimiento)}</td>
        <td>
          <span class="punto-urgencia" style="background:${info.color};"></span>
          <span style="color:${info.color};font-weight:600;">${info.etiqueta}</span>
          <div style="font-size:11px;color:var(--t3);margin-top:2px;margin-left:16px;">${diasTexto}</div>
        </td>
      </tr>`;
  }).join('');
}

// ------- Utilidades -------
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
function mostrarError(msg) {
  const el = document.getElementById('error-general');
  el.textContent = msg;
  el.classList.add('visible');
}
