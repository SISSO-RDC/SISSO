// ============================================================
// SISSO - Indicadores SSO
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('indicadores', 'Indicadores SSO');
  await cargar();
});

function colorPorPorcentaje(pct, invertido) {
  // invertido=true: menos es mejor (ej: % hallazgos anormales, % vencidos)
  const bueno = invertido ? pct <= 10 : pct >= 80;
  const medio = invertido ? pct <= 30 : pct >= 50;
  if (bueno) return { bar: 'var(--grn2)', text: 'var(--grn2)' };
  if (medio) return { bar: 'var(--amb2)', text: 'var(--amb2)' };
  return { bar: 'var(--red2)', text: 'var(--red2)' };
}

function tarjetaKpi(numero, etiqueta, pct, invertido, desglose) {
  const color = pct !== undefined ? colorPorPorcentaje(pct, invertido) : null;
  return `
    <div class="kpi-tarjeta">
      <div class="kpi-numero" style="${color ? `color:${color.text};` : ''}">${numero}</div>
      <div class="kpi-etiqueta">${etiqueta}</div>
      ${pct !== undefined ? `<div class="kpi-barra"><div class="kpi-barra-fill" style="width:${pct}%;background:${color.bar};"></div></div>` : ''}
      ${desglose ? `<div class="kpi-desglose">${desglose}</div>` : ''}
    </div>`;
}

async function cargar() {
  try {
    const d = await sissoFetch('/indicadores');
    renderizar(d);
  } catch (err) {
    document.getElementById('contenido').innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// CORREGIDO en Auditoria N.15: el backend (indicadoresController.js)
// ahora OMITE por completo la clave de cada seccion que el rol
// actual no debe ver (ver proyectarIndicadoresSegunRol) -- ya no
// envia un placeholder vacio con "_restringido:true". Cada bloque de
// renderizado valida primero que su clave exista; si no existe, se
// omite el bloque entero (no se dibuja una tarjeta con 0% que podria
// leerse como "sin riesgo" cuando en realidad el dato simplemente no
// viaja para este rol). `d._seccionesNoDisponibles` (solo nombres de
// seccion) esta disponible si se quiere mostrar un aviso generico.
function seccionHtml(titulo, seccionKey, d, render) {
  if (!d[seccionKey]) return '';
  return `<div class="seccion-titulo">${titulo}</div><div class="kpi-grid">${render(d[seccionKey], d)}</div>`;
}

function renderizar(d) {
  let html = '';

  // ---- Cobertura EMO (siempre presente para todos los roles) ----
  html += `<div class="seccion-titulo">Vigilancia de la salud</div><div class="kpi-grid">`;
  html += tarjetaKpi(`${d.coberturaEmo.porcentajeVigente}%`, `EMO vigente (${d.coberturaEmo.vigente} de ${d.totalTrabajadores} trabajadores)`, d.coberturaEmo.porcentajeVigente, false,
    `<span>Vencidos: ${d.coberturaEmo.vencido}</span><span>Sin fecha: ${d.coberturaEmo.sinFecha}</span>`);
  if (d.aptitudMedica) {
    html += tarjetaKpi(`${d.aptitudMedica.porcentajeApto}%`, `Aptitud "Apto" (${d.aptitudMedica.apto} de ${d.totalTrabajadores})`, d.aptitudMedica.porcentajeApto, false,
      `<span>Con restricciones: ${d.aptitudMedica.conRestricciones}</span><span>No apto: ${d.aptitudMedica.noApto}</span><span>Pendiente: ${d.aptitudMedica.pendiente}</span>`);
  }
  html += `</div>`;

  // ---- Cobertura de examenes complementarios ----
  if (d.coberturaExamenes) {
    html += `<div class="seccion-titulo">Cobertura de exámenes complementarios (últimos 12 meses)</div><div class="kpi-grid">`;
    html += tarjetaKpi(`${d.coberturaExamenes.audiometria.porcentaje}%`, `Audiometría (${d.coberturaExamenes.audiometria.trabajadores} trabajadores)`, d.coberturaExamenes.audiometria.porcentaje, false);
    html += tarjetaKpi(`${d.coberturaExamenes.espirometria.porcentaje}%`, `Espirometría (${d.coberturaExamenes.espirometria.trabajadores} trabajadores)`, d.coberturaExamenes.espirometria.porcentaje, false);
    html += tarjetaKpi(`${d.coberturaExamenes.visiometria.porcentaje}%`, `Visiometría (${d.coberturaExamenes.visiometria.trabajadores} trabajadores)`, d.coberturaExamenes.visiometria.porcentaje, false);
    html += `</div>`;
  }

  // ---- Hallazgos anormales ----
  if (d.hallazgosAnormales) {
    html += `<div class="seccion-titulo">Tasa de hallazgos anormales (últimos 12 meses)</div><div class="kpi-grid">`;
    html += tarjetaKpi(`${d.hallazgosAnormales.audiometria.porcentaje}%`, `Audiometría con STS (${d.hallazgosAnormales.audiometria.anormales} de ${d.hallazgosAnormales.audiometria.total} exámenes)`, d.hallazgosAnormales.audiometria.porcentaje, true);
    html += tarjetaKpi(`${d.hallazgosAnormales.espirometria.porcentaje}%`, `Espirometría con patrón anormal (${d.hallazgosAnormales.espirometria.anormales} de ${d.hallazgosAnormales.espirometria.total})`, d.hallazgosAnormales.espirometria.porcentaje, true);
    html += tarjetaKpi(`${d.hallazgosAnormales.visiometria.porcentaje}%`, `Visiometría requiere evaluación (${d.hallazgosAnormales.visiometria.anormales} de ${d.hallazgosAnormales.visiometria.total})`, d.hallazgosAnormales.visiometria.porcentaje, true);
    html += `</div>`;
  }

  // ---- Matriz de riesgos ----
  if (d.matrizRiesgos) {
    html += `<div class="seccion-titulo">Matriz de riesgos</div><div class="kpi-grid">`;
    html += tarjetaKpi(d.matrizRiesgos.total, 'Riesgos identificados en la matriz', undefined, false);
    html += tarjetaKpi(`${d.matrizRiesgos.porcentajeAltoRiesgo}%`, 'Riesgos importantes o intolerables', d.matrizRiesgos.porcentajeAltoRiesgo, true,
      Object.entries(d.matrizRiesgos.porClasificacion).map(([k, v]) => `<span>${k}: ${v}</span>`).join(''));
    html += `</div>`;
  }

  // ---- Ergonomía ----
  if (d.ergonomia) {
    html += `<div class="seccion-titulo">Ergonomía (últimos 12 meses)</div><div class="kpi-grid">`;
    html += tarjetaKpi(`${d.ergonomia.nordico.porcentaje}%`, `Nórdico con zonas prioritarias (${d.ergonomia.nordico.prioritarios} de ${d.ergonomia.nordico.total})`, d.ergonomia.nordico.porcentaje, true);
    html += tarjetaKpi(`${d.ergonomia.niosh.porcentaje}%`, `NIOSH con riesgo alto/muy alto (${d.ergonomia.niosh.altoRiesgo} de ${d.ergonomia.niosh.total})`, d.ergonomia.niosh.porcentaje, true);
    html += `</div>`;
  }

  // ---- Consentimientos ----
  if (d.consentimientos) {
    html += `<div class="seccion-titulo">Consentimientos informados</div><div class="kpi-grid">`;
    html += tarjetaKpi(d.consentimientos.total, 'Total firmados', undefined, false,
      `<span>Electrónica: ${d.consentimientos.electronica}</span><span>Física escaneada: ${d.consentimientos.fisica}</span>`);
    html += tarjetaKpi(`${d.consentimientos.porcentajeRevocados}%`, `Revocados (${d.consentimientos.revocados} de ${d.consentimientos.total})`, d.consentimientos.porcentajeRevocados, true);
    html += `</div>`;
  }

  // ---- Aviso de secciones no disponibles para este rol ----
  if (Array.isArray(d._seccionesNoDisponibles) && d._seccionesNoDisponibles.length > 0) {
    html += `<div class="sisso-nota-rol">Algunas secciones de este panel no se muestran porque no corresponden a tu rol.</div>`;
  }

  document.getElementById('contenido').innerHTML = html;
}

// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
