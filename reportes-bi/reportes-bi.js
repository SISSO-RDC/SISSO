// ============================================================
// SISSO - Reportes BI: panorama consolidado de todos los
// modulos, filtrable por periodo (12 meses / año / trimestre /
// rango personalizado / todo el historico) y por area.
//
// El mismo JSON (GET /reportes/resumen) alimenta:
//   - los graficos en pantalla (Chart.js)
//   - el Excel (armado en el navegador con SheetJS, sin pedirle
//     nada nuevo al backend)
//   - el PDF (el backend lo genera aparte con pdfkit, pero con
//     la MISMA funcion de agregacion, para que nunca se desfasen
//     los numeros entre pantalla/Excel/PDF)
// ============================================================

let ultimoResumen = null;
let ultimosFiltros = { desde: null, hasta: null, area: null };
const graficosActivos = [];

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('reportes', 'Reportes BI');
  poblarSelectorAnio();
  await cargarAreas();
  await aplicarFiltrosBI();
});

function poblarSelectorAnio() {
  const anioActual = new Date().getFullYear();
  const select = document.getElementById('f-anio');
  let opciones = '';
  for (let a = anioActual; a >= anioActual - 6; a--) opciones += `<option value="${a}">${a}</option>`;
  select.innerHTML = opciones;
}

async function cargarAreas() {
  try {
    const datos = await sissoFetch('/reportes/areas');
    const select = document.getElementById('f-area');
    select.innerHTML = '<option value="">Todas</option>' + (datos.areas || []).map(a => `<option value="${escHtmlBI(a)}">${escHtmlBI(a)}</option>`).join('');
  } catch (err) {
    mostrarErrorBI('No se pudieron cargar las áreas: ' + err.message);
  }
}

// ------------------------------------------------------------
// Calculo del rango de fechas segun el periodo elegido
// ------------------------------------------------------------
function formatearISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cambiarPeriodo() {
  const periodo = document.getElementById('f-periodo').value;
  document.getElementById('campo-anio').style.display = (periodo === 'anio' || periodo === 'trimestre') ? '' : 'none';
  document.getElementById('campo-trimestre').style.display = (periodo === 'trimestre') ? '' : 'none';
  document.getElementById('campo-desde').style.display = (periodo === 'personalizado') ? '' : 'none';
  document.getElementById('campo-hasta').style.display = (periodo === 'personalizado') ? '' : 'none';
  aplicarFiltrosBI();
}

function calcularRangoFechas() {
  const periodo = document.getElementById('f-periodo').value;

  if (periodo === 'todo') return { desde: null, hasta: null };

  if (periodo === '12m') {
    const hoy = new Date();
    const hace12 = new Date(hoy);
    hace12.setMonth(hace12.getMonth() - 12);
    return { desde: formatearISO(hace12), hasta: formatearISO(hoy) };
  }

  if (periodo === 'anio') {
    const anio = parseInt(document.getElementById('f-anio').value, 10);
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
  }

  if (periodo === 'trimestre') {
    const anio = parseInt(document.getElementById('f-anio').value, 10);
    const t = parseInt(document.getElementById('f-trimestre').value, 10);
    const mesInicio = (t - 1) * 3 + 1;
    const mesFin = mesInicio + 2;
    const ultimoDia = new Date(anio, mesFin, 0).getDate();
    return {
      desde: `${anio}-${String(mesInicio).padStart(2, '0')}-01`,
      hasta: `${anio}-${String(mesFin).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
    };
  }

  // personalizado
  return {
    desde: document.getElementById('f-desde').value || null,
    hasta: document.getElementById('f-hasta').value || null,
  };
}

// ------------------------------------------------------------
// Carga principal
// ------------------------------------------------------------
async function aplicarFiltrosBI() {
  ocultarErrorBI();
  const { desde, hasta } = calcularRangoFechas();
  const area = document.getElementById('f-area').value;
  ultimosFiltros = { desde, hasta, area: area || null };

  document.getElementById('contenido-bi').innerHTML = '<div class="sisso-cargando">Cargando reporte…</div>';

  const params = new URLSearchParams();
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if (area) params.set('area', area);

  try {
    const datos = await sissoFetch(`/reportes/resumen?${params.toString()}`);
    ultimoResumen = datos;
    renderizarReporte(datos);
  } catch (err) {
    document.getElementById('contenido-bi').innerHTML = '';
    mostrarErrorBI('Error al calcular el reporte: ' + err.message);
  }
}

// ------------------------------------------------------------
// Render de todas las secciones (KPIs + graficos)
// ------------------------------------------------------------
function limpiarGraficos() {
  graficosActivos.forEach(g => g.destroy());
  graficosActivos.length = 0;
}

function renderizarReporte(r) {
  limpiarGraficos();

  const cont = document.getElementById('contenido-bi');

  // CORREGIDO (hallazgo MODERADO de la auditoria: "evitar inferencias
  // en indicadores de grupos pequeños"). Si el area filtrada tiene
  // menos trabajadores que el minimo de k-anonimato, el backend
  // devuelve aptitudMedica/examenesComplementarios/ergonomia como
  // objetos "redactado: true" en vez de los conteos reales, para no
  // revelar por deduccion el estado de salud de una persona
  // identificable. Mostramos un aviso claro en vez de intentar
  // graficar datos que ya no vienen con la forma esperada.
  const avisoGrupoPequeno = r.grupoPequenoRedactado
    ? `<div style="background:var(--amb3,#fef3c7);color:var(--amb2,#92400e);border:1px solid var(--amb2,#92400e);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;line-height:1.5;">
         ⚠️ El área seleccionada tiene muy pocos trabajadores. Para proteger la confidencialidad de la información médica,
         los desgloses de aptitud, exámenes complementarios y ergonomía no se muestran para grupos tan pequeños.
         Selecciona "Todas las áreas" o un rango que incluya más personas para ver ese detalle.
       </div>`
    : '';

  // CORREGIDO en Auditoria N.15: el backend (reportesController.js)
  // ahora OMITE por completo la clave de cada seccion que el rol
  // actual no debe ver (ver proyectarResumenSegunRol), en vez de
  // enviar un objeto vacio "_restringido:true" que dejaba la clave
  // presente. Cada bloque de abajo se arma condicionalmente segun
  // que claves llegaron en `r`, para no asumir nunca su presencia.
  // `r._seccionesNoDisponibles` (solo nombres) se usa para el aviso.
  const seccionesHtml = [];

  seccionesHtml.push(`
    <div class="seccion-bi">
      <div class="seccion-bi-titulo">1–2. Cobertura EMO${r.aptitudMedica ? ' y aptitud médica' : ''}</div>
      <div class="grid-graficos">
        <div class="caja-grafico"><div class="caja-grafico-titulo">Cobertura EMO</div><canvas id="c-emo"></canvas></div>
        ${r.aptitudMedica ? '<div class="caja-grafico"><div class="caja-grafico-titulo">Distribución de aptitud médica</div><canvas id="c-aptitud"></canvas></div>' : ''}
      </div>
      ${r.grupoPequenoRedactado && r.aptitudMedica ? '<p style="color:var(--t3);font-size:12.5px;margin-top:8px;">Distribución de aptitud oculta (grupo pequeño).</p>' : ''}
    </div>`);

  if (r.examenesComplementarios) {
    seccionesHtml.push(`
    <div class="seccion-bi">
      <div class="seccion-bi-titulo">3. Exámenes complementarios</div>
      <div class="grid-graficos">
        <div class="caja-grafico"><div class="caja-grafico-titulo">Cobertura por examen</div><canvas id="c-cobertura-examenes"></canvas></div>
        <div class="caja-grafico"><div class="caja-grafico-titulo">% hallazgos anormales</div><canvas id="c-anormales-examenes"></canvas></div>
      </div>
    </div>`);
  }

  if (r.ausentismo) {
    seccionesHtml.push(`
    <div class="seccion-bi">
      <div class="seccion-bi-titulo">4. Ausentismo laboral</div>
      <div class="grid-graficos">
        <div class="caja-grafico"><div class="caja-grafico-titulo">Días perdidos por tipo de ausencia</div><canvas id="c-ausentismo"></canvas></div>
        <div class="caja-grafico">
          <div class="caja-grafico-titulo">Resumen</div>
          <div class="kpi-grid" style="margin-bottom:0;">
            <div class="kpi-tarjeta"><div class="kpi-numero">${r.ausentismo.totalAusencias}</div><div class="kpi-etiqueta">Ausencias en el período</div></div>
            <div class="kpi-tarjeta"><div class="kpi-numero">${r.ausentismo.totalDias}</div><div class="kpi-etiqueta">Días perdidos</div></div>
          </div>
        </div>
      </div>
    </div>`);
  }

  if (r.matrizRiesgos) {
    seccionesHtml.push(`
    <div class="seccion-bi">
      <div class="seccion-bi-titulo">5. Matriz de riesgos (IPER)</div>
      <div class="grid-graficos">
        <div class="caja-grafico"><div class="caja-grafico-titulo">Distribución por clasificación</div><canvas id="c-matriz"></canvas></div>
        <div class="caja-grafico">
          <div class="caja-grafico-titulo">Resumen</div>
          <div class="kpi-grid" style="margin-bottom:0;">
            <div class="kpi-tarjeta"><div class="kpi-numero">${r.matrizRiesgos.total}</div><div class="kpi-etiqueta">Peligros identificados (activos)</div></div>
            <div class="kpi-tarjeta"><div class="kpi-numero">${r.matrizRiesgos.porcentajeAltoRiesgo}%</div><div class="kpi-etiqueta">Importante / intolerable</div></div>
          </div>
          ${r.matrizRiesgos.nota ? `<div class="nota-metodologica">${escHtmlBI(r.matrizRiesgos.nota)}</div>` : ''}
        </div>
      </div>
    </div>`);
  }

  if (r.ergonomia) {
    seccionesHtml.push(`
    <div class="seccion-bi">
      <div class="seccion-bi-titulo">6. Ergonomía (Nórdico y NIOSH)</div>
      <div class="grid-graficos">
        <div class="caja-grafico"><div class="caja-grafico-titulo">Cuestionario Nórdico</div><canvas id="c-nordico"></canvas></div>
        <div class="caja-grafico"><div class="caja-grafico-titulo">Ecuación NIOSH</div><canvas id="c-niosh"></canvas></div>
      </div>
    </div>`);
  }

  if (r.consentimientos) {
    seccionesHtml.push(`
    <div class="seccion-bi">
      <div class="seccion-bi-titulo">7. Consentimientos informados</div>
      <div class="grid-graficos">
        <div class="caja-grafico"><div class="caja-grafico-titulo">Método de firma</div><canvas id="c-consentimientos"></canvas></div>
        <div class="caja-grafico">
          <div class="caja-grafico-titulo">Resumen</div>
          <div class="kpi-grid" style="margin-bottom:0;">
            <div class="kpi-tarjeta"><div class="kpi-numero">${r.consentimientos.total}</div><div class="kpi-etiqueta">Total registrados</div></div>
            <div class="kpi-tarjeta"><div class="kpi-numero">${r.consentimientos.revocados}</div><div class="kpi-etiqueta">Revocados (${r.consentimientos.porcentajeRevocados}%)</div></div>
          </div>
        </div>
      </div>
    </div>`);
  }

  const avisoRolHtml = (Array.isArray(r._seccionesNoDisponibles) && r._seccionesNoDisponibles.length > 0)
    ? `<div style="color:var(--t3);font-size:12.5px;margin:8px 0 16px;">Algunas secciones de este reporte no se muestran porque no corresponden a tu rol.</div>`
    : '';

  cont.innerHTML = `
    ${avisoGrupoPequeno}
    <div class="kpi-grid" id="kpi-grid-bi"></div>
    ${seccionesHtml.join('\n')}
    ${avisoRolHtml}
  `;

  const kpisTop = [
    `<div class="kpi-tarjeta"><div class="kpi-numero">${r.trabajadores.total}</div><div class="kpi-etiqueta">Trabajadores activos</div></div>`,
    `<div class="kpi-tarjeta"><div class="kpi-numero">${r.coberturaEmo.porcentajeVigente}%</div><div class="kpi-etiqueta">EMO vigente</div></div>`,
  ];
  if (r.aptitudMedica) {
    kpisTop.push(`<div class="kpi-tarjeta"><div class="kpi-numero">${r.grupoPequenoRedactado ? '—' : r.aptitudMedica.porcentajeApto + '%'}</div><div class="kpi-etiqueta">Aptitud: apto</div></div>`);
  }
  if (r.ausentismo) {
    kpisTop.push(`<div class="kpi-tarjeta"><div class="kpi-numero">${r.ausentismo.totalDias}</div><div class="kpi-etiqueta">Días de ausentismo</div></div>`);
  }
  if (r.matrizRiesgos) {
    kpisTop.push(`<div class="kpi-tarjeta"><div class="kpi-numero">${r.matrizRiesgos.porcentajeAltoRiesgo}%</div><div class="kpi-etiqueta">Riesgos alto/muy alto</div></div>`);
  }
  document.getElementById('kpi-grid-bi').innerHTML = kpisTop.join('\n');

  renderGraficoEmo(r.coberturaEmo);
  if (r.aptitudMedica && !r.grupoPequenoRedactado) renderGraficoAptitud(r.aptitudMedica);
  if (r.examenesComplementarios && !r.grupoPequenoRedactado) {
    renderGraficoCoberturaExamenes(r.examenesComplementarios);
    renderGraficoAnormalesExamenes(r.examenesComplementarios);
  }
  if (r.ergonomia && !r.grupoPequenoRedactado) {
    renderGraficoNordico(r.ergonomia.nordico);
    renderGraficoNiosh(r.ergonomia.niosh);
  }
  if (r.ausentismo) renderGraficoAusentismo(r.ausentismo);
  if (r.matrizRiesgos) renderGraficoMatriz(r.matrizRiesgos);
  if (r.consentimientos) renderGraficoConsentimientos(r.consentimientos);
}

function crearDona(idCanvas, etiquetas, datos, colores) {
  const total = datos.reduce((a, b) => a + b, 0);
  const contenedor = document.getElementById(idCanvas).parentElement;
  if (total === 0) {
    document.getElementById(idCanvas).style.display = 'none';
    contenedor.insertAdjacentHTML('beforeend', '<div class="sin-datos-mini">Sin datos en este período.</div>');
    return;
  }
  const g = new Chart(document.getElementById(idCanvas), {
    type: 'doughnut',
    data: { labels: etiquetas, datasets: [{ data: datos, backgroundColor: colores, borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10.5 }, padding: 10 } } }, cutout: '62%' },
  });
  graficosActivos.push(g);
}

function crearBarras(idCanvas, etiquetas, datasets, opciones) {
  const contenedor = document.getElementById(idCanvas).parentElement;
  const sinDatos = datasets.every(d => d.data.every(v => !v));
  if (etiquetas.length === 0 || sinDatos) {
    document.getElementById(idCanvas).style.display = 'none';
    contenedor.insertAdjacentHTML('beforeend', '<div class="sin-datos-mini">Sin datos en este período.</div>');
    return;
  }
  const g = new Chart(document.getElementById(idCanvas), {
    type: 'bar',
    data: { labels: etiquetas, datasets },
    options: Object.assign({ responsive: true, plugins: { legend: { display: datasets.length > 1, position: 'bottom' } }, scales: { y: { beginAtZero: true } } }, opciones || {}),
  });
  graficosActivos.push(g);
}

function renderGraficoEmo(d) {
  crearDona('c-emo', ['Vigente', 'Vencido', 'Sin fecha'], [d.vigente, d.vencido, d.sinFecha], ['#16a34a', '#dc2626', '#94a3b8']);
}
function renderGraficoAptitud(d) {
  crearDona('c-aptitud', ['Apto', 'Con restricciones', 'No apto', 'Pendiente'], [d.apto, d.conRestricciones, d.noApto, d.pendiente], ['#16a34a', '#d97706', '#dc2626', '#94a3b8']);
}
function renderGraficoCoberturaExamenes(e) {
  crearBarras('c-cobertura-examenes', ['Audiometría', 'Espirometría', 'Visiometría'],
    [{ label: '% cobertura', data: [e.audiometria.porcentajeCobertura, e.espirometria.porcentajeCobertura, e.visiometria.porcentajeCobertura], backgroundColor: '#0d9488', borderRadius: 6 }],
    { scales: { y: { max: 100 } } });
}
function renderGraficoAnormalesExamenes(e) {
  crearBarras('c-anormales-examenes', ['Audiometría', 'Espirometría', 'Visiometría'],
    [{ label: '% anormales', data: [e.audiometria.porcentajeAnormales, e.espirometria.porcentajeAnormales, e.visiometria.porcentajeAnormales], backgroundColor: '#dc2626', borderRadius: 6 }],
    { scales: { y: { max: 100 } } });
}
function renderGraficoAusentismo(a) {
  crearBarras('c-ausentismo', a.porTipo.map(t => t.etiqueta), [{ label: 'Días', data: a.porTipo.map(t => t.dias), backgroundColor: '#2563eb', borderRadius: 6 }]);
}
function renderGraficoMatriz(m) {
  const orden = ['trivial', 'tolerable', 'moderado', 'importante', 'intolerable'];
  const colores = { trivial: '#16a34a', tolerable: '#65a30d', moderado: '#d97706', importante: '#ea580c', intolerable: '#dc2626' };
  crearDona('c-matriz', orden.map(c => c.charAt(0).toUpperCase() + c.slice(1)), orden.map(c => m.porClasificacion[c] || 0), orden.map(c => colores[c]));
}
function renderGraficoNordico(n) {
  crearDona('c-nordico', ['Prioritarios', 'Sin prioridad'], [n.prioritarios, Math.max(n.total - n.prioritarios, 0)], ['#dc2626', '#16a34a']);
}
function renderGraficoNiosh(n) {
  crearDona('c-niosh', ['Riesgo alto/muy alto', 'Resto'], [n.altoRiesgo, Math.max(n.total - n.altoRiesgo, 0)], ['#dc2626', '#16a34a']);
}
function renderGraficoConsentimientos(c) {
  crearDona('c-consentimientos', ['Electrónica', 'Física escaneada', 'Revocados'], [c.electronica, c.fisica, c.revocados], ['#0d9488', '#64748b', '#dc2626']);
}

// ------------------------------------------------------------
// Exportar a Excel (SheetJS, construido en el navegador a partir
// del mismo JSON que ya se cargo para pantalla — nunca se vuelve
// a pedir nada distinto al backend)
// ------------------------------------------------------------
function descargarExcel() {
  if (!ultimoResumen) { alert('Todavía no hay datos cargados.'); return; }
  const r = ultimoResumen;
  const wb = XLSX.utils.book_new();

  // CORREGIDO (hallazgo MODERADO: inferencias en grupos pequeños):
  // si el backend redacto los desgloses sensibles por k-anonimato,
  // el Excel no debe intentar leer campos que ya no vienen (apto,
  // conRestricciones, etc.) ni reconstruirlos por otra via.
  const redactado = Boolean(r.grupoPequenoRedactado);

  const hojaResumen = [
    ['Reporte BI — Seguridad y Salud Ocupacional'],
    ['Período', `${ultimosFiltros.desde || 'inicio'} a ${ultimosFiltros.hasta || 'hoy'}`],
    ['Área', ultimosFiltros.area || 'Todas'],
    [],
    ['Trabajadores activos', r.trabajadores.total],
    ['EMO vigente', r.coberturaEmo.vigente, `${r.coberturaEmo.porcentajeVigente}%`],
    ['EMO vencido', r.coberturaEmo.vencido],
    ['EMO sin fecha', r.coberturaEmo.sinFecha],
    [],
  ];
  // CORREGIDO en Auditoria N.15: cada hoja ahora se arma segun la
  // PRESENCIA de la clave en el JSON, no solo segun `redactado`. El
  // backend (proyectarResumenSegunRol) omite por completo secciones
  // que el rol de quien exporta no debe ver (ej. 'th' nunca recibe
  // aptitudMedica) -- antes este archivo asumia que esas claves
  // siempre existian y el Excel fallaba (o, peor, un cambio futuro
  // que las agregara vacias podria haber expuesto ceros enganosos).
  if (r.aptitudMedica) {
    if (redactado) {
      hojaResumen.push(['Aptitud médica', 'Oculto: área con menos del mínimo de trabajadores requerido para proteger la confidencialidad.']);
    } else {
      hojaResumen.push(
        ['Aptitud: apto', r.aptitudMedica.apto, `${r.aptitudMedica.porcentajeApto}%`],
        ['Aptitud: con restricciones', r.aptitudMedica.conRestricciones],
        ['Aptitud: no apto', r.aptitudMedica.noApto],
        ['Aptitud: pendiente', r.aptitudMedica.pendiente],
      );
    }
  } else {
    hojaResumen.push(['Aptitud médica', 'No disponible para tu rol.']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaResumen), 'Resumen');

  if (r.examenesComplementarios) {
    const hojaExamenes = redactado
      ? [['Exámenes complementarios'], ['Oculto: área con menos del mínimo de trabajadores requerido para proteger la confidencialidad.']]
      : [
          ['Examen', 'Trabajadores cubiertos', '% cobertura', 'Total exámenes', 'Anormales', '% anormales'],
          ['Audiometría', r.examenesComplementarios.audiometria.trabajadoresCubiertos, r.examenesComplementarios.audiometria.porcentajeCobertura, r.examenesComplementarios.audiometria.total, r.examenesComplementarios.audiometria.anormales, r.examenesComplementarios.audiometria.porcentajeAnormales],
          ['Espirometría', r.examenesComplementarios.espirometria.trabajadoresCubiertos, r.examenesComplementarios.espirometria.porcentajeCobertura, r.examenesComplementarios.espirometria.total, r.examenesComplementarios.espirometria.anormales, r.examenesComplementarios.espirometria.porcentajeAnormales],
          ['Visiometría', r.examenesComplementarios.visiometria.trabajadoresCubiertos, r.examenesComplementarios.visiometria.porcentajeCobertura, r.examenesComplementarios.visiometria.total, r.examenesComplementarios.visiometria.anormales, r.examenesComplementarios.visiometria.porcentajeAnormales],
        ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaExamenes), 'Examenes');
  }

  if (r.ausentismo) {
    const hojaAusentismo = [
      ['Tipo de ausencia', 'Ausencias', 'Días'],
      ...r.ausentismo.porTipo.map(t => [t.etiqueta, t.ausencias, t.dias]),
      [],
      ['TOTAL', r.ausentismo.totalAusencias, r.ausentismo.totalDias],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaAusentismo), 'Ausentismo');
  }

  if (r.matrizRiesgos) {
    const hojaMatriz = [
      ['Clasificación', 'Cantidad'],
      ...Object.entries(r.matrizRiesgos.porClasificacion).map(([k, v]) => [k, v]),
      [],
      ['Nota', r.matrizRiesgos.nota || ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaMatriz), 'Matriz de riesgos');
  }

  if (r.ergonomia) {
    const hojaErgonomia = redactado
      ? [['Ergonomía'], ['Oculto: área con menos del mínimo de trabajadores requerido para proteger la confidencialidad.']]
      : [
          ['Herramienta', 'Total evaluaciones', 'Casos de atención prioritaria/alto riesgo', '%'],
          ['Cuestionario Nórdico', r.ergonomia.nordico.total, r.ergonomia.nordico.prioritarios, r.ergonomia.nordico.porcentaje],
          ['Ecuación NIOSH', r.ergonomia.niosh.total, r.ergonomia.niosh.altoRiesgo, r.ergonomia.niosh.porcentaje],
        ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaErgonomia), 'Ergonomia');
  }

  if (r.consentimientos) {
    const hojaConsentimientos = [
      ['Total', 'Electrónica', 'Física escaneada', 'Revocados', '% revocados'],
      [r.consentimientos.total, r.consentimientos.electronica, r.consentimientos.fisica, r.consentimientos.revocados, r.consentimientos.porcentajeRevocados],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaConsentimientos), 'Consentimientos');
  }

  const nombreArchivo = `reporte-bi-sso_${ultimosFiltros.desde || 'inicio'}_${ultimosFiltros.hasta || 'hoy'}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}

// ------------------------------------------------------------
// Exportar a PDF (el backend genera el PDF completo con pdfkit,
// aqui solo lo pedimos con autenticacion y lo abrimos)
// ------------------------------------------------------------
async function descargarPdf() {
  ocultarErrorBI();
  try {
    const params = new URLSearchParams();
    if (ultimosFiltros.desde) params.set('desde', ultimosFiltros.desde);
    if (ultimosFiltros.hasta) params.set('hasta', ultimosFiltros.hasta);
    if (ultimosFiltros.area) params.set('area', ultimosFiltros.area);
    const blob = await sissoDescargarArchivo(`/reportes/pdf?${params.toString()}`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    mostrarErrorBI('Error al generar el PDF: ' + err.message);
  }
}

// ------- Utilidades -------
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtmlBI = escaparHtml;
function mostrarErrorBI(msg) { const el = document.getElementById('error-bi'); el.textContent = msg; el.classList.add('visible'); }
function ocultarErrorBI() { document.getElementById('error-bi').classList.remove('visible'); }
