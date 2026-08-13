// ============================================================
// SISSO - Historia Clinica Ocupacional: formulario preocupacional
// (HCU 077, Acuerdo Ministerial MSP 0341-2019).
// ============================================================

let trabajadores = [];
let trabajadorActualId = null;
let trabajadorActual = null;
let catalogos = null;
let tipoEvaluacionActual = 'preocupacional_inicio';

// Filas dinamicas
let antecedentesLaborales = [];
let resultadosExamenes = [];
let diagnosticosSeleccionados = [];
let timeoutBusquedaCie10 = null;

// Canvas de firma (opcional en este formulario)
let ctx, dibujando = false;

document.addEventListener('DOMContentLoaded', async () => {
  SissoLayout.iniciar('historia', 'Historia Clínica Ocupacional');

  document.getElementById('p-fecha-atencion').value = new Date().toISOString().split('T')[0];
  document.getElementById('p-hora-atencion').value = new Date().toTimeString().slice(0, 5);

  await Promise.all([cargarTrabajadores(), cargarCatalogos()]);
  renderizarMatricesRiesgo();
  renderizarSistemas();
  renderizarExamenRegional();
  inicializarCanvasFirma();
  cambiarTipoEvaluacion('preocupacional_inicio');

  agregarResultadoExamen(); // arranca con una fila vacia, es comun tener al menos un examen
});

async function cargarTrabajadores() {
  const sel = document.getElementById('sel-trabajador');
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadores = datos.trabajadores || [];
    sel.innerHTML = '<option value="">Selecciona un trabajador…</option>' +
      trabajadores.map(t => `<option value="${t.id}">${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">Error al cargar</option>';
    mostrarError('error-selector', err.message);
  }
}

async function cargarCatalogos() {
  try {
    const datos = await sissoFetch('/historia-clinica/catalogos');
    catalogos = datos.catalogos;
    poblarSelectsCatalogo();
  } catch (err) {
    mostrarError('error-selector', 'Error al cargar catálogos: ' + err.message);
  }
}

function poblarSelectsCatalogo() {
  const llenar = (id, valores, etiquetas) => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">Selecciona…</option>' +
      valores.map(v => `<option value="${v}">${(etiquetas && etiquetas[v]) || v.replace(/_/g, ' ')}</option>`).join('');
  };
  llenar('a-religion', catalogos.RELIGIONES);
  llenar('a-lateralidad', catalogos.LATERALIDADES);
  llenar('a-orientacion-sexual', catalogos.ORIENTACIONES_SEXUALES, { no_sabe_no_responde: 'Prefiere no responder' });
  llenar('a-identidad-genero', catalogos.IDENTIDADES_GENERO, { no_sabe_no_responde: 'Prefiere no responder' });
}

// ------- Selector de trabajador -------
function elegirTrabajador() {
  ocultarError('error-selector');
  const id = document.getElementById('sel-trabajador').value;
  if (!id) { mostrarError('error-selector', 'Selecciona un trabajador.'); return; }
  trabajadorActualId = id;
  trabajadorActual = trabajadores.find(x => x.id === id) || null;
  document.getElementById('titulo-trabajador').textContent = trabajadorActual
    ? `${trabajadorActual.nombre_completo} — ${trabajadorActual.documento}` : 'Trabajador';
  document.getElementById('caja-selector').style.display = 'none';
  document.getElementById('caja-principal').style.display = 'block';

  // Prefill de campos que ya conocemos del trabajador
  document.getElementById('a-area-trabajo').value = trabajadorActual.area || '';
  document.getElementById('f-puesto-area').value = [trabajadorActual.puesto, trabajadorActual.area].filter(Boolean).join(' — ');

  // Mostrar bloques condicionales segun sexo
  const sexo = trabajadorActual.sexo;
  document.getElementById('caja-ginecobstetricos').style.display = sexo === 'F' ? 'block' : 'none';
  document.getElementById('caja-c-femenino').style.display = sexo === 'F' ? 'block' : 'none';
  document.getElementById('caja-c-masculino').style.display = sexo === 'M' ? 'block' : 'none';

  ajustarTamanoCanvasFirma();
  cargarHistorial();
  cargarInmunizaciones();
}

function cambiarTrabajador() {
  trabajadorActualId = null;
  trabajadorActual = null;
  document.getElementById('caja-selector').style.display = 'block';
  document.getElementById('caja-principal').style.display = 'none';
}

// ------- Alternar entre tipo de evaluacion (preocupacional / retiro) -------
function cambiarTipoEvaluacion(tipo) {
  tipoEvaluacionActual = tipo;
  document.getElementById('btn-tipo-preocupacional').classList.toggle('activo', tipo === 'preocupacional_inicio');
  document.getElementById('btn-tipo-periodica').classList.toggle('activo', tipo === 'periodica');
  document.getElementById('btn-tipo-reintegro').classList.toggle('activo', tipo === 'reintegro');
  document.getElementById('btn-tipo-retiro').classList.toggle('activo', tipo === 'retiro');

  document.querySelectorAll('[data-solo]').forEach(el => {
    const tiposPermitidos = el.dataset.solo.split(' ');
    el.style.display = tiposPermitidos.includes(tipo) ? '' : 'none';
  });

  document.getElementById('etiqueta-actividades-relevantes').textContent =
    tipo === 'retiro' ? 'Actividades que desempeñó' : 'Actividades relevantes del puesto';

  const textosBoton = {
    preocupacional_inicio: 'Guardar evaluación preocupacional',
    periodica: 'Guardar evaluación periódica',
    reintegro: 'Guardar evaluación de reintegro',
    retiro: 'Guardar evaluación de retiro',
  };
  document.getElementById('btn-guardar').textContent = textosBoton[tipo];

  ocultarError('error-form');
  ocultarExito('exito-form');
}

function calcularDiasAusencia() {
  const ultimo = document.getElementById('ri-fecha-ultimo-dia').value;
  const reingreso = document.getElementById('ri-fecha-reingreso').value;
  if (!ultimo || !reingreso) return;
  const dias = Math.max(0, Math.round((new Date(reingreso) - new Date(ultimo)) / (24 * 3600 * 1000)));
  document.getElementById('ri-dias-ausencia').value = dias;
}

function calcularTiempoPermanencia() {
  const inicio = document.getElementById('r-fecha-inicio-labores').value;
  const salida = document.getElementById('r-fecha-salida').value;
  if (!inicio || !salida) return;
  const meses = Math.max(0, Math.round((new Date(salida) - new Date(inicio)) / (30.44 * 24 * 3600 * 1000)));
  document.getElementById('r-tiempo-permanencia').value = meses;
}

// ------- Historial -------
async function cargarHistorial() {
  const cont = document.getElementById('lista-evaluaciones');
  cont.innerHTML = '<div class="sisso-cargando">Cargando historial…</div>';
  try {
    const datos = await sissoFetch(`/historia-clinica/trabajadores/${trabajadorActualId}`);
    const evaluaciones = datos.evaluaciones || [];

    if (evaluaciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Aún no hay evaluaciones registradas para este trabajador.</div>';
      return;
    }

    const etiquetasTipo = { preocupacional_inicio: 'Preocupacional — inicio', periodica: 'Periódica', reintegro: 'Reintegro', retiro: 'Retiro' };
    const etiquetasAptitud = {
      apto: ['Apto', 'verde'], apto_en_observacion: ['Apto en observación', 'ambar'],
      apto_con_limitaciones: ['Apto con limitaciones', 'ambar'], no_apto: ['No apto', 'rojo'],
    };

    cont.innerHTML = evaluaciones.map(e => {
      let etiquetaChip, colorChip;
      if (e.tipo_evaluacion === 'retiro') {
        [etiquetaChip, colorChip] = e.retiro_se_realizo_evaluacion === true ? ['Evaluación realizada', 'verde']
          : e.retiro_se_realizo_evaluacion === false ? ['No se realizó', 'rojo'] : ['Sin definir', 'gris'];
      } else {
        [etiquetaChip, colorChip] = etiquetasAptitud[e.aptitud_msp] || ['Sin definir', 'gris'];
      }
      return `
        <div class="historial-item">
          <div>
            <strong>${etiquetasTipo[e.tipo_evaluacion] || e.tipo_evaluacion}</strong>
            <div style="font-size:12px;color:var(--t3);margin-top:2px;">
              ${formatearFecha(e.fecha_atencion)} · Dr(a). ${escHtml(e.medico_nombre)} ${e.imc ? `· IMC: ${e.imc}` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="sisso-chip ${colorChip}">${etiquetaChip}</span>
            <button class="btn-mini" onclick="verDetalle('${e.id}')">👁 Ver detalle</button>
            <button class="btn-mini" onclick="descargarPdfEvaluacion('${e.id}')">📄 PDF</button>
            <button class="btn-mini" onclick="descargarCertificado('${e.id}')">🏅 Certificado</button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// ------- Descargar PDF de una evaluacion -------
async function descargarPdfEvaluacion(id) {
  try {
    const blob = await sissoDescargarArchivo(`/historia-clinica/${id}/pdf`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    alert('Error al descargar el PDF: ' + err.message);
  }
}

// ------- Descargar el certificado de salud en el trabajo (HCU 081) -------
async function descargarCertificado(id) {
  try {
    const blob = await sissoDescargarArchivo(`/historia-clinica/${id}/certificado`);
    sissoAbrirBlobEnNuevaPestana(blob);
  } catch (err) {
    alert('Error al descargar el certificado: ' + err.message);
  }
}

// ------- Ver detalle de una evaluacion (modal de solo lectura) -------
async function verDetalle(id) {
  const fondo = document.createElement('div');
  fondo.id = 'modal-detalle';
  fondo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;';
  fondo.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px;width:720px;max-width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:16px;font-weight:800;">Detalle de la evaluación</div>
        <button class="btn-mini" onclick="document.getElementById('modal-detalle').remove()">✕ Cerrar</button>
      </div>
      <div id="contenido-detalle"><div class="sisso-cargando">Cargando…</div></div>
    </div>`;
  fondo.addEventListener('click', (e) => { if (e.target === fondo) fondo.remove(); });
  document.body.appendChild(fondo);

  try {
    const datos = await sissoFetch(`/historia-clinica/${id}`);
    document.getElementById('contenido-detalle').innerHTML = renderizarDetalle(datos.evaluacion);
  } catch (err) {
    document.getElementById('contenido-detalle').innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

function renderizarDetalle(e) {
  const seccion = (titulo, html) => html ? `<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:800;color:var(--teal2);text-transform:uppercase;margin-bottom:6px;">${titulo}</div><div style="font-size:13px;color:var(--t2);">${html}</div></div>` : '';
  const dato = (etq, val) => val ? `<div><strong>${etq}:</strong> ${escHtml(val)}</div>` : '';

  const etiquetasAptitud = { apto: 'Apto', apto_en_observacion: 'Apto en observación', apto_con_limitaciones: 'Apto con limitaciones', no_apto: 'No apto' };

  let html = '';
  html += seccion('Datos generales', [
    dato('Trabajador', e.trabajador_nombre), dato('Documento', e.trabajador_documento),
    dato('Fecha de atención', formatearFecha(e.fecha_atencion)), dato('Profesional', e.medico_nombre),
    dato('Área de trabajo', e.area_trabajo), dato('Grupo sanguíneo', e.grupo_sanguineo),
    dato('Fecha de inicio de labores', formatearFecha(e.fecha_inicio_labores)),
    dato('Fecha de salida', formatearFecha(e.fecha_salida)),
    dato('Tiempo de permanencia', e.tiempo_permanencia_meses ? `${e.tiempo_permanencia_meses} meses` : null),
  ].join(''));

  if (e.factores_riesgo_texto_libre) html += seccion('Factores de riesgo a los que estuvo expuesto', escHtml(e.factores_riesgo_texto_libre));

  html += seccion('Motivo de consulta', e.motivo_consulta ? escHtml(e.motivo_consulta) : '');

  if (e.antecedentes_clinicos_quirurgicos) html += seccion('Antecedentes clínico-quirúrgicos', escHtml(e.antecedentes_clinicos_quirurgicos));

  const laborales = e.antecedentes_laborales_previos || [];
  if (laborales.length) {
    html += seccion('Antecedentes laborales previos', laborales.map(l =>
      `<div style="margin-bottom:6px;">• ${escHtml(l.empresa)} — ${escHtml(l.puestoTrabajo)} (${l.tiempoMeses || '?'} meses)${l.riesgos?.length ? ' · Riesgos: ' + l.riesgos.join(', ') : ''}</div>`
    ).join(''));
  }

  if (e.enfermedad_actual) html += seccion('Enfermedad actual', escHtml(e.enfermedad_actual));

  const vitales = [
    e.presion_arterial_sistolica && e.presion_arterial_diastolica ? `P.A.: ${e.presion_arterial_sistolica}/${e.presion_arterial_diastolica} mmHg` : null,
    e.frecuencia_cardiaca ? `F.C.: ${e.frecuencia_cardiaca} lat/min` : null,
    e.peso_kg ? `Peso: ${e.peso_kg} kg` : null, e.talla_cm ? `Talla: ${e.talla_cm} cm` : null,
    e.imc ? `IMC: ${e.imc} kg/m²` : null,
  ].filter(Boolean).join(' · ');
  if (vitales) html += seccion('Constantes vitales', vitales);

  const diagnosticos = e.diagnosticos || [];
  if (diagnosticos.length) {
    html += seccion('Diagnósticos', diagnosticos.map(d =>
      `<div>• <strong>${escHtml(d.codigoCie10)}</strong> ${escHtml(d.descripcion)} (${d.tipo?.replace(/_/g, ' ')}, ${d.condicion})</div>`
    ).join(''));
  }

  if (e.aptitud_msp) {
    html += seccion('Aptitud médica', `
      <div style="font-weight:800;font-size:14px;color:var(--t1);margin-bottom:4px;">${etiquetasAptitud[e.aptitud_msp] || e.aptitud_msp}</div>
      ${e.aptitud_observacion ? `<div>${escHtml(e.aptitud_observacion)}</div>` : ''}
      ${e.aptitud_limitacion ? `<div style="color:var(--amb2);margin-top:4px;">Limitación: ${escHtml(e.aptitud_limitacion)}</div>` : ''}
    `);
  }

  if (e.retiro_se_realizo_evaluacion !== null && e.retiro_se_realizo_evaluacion !== undefined) {
    html += seccion('Evaluación médica de retiro', `
      <div style="font-weight:800;">${e.retiro_se_realizo_evaluacion ? 'Sí se realizó' : 'No se realizó'}</div>
      ${e.retiro_observaciones ? `<div style="margin-top:4px;">${escHtml(e.retiro_observaciones)}</div>` : ''}
    `);
  }

  if (e.recomendaciones_tratamiento) html += seccion('Recomendaciones', escHtml(e.recomendaciones_tratamiento));

  html += `<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--bd);display:flex;justify-content:flex-end;">
    <button class="sisso-boton" onclick="descargarPdfEvaluacion('${e.id}')">📄 Descargar PDF completo</button>
  </div>`;

  return html;
}

// ------- Registro de inmunizaciones (HCU 083) -------
async function cargarInmunizaciones() {
  const cont = document.getElementById('lista-inmunizaciones');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';
  try {
    const datos = await sissoFetch(`/historia-clinica/trabajadores/${trabajadorActualId}/inmunizaciones`);
    const inmunizaciones = datos.inmunizaciones || [];
    if (inmunizaciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Sin dosis registradas todavía.</div>';
      return;
    }
    cont.innerHTML = inmunizaciones.map(i => `
      <div class="historial-item">
        <div>
          <strong>${escHtml(i.vacuna_nombre)}</strong> — ${escHtml(i.numero_dosis)}
          <div style="font-size:12px;color:var(--t3);margin-top:2px;">
            ${formatearFecha(i.fecha_aplicacion)}${i.lote ? ' · Lote: ' + escHtml(i.lote) : ''}${i.establecimiento_salud ? ' · ' + escHtml(i.establecimiento_salud) : ''}
          </div>
        </div>
        ${i.esquema_completo ? '<span class="sisso-chip verde">Esquema completo</span>' : ''}
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

async function registrarInmunizacion() {
  ocultarError('error-inmunizacion');
  ocultarExito('exito-inmunizacion');

  const vacunaSeleccionada = document.getElementById('inm-vacuna').value;
  const vacunaNombre = vacunaSeleccionada === 'Otra' ? document.getElementById('inm-vacuna-otra').value.trim() : vacunaSeleccionada;
  const fecha = document.getElementById('inm-fecha').value;

  if (!vacunaNombre) { mostrarError('error-inmunizacion', 'Indica el nombre de la vacuna.'); return; }
  if (!fecha) { mostrarError('error-inmunizacion', 'La fecha de aplicación es obligatoria.'); return; }

  try {
    await sissoFetch(`/historia-clinica/trabajadores/${trabajadorActualId}/inmunizaciones`, {
      method: 'POST',
      body: {
        vacunaNombre,
        numeroDosis: document.getElementById('inm-dosis').value,
        fechaAplicacion: fecha,
        lote: document.getElementById('inm-lote').value.trim() || undefined,
        esquemaCompleto: document.getElementById('inm-esquema-completo').checked,
        establecimientoSalud: document.getElementById('inm-establecimiento').value.trim() || undefined,
        responsableNombre: document.getElementById('inm-responsable').value.trim() || undefined,
        observaciones: document.getElementById('inm-observaciones').value.trim() || undefined,
      },
    });

    mostrarExito('exito-inmunizacion', 'Dosis registrada correctamente.');
    ['inm-vacuna-otra', 'inm-lote', 'inm-establecimiento', 'inm-responsable', 'inm-observaciones', 'inm-fecha'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('inm-esquema-completo').checked = false;
    await cargarInmunizaciones();
  } catch (err) {
    mostrarError('error-inmunizacion', err.message || 'Error al registrar la dosis.');
  }
}

// ------- Bloque D: antecedentes laborales previos (filas dinamicas) -------
function agregarAntecedenteLaboral() {
  const id = 'ant-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  antecedentesLaborales.push({ id, empresa: '', puestoTrabajo: '', actividades: '', tiempoMeses: '', riesgos: [], observaciones: '' });
  renderizarAntecedentesLaborales();
}
function quitarAntecedenteLaboral(id) {
  antecedentesLaborales = antecedentesLaborales.filter(a => a.id !== id);
  renderizarAntecedentesLaborales();
}
function renderizarAntecedentesLaborales() {
  const cont = document.getElementById('lista-antecedentes-laborales');
  cont.innerHTML = antecedentesLaborales.map(a => `
    <div class="fila-dinamica">
      <button type="button" class="btn-mini btn-quitar" onclick="quitarAntecedenteLaboral('${a.id}')">✕ Quitar</button>
      <div class="fila-campos">
        <div class="sisso-campo"><label class="sisso-etiqueta">Empresa</label><input class="sisso-input" data-campo="empresa" data-id="${a.id}" value="${escAttr(a.empresa)}" oninput="actualizarAntecedenteLaboral('${a.id}','empresa',this.value)"></div>
        <div class="sisso-campo"><label class="sisso-etiqueta">Puesto</label><input class="sisso-input" value="${escAttr(a.puestoTrabajo)}" oninput="actualizarAntecedenteLaboral('${a.id}','puestoTrabajo',this.value)"></div>
        <div class="sisso-campo"><label class="sisso-etiqueta">Tiempo (meses)</label><input type="number" min="0" class="sisso-input" value="${escAttr(a.tiempoMeses)}" oninput="actualizarAntecedenteLaboral('${a.id}','tiempoMeses',this.value)"></div>
      </div>
      <div class="sisso-campo" style="margin-top:10px;"><label class="sisso-etiqueta">Actividades</label><input class="sisso-input" value="${escAttr(a.actividades)}" oninput="actualizarAntecedenteLaboral('${a.id}','actividades',this.value)"></div>
      <div class="sisso-campo" style="margin-top:10px;"><label class="sisso-etiqueta">Riesgos a los que estuvo expuesto (categorías generales)</label>
        <div class="chips-checkbox">
          ${['fisico','mecanico','quimico','biologico','ergonomico','psicosocial'].map(r => `
            <label class="chip-checkbox">
              <input type="checkbox" ${a.riesgos.includes(r) ? 'checked' : ''} onchange="toggleRiesgoAntecedente('${a.id}','${r}',this.checked)"> ${r}
            </label>`).join('')}
        </div>
      </div>
      <div class="sisso-campo" style="margin-top:10px;"><label class="sisso-etiqueta">Observaciones</label><input class="sisso-input" value="${escAttr(a.observaciones)}" oninput="actualizarAntecedenteLaboral('${a.id}','observaciones',this.value)"></div>
    </div>`).join('') || '<div class="sisso-vacio">Sin empleos anteriores registrados.</div>';
}
function actualizarAntecedenteLaboral(id, campo, valor) {
  const item = antecedentesLaborales.find(a => a.id === id);
  if (item) item[campo] = valor;
}
function toggleRiesgoAntecedente(id, riesgo, marcado) {
  const item = antecedentesLaborales.find(a => a.id === id);
  if (!item) return;
  if (marcado && !item.riesgos.includes(riesgo)) item.riesgos.push(riesgo);
  if (!marcado) item.riesgos = item.riesgos.filter(r => r !== riesgo);
}

// ------- Bloque F: matrices de riesgo (checkboxes desde catalogos) -------
function renderizarMatricesRiesgo() {
  if (!catalogos) return;
  const categorias = [
    ['riesgosFisicos', 'Riesgos físicos', catalogos.RIESGOS_FISICOS],
    ['riesgosMecanicos', 'Riesgos mecánicos', catalogos.RIESGOS_MECANICOS],
    ['riesgosQuimicos', 'Riesgos químicos', catalogos.RIESGOS_QUIMICOS],
    ['riesgosBiologicos', 'Riesgos biológicos', catalogos.RIESGOS_BIOLOGICOS],
    ['riesgosErgonomicos', 'Riesgos ergonómicos', catalogos.RIESGOS_ERGONOMICOS],
    ['riesgosPsicosociales', 'Riesgos psicosociales', catalogos.RIESGOS_PSICOSOCIALES],
  ];
  document.getElementById('matrices-riesgo').innerHTML = categorias.map(([campo, titulo, valores]) => `
    <div class="matriz-riesgo">
      <div class="matriz-riesgo-titulo">${titulo}</div>
      <div class="chips-checkbox">
        ${valores.map(v => `
          <label class="chip-checkbox">
            <input type="checkbox" data-categoria="${campo}" data-valor="${v}"> ${v.replace(/_/g, ' ')}
          </label>`).join('')}
      </div>
    </div>`).join('');
}
function leerMatricesRiesgo() {
  const resultado = {};
  document.querySelectorAll('#matrices-riesgo input[type=checkbox]:checked').forEach(cb => {
    const cat = cb.dataset.categoria;
    if (!resultado[cat]) resultado[cat] = [];
    resultado[cat].push(cb.dataset.valor);
  });
  return resultado;
}

// ------- Bloque I: revision de organos y sistemas -------
function renderizarSistemas() {
  if (!catalogos) return;
  const etiquetas = {
    piel_anexos: 'Piel y anexos', organos_sentidos: 'Órganos de los sentidos', respiratorio: 'Respiratorio',
    cardiovascular: 'Cardiovascular', digestivo: 'Digestivo', genito_urinario: 'Genito-urinario',
    musculo_esqueletico: 'Músculo-esquelético', endocrino: 'Endocrino', hemo_linfatico: 'Hemo-linfático', nervioso: 'Nervioso',
  };
  document.getElementById('caja-sistemas').innerHTML = catalogos.SISTEMAS_REVISION.map(s => `
    <div class="sistema-item">
      <label class="sistema-item-cabecera">
        <input type="checkbox" data-sistema="${s}" onchange="document.getElementById('desc-sistema-${s}').style.display=this.checked?'block':'none'">
        ${etiquetas[s] || s}
      </label>
      <textarea id="desc-sistema-${s}" class="sisso-textarea" style="display:none;" placeholder="Describa el hallazgo…"></textarea>
    </div>`).join('');
}
function leerSistemas() {
  const resultado = {};
  if (!catalogos) return resultado;
  catalogos.SISTEMAS_REVISION.forEach(s => {
    const cb = document.querySelector(`#caja-sistemas input[data-sistema="${s}"]`);
    resultado[camelizar(s)] = { conPatologia: cb.checked, descripcion: document.getElementById(`desc-sistema-${s}`).value.trim() || null };
  });
  return resultado;
}

// ------- Bloque K: examen fisico regional -------
function renderizarExamenRegional() {
  if (!catalogos) return;
  const etiquetasRegion = {
    piel: 'Piel', ojos: 'Ojos', oido: 'Oído', oro_faringe: 'Oro-faringe', nariz: 'Nariz', cuello: 'Cuello',
    torax: 'Tórax', abdomen: 'Abdomen', columna: 'Columna', pelvis: 'Pelvis', extremidades: 'Extremidades', neurologico: 'Neurológico',
  };
  const html = Object.entries(catalogos.EXAMEN_FISICO_REGIONES).map(([region, subitems]) => `
    <div class="region-bloque">
      <div class="region-bloque-titulo">${etiquetasRegion[region] || region}</div>
      ${subitems.map(sub => `
        <div class="region-subitem">
          <label class="region-subitem-cabecera">
            <input type="checkbox" data-region="${region}" data-subitem="${sub}" onchange="document.getElementById('desc-region-${region}-${sub}').style.display=this.checked?'block':'none'">
            ${sub.replace(/_/g, ' ')}
          </label>
          <textarea id="desc-region-${region}-${sub}" class="sisso-textarea" style="display:none;" placeholder="Describa el hallazgo…"></textarea>
        </div>`).join('')}
    </div>`).join('');
  document.getElementById('caja-examen-regional').innerHTML = html;
}
function leerExamenRegional() {
  const resultado = {};
  if (!catalogos) return resultado;
  Object.entries(catalogos.EXAMEN_FISICO_REGIONES).forEach(([region, subitems]) => {
    resultado[camelizar(region)] = {};
    subitems.forEach(sub => {
      const cb = document.querySelector(`input[data-region="${region}"][data-subitem="${sub}"]`);
      resultado[camelizar(region)][camelizar(sub)] = { conPatologia: cb.checked, descripcion: document.getElementById(`desc-region-${region}-${sub}`).value.trim() || null };
    });
  });
  return resultado;
}

// ------- Bloque J: IMC en pantalla -------
function calcularImcEnPantalla() {
  const peso = parseFloat(document.getElementById('j-peso').value);
  const talla = parseFloat(document.getElementById('j-talla').value);
  const caja = document.getElementById('imc-resultado');
  if (!peso || !talla) { caja.style.display = 'none'; return; }
  const imc = peso / Math.pow(talla / 100, 2);
  caja.textContent = `IMC: ${imc.toFixed(1)} kg/m²`;
  caja.style.display = 'block';
}

// ------- Bloque L: resultados de examenes (filas dinamicas) -------
function agregarResultadoExamen() {
  const id = 'exa-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  resultadosExamenes.push({ id, examen: '', fecha: '', resultado: '' });
  renderizarResultadosExamenes();
}
function quitarResultadoExamen(id) {
  resultadosExamenes = resultadosExamenes.filter(r => r.id !== id);
  renderizarResultadosExamenes();
}
function renderizarResultadosExamenes() {
  const cont = document.getElementById('lista-resultados-examenes');
  cont.innerHTML = resultadosExamenes.map(r => `
    <div class="fila-dinamica">
      <button type="button" class="btn-mini btn-quitar" onclick="quitarResultadoExamen('${r.id}')">✕ Quitar</button>
      <div class="fila-campos">
        <div class="sisso-campo"><label class="sisso-etiqueta">Examen</label><input class="sisso-input" value="${escAttr(r.examen)}" oninput="actualizarResultadoExamen('${r.id}','examen',this.value)" placeholder="Ej: Biometría hemática"></div>
        <div class="sisso-campo"><label class="sisso-etiqueta">Fecha</label><input type="date" class="sisso-input" value="${escAttr(r.fecha)}" oninput="actualizarResultadoExamen('${r.id}','fecha',this.value)"></div>
        <div class="sisso-campo"><label class="sisso-etiqueta">Resultado</label><input class="sisso-input" value="${escAttr(r.resultado)}" oninput="actualizarResultadoExamen('${r.id}','resultado',this.value)"></div>
      </div>
    </div>`).join('') || '<div class="sisso-vacio">Sin exámenes registrados.</div>';
}
function actualizarResultadoExamen(id, campo, valor) {
  const item = resultadosExamenes.find(r => r.id === id);
  if (item) item[campo] = valor;
}

// ------- Bloque M: diagnosticos (busqueda CIE-10) -------
function buscarCie10Debounced() {
  clearTimeout(timeoutBusquedaCie10);
  timeoutBusquedaCie10 = setTimeout(ejecutarBusquedaCie10, 300);
}
async function ejecutarBusquedaCie10() {
  const q = document.getElementById('buscar-cie10').value.trim();
  const cont = document.getElementById('resultados-cie10');
  if (q.length < 2) { cont.classList.remove('visible'); return; }
  try {
    const datos = await sissoFetch(`/aptitud/cie10/buscar?q=${encodeURIComponent(q)}`);
    const resultados = datos.resultados || [];
    cont.innerHTML = resultados.length === 0
      ? '<div class="resultado-cie10-item" style="color:var(--t3);">Sin resultados.</div>'
      : resultados.map(r => `
          <div class="resultado-cie10-item" onclick='agregarDiagnostico(${JSON.stringify(r.codigo)}, ${JSON.stringify(r.descripcion)})'>
            <span class="resultado-cie10-codigo">${escHtml(r.codigo)}</span>${escHtml(r.descripcion)}
          </div>`).join('');
    cont.classList.add('visible');
  } catch (err) {
    cont.innerHTML = `<div class="resultado-cie10-item" style="color:var(--red2);">Error: ${escHtml(err.message)}</div>`;
    cont.classList.add('visible');
  }
}
function agregarDiagnostico(codigo, descripcion) {
  if (!diagnosticosSeleccionados.find(d => d.codigoCie10 === codigo)) {
    diagnosticosSeleccionados.push({ codigoCie10: codigo, descripcion, tipo: 'enfermedad_comun', condicion: 'presuntivo' });
  }
  document.getElementById('buscar-cie10').value = '';
  document.getElementById('resultados-cie10').classList.remove('visible');
  renderizarDiagnosticos();
}
function quitarDiagnostico(codigo) {
  diagnosticosSeleccionados = diagnosticosSeleccionados.filter(d => d.codigoCie10 !== codigo);
  renderizarDiagnosticos();
}
function actualizarDiagnostico(codigo, campo, valor) {
  const d = diagnosticosSeleccionados.find(x => x.codigoCie10 === codigo);
  if (d) d[campo] = valor;
}
function renderizarDiagnosticos() {
  const cont = document.getElementById('lista-diagnosticos');
  cont.innerHTML = diagnosticosSeleccionados.map(d => `
    <div class="diagnostico-chip">
      <div style="flex:1;">
        <span class="resultado-cie10-codigo">${escHtml(d.codigoCie10)}</span>${escHtml(d.descripcion)}
        <div style="display:flex;gap:8px;margin-top:6px;">
          <select class="sisso-select" style="font-size:11px;padding:4px 6px;" onchange="actualizarDiagnostico('${d.codigoCie10}','tipo',this.value)">
            <option value="enfermedad_comun" ${d.tipo === 'enfermedad_comun' ? 'selected' : ''}>Enfermedad común</option>
            <option value="enfermedad_profesional" ${d.tipo === 'enfermedad_profesional' ? 'selected' : ''}>Enfermedad profesional</option>
          </select>
          <select class="sisso-select" style="font-size:11px;padding:4px 6px;" onchange="actualizarDiagnostico('${d.codigoCie10}','condicion',this.value)">
            <option value="presuntivo" ${d.condicion === 'presuntivo' ? 'selected' : ''}>Presuntivo</option>
            <option value="definitivo" ${d.condicion === 'definitivo' ? 'selected' : ''}>Definitivo</option>
          </select>
        </div>
      </div>
      <button type="button" class="btn-mini" onclick="quitarDiagnostico('${d.codigoCie10}')">✕</button>
    </div>`).join('') || '<div class="sisso-vacio">Sin diagnósticos agregados.</div>';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.buscador-cie10')) {
    document.getElementById('resultados-cie10').classList.remove('visible');
  }
});

// ------- Bloque Q: canvas de firma (opcional) -------
function inicializarCanvasFirma() {
  const canvas = document.getElementById('lienzo-firma');
  window.addEventListener('resize', ajustarTamanoCanvasFirma);

  function posicion(e) {
    const rect = canvas.getBoundingClientRect();
    const punto = e.touches ? e.touches[0] : e;
    return { x: punto.clientX - rect.left, y: punto.clientY - rect.top };
  }
  function iniciar(e) { dibujando = true; const p = posicion(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function mover(e) { if (!dibujando) return; const p = posicion(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function terminar() { dibujando = false; }

  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', mover);
  window.addEventListener('mouseup', terminar);
  canvas.addEventListener('touchstart', iniciar, { passive: false });
  canvas.addEventListener('touchmove', mover, { passive: false });
  canvas.addEventListener('touchend', terminar);
}
function ajustarTamanoCanvasFirma() {
  const canvas = document.getElementById('lienzo-firma');
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a1d23';
}
function limpiarFirma() {
  const canvas = document.getElementById('lienzo-firma');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
function firmaTieneContenido() {
  const canvas = document.getElementById('lienzo-firma');
  if (!canvas.width || !canvas.height) return false;
  const datos = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < datos.length; i += 4) { if (datos[i] !== 0) return true; }
  return false;
}

// ------- Guardar evaluacion -------
async function guardarEvaluacion() {
  if (tipoEvaluacionActual === 'retiro') {
    await guardarRetiro();
  } else if (tipoEvaluacionActual === 'periodica') {
    await guardarPeriodica();
  } else if (tipoEvaluacionActual === 'reintegro') {
    await guardarReintegro();
  } else {
    await guardarPreocupacional();
  }
}

async function guardarPreocupacional() {
  ocultarError('error-form');
  ocultarExito('exito-form');

  if (!trabajadorActualId) { mostrarError('error-form', 'Selecciona un trabajador.'); return; }

  const val = (id) => document.getElementById(id).value.trim() || null;
  const num = (id) => { const v = document.getElementById(id).value; return v === '' ? null : parseFloat(v); };

  const sexo = trabajadorActual.sexo;

  const cuerpo = {
    fechaAtencion: val('p-fecha-atencion'),
    horaAtencion: val('p-hora-atencion'),

    numeroArchivo: val('a-numero-archivo'),
    religion: val('a-religion'),
    grupoSanguineo: val('a-grupo-sanguineo'),
    lateralidad: val('a-lateralidad'),
    orientacionSexual: val('a-orientacion-sexual'),
    identidadGenero: val('a-identidad-genero'),
    discapacidadTiene: document.getElementById('a-discapacidad-tiene').checked,
    discapacidadTipo: val('a-discapacidad-tipo'),
    discapacidadPorcentaje: num('a-discapacidad-porcentaje'),
    fechaIngresoTrabajo: val('a-fecha-ingreso'),
    puestoTrabajoCiuo: val('a-ciuo'),
    areaTrabajo: val('a-area-trabajo'),
    actividadesRelevantes: val('a-actividades-relevantes'),
    antecedentesGinecobstetricos: sexo === 'F' ? {
      menarquiaEdad: num('a-menarquia'), ciclosDias: num('a-ciclos'), fechaUltimaMenstruacion: val('a-fum'),
    } : null,

    motivoConsulta: val('b-motivo-consulta'),

    antecedentesClinicosQuirurgicos: val('c-clinicos-quirurgicos'),
    antecedentesGinecologicosExamenes: sexo === 'F' ? {
      gestas: num('c-gestas'), partos: num('c-partos'), cesareas: num('c-cesareas'), abortos: num('c-abortos'),
      hijosVivos: num('c-hijos-vivos'), hijosMuertos: num('c-hijos-muertos'),
      metodoPlanificacion: val('c-metodo-planificacion-f'),
      examenes: {
        papanicolau: { fecha: val('c-papanicolau-fecha'), resultado: val('c-papanicolau-resultado') },
        ecoMamario: { fecha: val('c-eco-mamario-fecha'), resultado: val('c-eco-mamario-resultado') },
        mamografia: { fecha: val('c-mamografia-fecha'), resultado: val('c-mamografia-resultado') },
      },
    } : null,
    antecedentesReproductivosMasculinos: sexo === 'M' ? {
      antigenoProstatico: { fecha: val('c-antigeno-fecha'), resultado: val('c-antigeno-resultado') },
      ecoProstatico: { fecha: val('c-eco-prostatico-fecha'), resultado: val('c-eco-prostatico-resultado') },
      metodoPlanificacion: val('c-metodo-planificacion-m'),
      hijosVivos: num('c-m-hijos-vivos'), hijosMuertos: num('c-m-hijos-muertos'),
    } : null,
    habitosToxicos: {
      tabaco: { consume: val('c-tabaco-consume'), detalle: val('c-tabaco-detalle') },
      alcohol: { consume: val('c-alcohol-consume'), detalle: val('c-alcohol-detalle') },
      otrasDrogas: { consume: val('c-drogas-consume'), detalle: val('c-drogas-detalle') },
    },
    estiloVida: {
      actividadFisica: val('c-actividad-fisica'),
      medicacionHabitual: val('c-medicacion-habitual'),
    },

    antecedentesLaboralesPrevios: antecedentesLaborales.map(({ id, ...resto }) => resto),
    accidentesTrabajoPrevios: {
      fueCalificado: val('d-accidente-calificado') === 'si', especificarEntidad: val('d-accidente-entidad'),
      fecha: val('d-accidente-fecha'), observaciones: val('d-accidente-observaciones'),
    },
    enfermedadesProfesionalesPrevias: {
      fueCalificado: val('d-enfermedad-calificada') === 'si', especificarEntidad: val('d-enfermedad-entidad'),
      fecha: val('d-enfermedad-fecha'), observaciones: val('d-enfermedad-observaciones'),
    },

    antecedentesFamiliares: {
      cardiovascular: val('e-cardiovascular'), metabolica: val('e-metabolica'), neurologica: val('e-neurologica'),
      oncologica: val('e-oncologica'), infecciosa: val('e-infecciosa'), hereditariaCongenita: val('e-hereditaria'),
      discapacidades: val('e-discapacidades'), otros: val('e-otros'),
    },

    factoresRiesgoActual: {
      puestoArea: val('f-puesto-area'), actividades: val('f-actividades'),
      ...leerMatricesRiesgo(),
      medidasPreventivas: val('f-medidas-preventivas'),
    },

    actividadesExtraLaborales: val('g-actividades-extra'),
    enfermedadActual: val('h-enfermedad-actual'),
    revisionOrganosSistemas: leerSistemas(),

    presionArterialSistolica: num('j-pa-sistolica'), presionArterialDiastolica: num('j-pa-diastolica'),
    temperaturaC: num('j-temperatura'), frecuenciaCardiaca: num('j-fc'), saturacionOxigeno: num('j-satO2'),
    frecuenciaRespiratoria: num('j-fr'), pesoKg: num('j-peso'), tallaCm: num('j-talla'),
    perimetroAbdominalCm: num('j-perimetro-abdominal'),

    examenFisicoRegional: leerExamenRegional(),

    resultadosExamenes: resultadosExamenes.filter(r => r.examen).map(({ id, ...resto }) => resto),
    diagnosticos: diagnosticosSeleccionados,

    aptitudMsp: val('n-aptitud'),
    aptitudObservacion: val('n-observacion'),
    aptitudLimitacion: val('n-limitacion'),

    recomendacionesTratamiento: val('o-recomendaciones'),
    codigoProfesionalSalud: val('p-codigo-profesional'),

    firmaBase64: firmaTieneContenido() ? document.getElementById('lienzo-firma').toDataURL('image/png') : undefined,
  };

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch(`/historia-clinica/trabajadores/${trabajadorActualId}/preocupacional`, {
      method: 'POST',
      body: cuerpo,
    });
    mostrarExito('exito-form', 'Evaluación preocupacional guardada correctamente.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await cargarHistorial();
  } catch (err) {
    mostrarError('error-form', err.message || 'Error al guardar la evaluación.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar evaluación preocupacional';
  }
}

async function guardarRetiro() {
  ocultarError('error-form');
  ocultarExito('exito-form');

  if (!trabajadorActualId) { mostrarError('error-form', 'Selecciona un trabajador.'); return; }

  const val = (id) => document.getElementById(id).value.trim() || null;
  const num = (id) => { const v = document.getElementById(id).value; return v === '' ? null : parseFloat(v); };

  const cuerpo = {
    fechaAtencion: val('p-fecha-atencion'),
    horaAtencion: val('p-hora-atencion'),

    fechaInicioLabores: val('r-fecha-inicio-labores'),
    fechaSalida: val('r-fecha-salida'),
    tiempoPermanenciaMeses: num('r-tiempo-permanencia'),
    puestoTrabajoCiuo: val('a-ciuo'),
    actividadesDesempenadas: val('a-actividades-relevantes'),
    factoresRiesgoTextoLibre: val('r-factores-riesgo-texto'),

    antecedentesClinicosQuirurgicos: val('c-clinicos-quirurgicos'),
    accidentesTrabajoPrevios: {
      fueCalificado: val('d-accidente-calificado') === 'si', especificarEntidad: val('d-accidente-entidad'),
      fecha: val('d-accidente-fecha'), observaciones: val('d-accidente-observaciones'),
    },
    enfermedadesProfesionalesPrevias: {
      fueCalificado: val('d-enfermedad-calificada') === 'si', especificarEntidad: val('d-enfermedad-entidad'),
      fecha: val('d-enfermedad-fecha'), observaciones: val('d-enfermedad-observaciones'),
    },

    presionArterialSistolica: num('j-pa-sistolica'), presionArterialDiastolica: num('j-pa-diastolica'),
    temperaturaC: num('j-temperatura'), frecuenciaCardiaca: num('j-fc'), saturacionOxigeno: num('j-satO2'),
    frecuenciaRespiratoria: num('j-fr'), pesoKg: num('j-peso'), tallaCm: num('j-talla'),
    perimetroAbdominalCm: num('j-perimetro-abdominal'),

    examenFisicoRegional: leerExamenRegional(),
    resultadosExamenes: resultadosExamenes.filter(r => r.examen).map(({ id, ...resto }) => resto),
    diagnosticos: diagnosticosSeleccionados,

    retiroSeRealizoEvaluacion: val('r-se-realizo-evaluacion') === 'si' ? true : val('r-se-realizo-evaluacion') === 'no' ? false : undefined,
    retiroObservaciones: val('r-observaciones'),

    recomendacionesTratamiento: val('o-recomendaciones'),
    codigoProfesionalSalud: val('p-codigo-profesional'),

    firmaBase64: firmaTieneContenido() ? document.getElementById('lienzo-firma').toDataURL('image/png') : undefined,
  };

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch(`/historia-clinica/trabajadores/${trabajadorActualId}/retiro`, {
      method: 'POST',
      body: cuerpo,
    });
    mostrarExito('exito-form', 'Evaluación de retiro guardada correctamente.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await cargarHistorial();
  } catch (err) {
    mostrarError('error-form', err.message || 'Error al guardar la evaluación.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar evaluación de retiro';
  }
}

async function guardarPeriodica() {
  ocultarError('error-form');
  ocultarExito('exito-form');

  if (!trabajadorActualId) { mostrarError('error-form', 'Selecciona un trabajador.'); return; }

  const val = (id) => document.getElementById(id).value.trim() || null;
  const num = (id) => { const v = document.getElementById(id).value; return v === '' ? null : parseFloat(v); };

  const cuerpo = {
    fechaAtencion: val('p-fecha-atencion'),
    horaAtencion: val('p-hora-atencion'),

    puestoTrabajoCiuo: val('a-ciuo'),

    antecedentesClinicosQuirurgicos: val('c-clinicos-quirurgicos'),
    habitosToxicos: {
      tabaco: { consume: val('c-tabaco-consume'), detalle: val('c-tabaco-detalle') },
      alcohol: { consume: val('c-alcohol-consume'), detalle: val('c-alcohol-detalle') },
      otrasDrogas: { consume: val('c-drogas-consume'), detalle: val('c-drogas-detalle') },
    },
    estiloVida: {
      actividadFisica: val('c-actividad-fisica'),
      medicacionHabitual: val('c-medicacion-habitual'),
    },
    incidentes: val('c-incidentes'),
    accidentesTrabajoPrevios: {
      fueCalificado: val('d-accidente-calificado') === 'si', especificarEntidad: val('d-accidente-entidad'),
      fecha: val('d-accidente-fecha'), observaciones: val('d-accidente-observaciones'),
    },
    enfermedadesProfesionalesPrevias: {
      fueCalificado: val('d-enfermedad-calificada') === 'si', especificarEntidad: val('d-enfermedad-entidad'),
      fecha: val('d-enfermedad-fecha'), observaciones: val('d-enfermedad-observaciones'),
    },

    antecedentesFamiliares: {
      cardiovascular: val('e-cardiovascular'), metabolica: val('e-metabolica'), neurologica: val('e-neurologica'),
      oncologica: val('e-oncologica'), infecciosa: val('e-infecciosa'), hereditariaCongenita: val('e-hereditaria'),
      discapacidades: val('e-discapacidades'), otros: val('e-otros'),
    },

    factoresRiesgoActual: {
      puestoArea: val('f-puesto-area'), actividades: val('f-actividades'),
      ...leerMatricesRiesgo(),
      medidasPreventivas: val('f-medidas-preventivas'),
    },
    tiempoPuestoActualMeses: num('f-tiempo-puesto-actual'),

    enfermedadActual: val('h-enfermedad-actual'),
    revisionOrganosSistemas: leerSistemas(),

    presionArterialSistolica: num('j-pa-sistolica'), presionArterialDiastolica: num('j-pa-diastolica'),
    temperaturaC: num('j-temperatura'), frecuenciaCardiaca: num('j-fc'), saturacionOxigeno: num('j-satO2'),
    frecuenciaRespiratoria: num('j-fr'), pesoKg: num('j-peso'), tallaCm: num('j-talla'),
    perimetroAbdominalCm: num('j-perimetro-abdominal'),

    examenFisicoRegional: leerExamenRegional(),
    resultadosExamenes: resultadosExamenes.filter(r => r.examen).map(({ id, ...resto }) => resto),
    diagnosticos: diagnosticosSeleccionados,

    aptitudMsp: val('n-aptitud'),
    aptitudObservacion: val('n-observacion'),
    aptitudLimitacion: val('n-limitacion'),

    recomendacionesTratamiento: val('o-recomendaciones'),
    codigoProfesionalSalud: val('p-codigo-profesional'),

    firmaBase64: firmaTieneContenido() ? document.getElementById('lienzo-firma').toDataURL('image/png') : undefined,
  };

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch(`/historia-clinica/trabajadores/${trabajadorActualId}/periodica`, {
      method: 'POST',
      body: cuerpo,
    });
    mostrarExito('exito-form', 'Evaluación periódica guardada correctamente.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await cargarHistorial();
  } catch (err) {
    mostrarError('error-form', err.message || 'Error al guardar la evaluación.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar evaluación periódica';
  }
}

async function guardarReintegro() {
  ocultarError('error-form');
  ocultarExito('exito-form');

  if (!trabajadorActualId) { mostrarError('error-form', 'Selecciona un trabajador.'); return; }

  const val = (id) => document.getElementById(id).value.trim() || null;
  const num = (id) => { const v = document.getElementById(id).value; return v === '' ? null : parseFloat(v); };

  const cuerpo = {
    fechaAtencion: val('p-fecha-atencion'),
    horaAtencion: val('p-hora-atencion'),

    fechaUltimoDiaLaboral: val('ri-fecha-ultimo-dia'),
    fechaReingreso: val('ri-fecha-reingreso'),
    totalDiasAusencia: num('ri-dias-ausencia'),
    causaSalida: val('ri-causa-salida'),

    enfermedadActual: val('h-enfermedad-actual'),

    presionArterialSistolica: num('j-pa-sistolica'), presionArterialDiastolica: num('j-pa-diastolica'),
    temperaturaC: num('j-temperatura'), frecuenciaCardiaca: num('j-fc'), saturacionOxigeno: num('j-satO2'),
    frecuenciaRespiratoria: num('j-fr'), pesoKg: num('j-peso'), tallaCm: num('j-talla'),
    perimetroAbdominalCm: num('j-perimetro-abdominal'),

    examenFisicoRegional: leerExamenRegional(),
    resultadosExamenes: resultadosExamenes.filter(r => r.examen).map(({ id, ...resto }) => resto),
    diagnosticos: diagnosticosSeleccionados,

    aptitudMsp: val('n-aptitud'),
    aptitudObservacion: val('n-observacion'),
    aptitudLimitacion: val('n-limitacion'),
    aptitudReubicacion: val('n-reubicacion'),

    recomendacionesTratamiento: val('o-recomendaciones'),
    codigoProfesionalSalud: val('p-codigo-profesional'),

    firmaBase64: firmaTieneContenido() ? document.getElementById('lienzo-firma').toDataURL('image/png') : undefined,
  };

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch(`/historia-clinica/trabajadores/${trabajadorActualId}/reintegro`, {
      method: 'POST',
      body: cuerpo,
    });
    mostrarExito('exito-form', 'Evaluación de reintegro guardada correctamente.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await cargarHistorial();
  } catch (err) {
    mostrarError('error-form', err.message || 'Error al guardar la evaluación.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar evaluación de reintegro';
  }
}

// ------- Utilidades -------
function camelizar(texto) {
  return texto.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
function formatearFecha(fecha) {
  if (!fecha) return '';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(id) { document.getElementById(id).classList.remove('visible'); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function ocultarExito(id) { document.getElementById(id).classList.remove('visible'); }
