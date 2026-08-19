// ============================================================
// SISSO - Alertas: panel consolidado (ver alertasController.js
// para el detalle de que se agrega y como se filtra por rol).
// ============================================================

const CATEGORIAS = [
  {
    clave: 'emos_vencidos_o_criticos', titulo: '🩺 EMOs vencidos o por vencer (≤15 días)', pagina: '../trabajadores/index.html',
    render: (i) => ({
      titulo: `${i.nombre_completo} — ${i.documento}`,
      detalle: i.dias_restantes < 0 ? `Venció hace ${Math.abs(i.dias_restantes)} días` : `Vence en ${i.dias_restantes} días (${formatearFecha(i.fecha_vencimiento)})`,
    }),
  },
  {
    clave: 'consentimientos_revocados', titulo: '✋ Consentimientos revocados recientemente', pagina: '../consentimientos/index.html',
    render: (i) => ({ titulo: `${i.nombre_completo} — ${i.documento}`, detalle: `${i.tipo_consentimiento_nombre} · Revocado el ${formatearFecha(i.revocado_en)}` }),
  },
  {
    clave: 'aptitud_no_apto', titulo: '⛔ Trabajadores con aptitud "No apto"', pagina: '../aptitud/index.html',
    render: (i) => ({ titulo: `${i.nombre_completo} — ${i.documento}`, detalle: 'Aptitud médica vigente: No apto' }),
  },
  {
    clave: 'historia_clinica_aptitud_limitada', titulo: '📋 Historia clínica: aptitud limitada o no apta', pagina: '../historia-clinica/index.html',
    render: (i) => ({ titulo: `${i.nombre_completo} — ${i.documento}`, detalle: `${etiquetaTipoEvaluacion(i.tipo_evaluacion)} · ${etiquetaAptitud(i.aptitud_msp)} · ${formatearFecha(i.fecha_atencion)}` }),
  },
  {
    clave: 'audiometria_sts', titulo: '🔊 Audiometría: cambio significativo del umbral (STS)', pagina: '../audiometria/index.html',
    render: (i) => ({ titulo: `${i.nombre_completo} — ${i.documento}`, detalle: `${i.sts_od_positivo ? 'Oído derecho' : ''}${i.sts_od_positivo && i.sts_oi_positivo ? ' y ' : ''}${i.sts_oi_positivo ? 'Oído izquierdo' : ''} · ${formatearFecha(i.fecha_examen)}` }),
  },
  {
    clave: 'espirometria_patron_anormal', titulo: '💨 Espirometría: patrón distinto de normal', pagina: '../espirometria/index.html',
    render: (i) => ({ titulo: `${i.nombre_completo} — ${i.documento}`, detalle: `Patrón: ${(i.patron || '').replace(/_/g, ' ')} · ${formatearFecha(i.fecha_examen)}` }),
  },
  {
    clave: 'visiometria_requiere_evaluacion', titulo: '👁️ Visiometría: requiere evaluación oftalmológica', pagina: '../visiometria/index.html',
    render: (i) => ({ titulo: `${i.nombre_completo} — ${i.documento}`, detalle: `${formatearFecha(i.fecha_examen)}` }),
  },
  {
    clave: 'nordico_prioritario', titulo: '🗂️ Cuestionario Nórdico: zonas prioritarias', pagina: '../nordico/index.html',
    render: (i) => ({ titulo: `${i.nombre_completo} — ${i.documento}`, detalle: `${(i.regiones_prioritarias || []).join(', ')} · ${formatearFecha(i.fecha_aplicacion)}` }),
  },
  {
    clave: 'niosh_riesgo_alto', titulo: '⚖️ NIOSH: riesgo alto o muy alto', pagina: '../niosh/index.html',
    render: (i) => ({ titulo: `${i.nombre_completo} — ${i.documento}`, detalle: `${i.nombre_tarea} · LI ${i.li} · ${formatearFecha(i.fecha_evaluacion)}` }),
  },
];

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('alertas', 'Alertas');
  await cargarAlertas();
});

async function cargarAlertas() {
  try {
    const datos = await sissoFetch('/alertas');
    renderizar(datos.alertas, datos.total);
  } catch (err) {
    document.getElementById('contenido-alertas').innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

function renderizar(alertas, total) {
  const cont = document.getElementById('contenido-alertas');

  if (total === 0) {
    cont.innerHTML = '<div class="todo-bien">✅ No hay situaciones pendientes de atención en este momento.</div>';
    return;
  }

  cont.innerHTML = CATEGORIAS
    .filter(cat => alertas[cat.clave] && alertas[cat.clave].length > 0)
    .map(cat => {
      const items = alertas[cat.clave];
      return `
        <div class="categoria-tarjeta">
          <div class="categoria-cabecera">
            <div class="categoria-titulo">${cat.titulo}</div>
            <div class="categoria-contador">${items.length}</div>
          </div>
          ${items.map(item => {
            const r = cat.render(item);
            return `
              <div class="alerta-item" onclick="irATrabajador('${item.trabajador_id || item.id}', '${cat.pagina}')">
                <div class="alerta-info">
                  <strong>${escHtml(r.titulo)}</strong>
                  <div class="alerta-detalle">${escHtml(r.detalle)}</div>
                </div>
                <span style="color:var(--teal2);font-size:12px;font-weight:600;">Ver →</span>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');
}

function irATrabajador(trabajadorId, pagina) {
  if (trabajadorId) localStorage.setItem('sisso_trabajador_id', trabajadorId);
  window.location.href = pagina;
}

// ------- Utilidades -------
function etiquetaTipoEvaluacion(tipo) {
  const mapa = { preocupacional_inicio: 'Preocupacional', periodica: 'Periódica', reintegro: 'Reintegro', retiro: 'Retiro' };
  return mapa[tipo] || tipo;
}
function etiquetaAptitud(apt) {
  const mapa = { no_apto: 'No apto', apto_con_limitaciones: 'Apto con limitaciones' };
  return mapa[apt] || apt;
}
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
