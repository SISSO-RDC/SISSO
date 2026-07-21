// ============================================================
// SISSO - Historia Clinica Ocupacional: formulario preocupacional
// (HCU 077, Acuerdo Ministerial MSP 0341-2019).
// ============================================================

let trabajadores = [];
let trabajadorActualId = null;
let trabajadorActual = null;
let catalogos = null;

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
}

function cambiarTrabajador() {
  trabajadorActualId = null;
  trabajadorActual = null;
  document.getElementById('caja-selector').style.display = 'block';
  document.getElementById('caja-principal').style.display = 'none';
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

    const etiquetasTipo = { preocupacional_inicio: 'Preocupacional — inicio' };
    const etiquetasAptitud = {
      apto: ['Apto', 'verde'], apto_en_observacion: ['Apto en observación', 'ambar'],
      apto_con_limitaciones: ['Apto con limitaciones', 'ambar'], no_apto: ['No apto', 'rojo'],
    };

    cont.innerHTML = evaluaciones.map(e => {
      const [etiquetaApt, colorApt] = etiquetasAptitud[e.aptitud_msp] || ['Sin definir', 'gris'];
      return `
        <div class="historial-item">
          <div>
            <strong>${etiquetasTipo[e.tipo_evaluacion] || e.tipo_evaluacion}</strong>
            <div style="font-size:12px;color:var(--t3);margin-top:2px;">
              ${formatearFecha(e.fecha_atencion)} · Dr(a). ${escHtml(e.medico_nombre)} ${e.imc ? `· IMC: ${e.imc}` : ''}
            </div>
          </div>
          <span class="sisso-chip ${colorApt}">${etiquetaApt}</span>
        </div>`;
    }).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
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
