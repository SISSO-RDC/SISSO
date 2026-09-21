// ============================================================
// SISSO - Logica de la pagina (audiometria/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let trabajadores = [];
let trabajadorActualId = null;
let graficoAudiograma = null;

const FRECUENCIAS = [500, 1000, 2000, 3000, 4000, 6000, 8000];
const FREC_LABELS = ['500', '1k', '2k', '3k', '4k', '6k', '8k'];

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('audiometria', 'Audiometría Ocupacional');
  inicializarAudiograma();

  // Fecha de hoy por defecto
  document.getElementById('fecha-examen').value = new Date().toISOString().split('T')[0];

  await cargarTrabajadores();

  const presel = localStorage.getItem('sisso_trabajador_id');
  if (presel) document.getElementById('sel-trabajador').value = presel;
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

function elegirTrabajador() {
  ocultarError('error-selector');
  const id = document.getElementById('sel-trabajador').value;
  if (!id) { mostrarError('error-selector', 'Selecciona un trabajador.'); return; }
  trabajadorActualId = id;
  const t = trabajadores.find(x => x.id === id);
  document.getElementById('titulo-trabajador').textContent = t ? `${t.nombre_completo} — ${t.documento}` : 'Trabajador';
  document.getElementById('caja-selector').style.display = 'none';
  document.getElementById('caja-principal').style.display = 'block';
  cargarHistorial();
}

function cambiarTrabajador() {
  trabajadorActualId = null;
  document.getElementById('caja-selector').style.display = 'block';
  document.getElementById('caja-principal').style.display = 'none';
}

// ------- Audiograma en vivo -------
function inicializarAudiograma() {
  const ctx = document.getElementById('c-audiograma').getContext('2d');
  graficoAudiograma = new Chart(ctx, {
    type: 'line',
    data: {
      labels: FREC_LABELS,
      datasets: [
        { label: 'OD aérea', data: Array(7).fill(null), borderColor: '#e53e3e', backgroundColor: '#e53e3e', pointStyle: 'circle', pointRadius: 5, tension: 0, borderWidth: 2 },
        { label: 'OI aérea', data: Array(7).fill(null), borderColor: '#3182ce', backgroundColor: '#3182ce', pointStyle: 'cross', pointRadius: 5, tension: 0, borderWidth: 2 },
        { label: 'OD ósea', data: Array(5).fill(null).concat([null, null]), borderColor: '#e53e3e', backgroundColor: '#e53e3e', pointStyle: 'rectRot', pointRadius: 5, tension: 0, borderWidth: 2, borderDash: [5, 5] },
        { label: 'OI ósea', data: Array(5).fill(null).concat([null, null]), borderColor: '#3182ce', backgroundColor: '#3182ce', pointStyle: 'triangle', pointRadius: 5, tension: 0, borderWidth: 2, borderDash: [5, 5] },
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          reverse: true, // en audiogramas, los valores bajos (mejor audición) van arriba
          min: -10, max: 120,
          title: { display: true, text: 'Umbral (dB HL)', font: { size: 11 } },
          ticks: { font: { size: 11 } },
          grid: { color: '#e2e8f0' },
        },
        x: {
          title: { display: true, text: 'Frecuencia (Hz)', font: { size: 11 } },
          ticks: { font: { size: 11 } },
          grid: { color: '#e2e8f0' },
        }
      },
      plugins: {
        legend: { display: false },
        // Línea horizontal de referencia en 25 dB (límite de normalidad)
        annotation: undefined,
      },
    },
    plugins: [{
      id: 'linea-normalidad',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const y25 = scales.y.getPixelForValue(25);
        ctx.save();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y25);
        ctx.lineTo(chartArea.right, y25);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.fillText('25 dB — límite normal', chartArea.left + 4, y25 - 4);
        ctx.restore();
      }
    }]
  });
}

function leerValor(id) {
  const val = document.getElementById(id).value;
  return val === '' ? null : parseFloat(val);
}

function actualizarAudiograma() {
  if (!graficoAudiograma) return;

  const odAerea = FRECUENCIAS.map(f => leerValor(`ca_od_${f}`));
  const oiAerea = FRECUENCIAS.map(f => leerValor(`ca_oi_${f}`));
  const odOsea = [500,1000,2000,3000,4000].map(f => leerValor(`co_od_${f}`)).concat([null, null]);
  const oiOsea = [500,1000,2000,3000,4000].map(f => leerValor(`co_oi_${f}`)).concat([null, null]);

  graficoAudiograma.data.datasets[0].data = odAerea;
  graficoAudiograma.data.datasets[1].data = oiAerea;
  graficoAudiograma.data.datasets[2].data = odOsea;
  graficoAudiograma.data.datasets[3].data = oiOsea;
  graficoAudiograma.update('none');
}

// ------- Guardar examen -------
async function guardarExamen() {
  ocultarError('error-examen');
  ocultarExito('exito-examen');

  const cuerpo = {
    fechaExamen: document.getElementById('fecha-examen').value || undefined,
    esBasal: document.getElementById('es-basal').checked,
    observaciones: document.getElementById('observaciones').value.trim() || undefined,
  };

  // Lote F (Fase 11): equipo/ambiente -- se envian solo si el usuario
  // completo algo, para no forzar el paso en examenes donde todavia no
  // se tiene ese dato (mismo criterio opcional que ya definio N.14 en
  // el backend).
  const equipo = {
    marca: document.getElementById('eq-marca').value.trim() || undefined,
    modelo: document.getElementById('eq-modelo').value.trim() || undefined,
    numeroSerie: document.getElementById('eq-serie').value.trim() || undefined,
    fechaCalibracion: document.getElementById('eq-fecha-cal').value || undefined,
    resultadoVerificacionBiologica: document.getElementById('eq-verif-bio').value || undefined,
  };
  if (Object.values(equipo).some(v => v !== undefined)) cuerpo.equipo = equipo;

  const ambiente = {
    cabinaSonoamortiguada: document.getElementById('amb-cabina').checked || undefined,
    nivelRuidoFondoDba: document.getElementById('amb-ruido').value !== '' ? parseFloat(document.getElementById('amb-ruido').value) : undefined,
    cumpleAnsiS31: document.getElementById('amb-ansi').checked || undefined,
  };
  if (Object.values(ambiente).some(v => v !== undefined)) cuerpo.ambiente = ambiente;

  // Recoger todos los umbrales
  ['ca_od','ca_oi'].forEach(prefijo => {
    [500,1000,2000,3000,4000,6000,8000].forEach(f => {
      const v = leerValor(`${prefijo}_${f}`);
      if (v !== null) cuerpo[`${prefijo}_${f}`] = v;
    });
  });
  ['co_od','co_oi'].forEach(prefijo => {
    [500,1000,2000,3000,4000].forEach(f => {
      const v = leerValor(`${prefijo}_${f}`);
      if (v !== null) cuerpo[`${prefijo}_${f}`] = v;
    });
  });

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    const datos = await sissoFetch(`/audiometria/trabajadores/${trabajadorActualId}`, {
      method: 'POST',
      body: cuerpo
    });

    let msg = 'Examen audiométrico registrado correctamente.';
    if (datos.alertaSTS) {
      msg += ' ⚠ ALERTA: STS positivo detectado (cambio ≥10 dB en 2k-3k-4k Hz).';
    }
    mostrarExito('exito-examen', msg);

    // Limpiar formulario
    document.querySelectorAll('.input-db').forEach(el => el.value = '');
    document.getElementById('es-basal').checked = false;
    document.getElementById('observaciones').value = '';
    ['eq-marca','eq-modelo','eq-serie','eq-fecha-cal','amb-ruido'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('eq-verif-bio').value = '';
    document.getElementById('amb-cabina').checked = false;
    document.getElementById('amb-ansi').checked = false;
    actualizarAudiograma();
    await cargarHistorial();

  } catch (err) {
    mostrarError('error-examen', err.message || 'Error al guardar el examen.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar examen audiométrico';
  }
}

// ------- Historial -------
async function cargarHistorial() {
  const cont = document.getElementById('lista-examenes');
  cont.innerHTML = '<div class="sisso-cargando">Cargando historial…</div>';
  try {
    const datos = await sissoFetch(`/audiometria/trabajadores/${trabajadorActualId}`);
    const examenes = datos.examenes || [];

    if (examenes.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Aún no hay audiometrías registradas para este trabajador.</div>';
      return;
    }

    cont.innerHTML = examenes.map(e => {
      const stsAlerta = e.sts_od_positivo || e.sts_oi_positivo;
      return `
        <div class="historial-item">
          <div class="historial-cabecera">
            <div>
              <strong>${formatearFecha(e.fecha_examen)}</strong>
              ${e.es_basal ? '<span class="sisso-chip teal" style="margin-left:8px;">Basal</span>' : ''}
              ${stsAlerta ? '<span class="sisso-chip rojo" style="margin-left:4px;">⚠ STS OSHA</span>' : ''}
            </div>
            <span style="font-size:11px;color:var(--t3);">Dr(a). ${escHtml(e.medico_nombre)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;margin-bottom:8px;">
            <div>OD: PTA ${e.pta_od ?? '—'} dB ${e.sts_od !== null ? `| STS ${e.sts_od > 0 ? '+' : ''}${e.sts_od} dB` : ''}</div>
            <div>OI: PTA ${e.pta_oi ?? '—'} dB ${e.sts_oi !== null ? `| STS ${e.sts_oi > 0 ? '+' : ''}${e.sts_oi} dB` : ''}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${chipPatron('OD', e.patron_od)}
            ${chipPatron('OI', e.patron_oi)}
          </div>
          ${construirResumenInterpretativo(e, stsAlerta)}
          ${construirLineaCalibracion(e)}
        </div>`;
    }).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// Lote F (Fase 11): "mejor... resumen de resultado" -- una linea en
// lenguaje llano antes de los chips tecnicos, para que no haya que
// interpretar PTA/patron manualmente cada vez. No reemplaza ni
// recalcula nada: solo redacta en palabras lo que el backend ya
// determino (patron_od/oi, sts_*_positivo).
function construirResumenInterpretativo(e, stsAlerta) {
  const patrones = [e.patron_od, e.patron_oi].filter(Boolean);
  const normalAmbos = patrones.length === 2 && patrones.every(p => p === 'normal');
  let texto;
  if (stsAlerta) {
    texto = '⚠ Se detectó un cambio significativo (STS) respecto a la basal — requiere evaluación médica y posible retest confirmatorio.';
  } else if (normalAmbos) {
    texto = '✓ Umbrales dentro de rango normal en ambos oídos, sin cambio significativo respecto a la basal.';
  } else if (patrones.length > 0) {
    texto = 'Se identificó un patrón audiométrico que amerita seguimiento — ver clasificación por oído abajo.';
  } else {
    texto = 'Examen registrado sin clasificación de patrón disponible.';
  }
  const color = stsAlerta ? 'var(--red2)' : (normalAmbos ? 'var(--grn2)' : 'var(--amb2)');
  return `<div style="font-size:12px;color:${color};font-weight:600;margin:6px 0;">${texto}</div>`;
}

// Lote F (Fase 11): "informacion de calibracion" + "identificacion de
// tipo de audiometria" -- muestra lo que se cargo en el formulario
// opcional de equipo/ambiente (ver guardarExamen). Si el examen es
// anterior a esta mejora, estos campos vienen NULL y la linea no se
// muestra -- no se inventa informacion que no fue registrada.
function construirLineaCalibracion(e) {
  const partes = [];
  if (e.equipo_marca || e.equipo_modelo) {
    partes.push(`🔧 ${[e.equipo_marca, e.equipo_modelo].filter(Boolean).map(escHtml).join(' ')}`);
  }
  if (e.equipo_fecha_calibracion) {
    partes.push(`Calibrado: ${formatearFecha(e.equipo_fecha_calibracion)}`);
  }
  if (e.ambiente_cabina_sonoamortiguada) {
    partes.push('Cabina sonoamortiguada');
  }
  if (e.ambiente_nivel_ruido_fondo_dba != null) {
    partes.push(`Ruido de fondo: ${e.ambiente_nivel_ruido_fondo_dba} dBA`);
  }
  if (partes.length === 0) return '';
  return `<div style="font-size:11px;color:var(--t3);margin-top:6px;border-top:1px dashed var(--bd);padding-top:6px;">${partes.join(' · ')}</div>`;
}

function chipPatron(lado, patron) {
  if (!patron) return '';
  const colores = {
    normal: 'verde', notch_ocupacional: 'rojo', neurosensorial: 'ambar',
    conductiva: 'azul', mixta: 'pur', presbiacusia: 'gris', no_clasificable: 'gris'
  };
  const etiquetas = {
    normal: 'Normal', notch_ocupacional: 'Notch ocupacional', neurosensorial: 'Neurosensorial',
    conductiva: 'Conductiva', mixta: 'Mixta', presbiacusia: 'Presbiacusia', no_clasificable: 'No clasificable'
  };
  const col = colores[patron] || 'gris';
  const colMap = { verde:'var(--grn3)', rojo:'var(--red3)', ambar:'var(--amb3)', azul:'var(--blue3)', gris:'var(--bg3)', pur:'var(--pur3)' };
  const txtMap = { verde:'var(--grn2)', rojo:'var(--red2)', ambar:'var(--amb2)', azul:'var(--blue2)', gris:'var(--t2)', pur:'var(--pur2)' };
  return `<span class="patron-chip" style="background:${colMap[col]};color:${txtMap[col]};">${lado}: ${etiquetas[patron] || patron}</span>`;
}

function formatearFecha(fecha) {
  if (!fecha) return '';
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'numeric' });
}
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
function mostrarError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(id) { document.getElementById(id).classList.remove('visible'); }
function mostrarExito(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); }
function ocultarExito(id) { document.getElementById(id).classList.remove('visible'); }
