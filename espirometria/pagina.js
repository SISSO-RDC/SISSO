// ============================================================
// SISSO - Logica de la pagina (espirometria/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let trabajadores = [];
let trabajadorActualId = null;
let trabajadorActual = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('espirometria', 'Espirometría Ocupacional');
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
  trabajadorActual = trabajadores.find(x => x.id === id) || null;
  document.getElementById('titulo-trabajador').textContent = trabajadorActual
    ? `${trabajadorActual.nombre_completo} — ${trabajadorActual.documento}` : 'Trabajador';
  document.getElementById('caja-selector').style.display = 'none';
  document.getElementById('caja-principal').style.display = 'block';

  revisarDatosAntropometricos();
  cargarHistorial();
}

function cambiarTrabajador() {
  trabajadorActualId = null;
  trabajadorActual = null;
  document.getElementById('caja-selector').style.display = 'block';
  document.getElementById('caja-principal').style.display = 'none';
}

// ------- Datos antropometricos -------
function revisarDatosAntropometricos() {
  const faltantes = [];
  if (!trabajadorActual.sexo) faltantes.push('sexo');
  if (!trabajadorActual.fecha_nacimiento) faltantes.push('fecha de nacimiento');
  if (!trabajadorActual.talla_cm) faltantes.push('talla');

  const cajaFaltantes = document.getElementById('caja-datos-faltantes');
  const cajaFormulario = document.getElementById('caja-formulario');

  if (faltantes.length > 0) {
    document.getElementById('texto-faltantes').textContent = faltantes.join(', ');
    if (trabajadorActual.sexo) document.getElementById('dato-sexo').value = trabajadorActual.sexo;
    if (trabajadorActual.fecha_nacimiento) document.getElementById('dato-nacimiento').value = trabajadorActual.fecha_nacimiento.split('T')[0];
    if (trabajadorActual.talla_cm) document.getElementById('dato-talla').value = trabajadorActual.talla_cm;
    if (trabajadorActual.peso_kg) document.getElementById('dato-peso').value = trabajadorActual.peso_kg;
    cajaFaltantes.style.display = 'block';
    cajaFormulario.style.display = 'none';
  } else {
    cajaFaltantes.style.display = 'none';
    cajaFormulario.style.display = 'block';
  }
}

async function guardarDatosAntropometricos() {
  ocultarError('error-datos-faltantes');
  const sexo = document.getElementById('dato-sexo').value;
  const fechaNacimiento = document.getElementById('dato-nacimiento').value;
  const tallaCm = document.getElementById('dato-talla').value;
  const pesoKg = document.getElementById('dato-peso').value;

  if (!sexo || !fechaNacimiento || !tallaCm) {
    mostrarError('error-datos-faltantes', 'Sexo, fecha de nacimiento y talla son obligatorios.');
    return;
  }

  try {
    const datos = await sissoFetch(`/trabajadores/${trabajadorActualId}/datos-antropometricos`, {
      method: 'PUT',
      body: { sexo, fechaNacimiento, tallaCm: parseInt(tallaCm, 10), pesoKg: pesoKg ? parseFloat(pesoKg) : undefined }
    });
    trabajadorActual = { ...trabajadorActual, ...datos.trabajador };
    // Reflejar tambien en el arreglo cacheado
    const idx = trabajadores.findIndex(t => t.id === trabajadorActualId);
    if (idx >= 0) trabajadores[idx] = trabajadorActual;
    revisarDatosAntropometricos();
  } catch (err) {
    mostrarError('error-datos-faltantes', err.message || 'Error al guardar los datos.');
  }
}

// ------- Toggle post-BD -------
function alternarPostBD() {
  const activo = document.getElementById('tiene-postbd').checked;
  document.getElementById('col-post').style.display = activo ? '' : 'none';
  document.querySelectorAll('.col-post-celda').forEach(td => td.style.display = activo ? '' : 'none');
  document.getElementById('campo-minutos-post').style.display = activo ? 'block' : 'none';
}

function leerValor(id) {
  const val = document.getElementById(id).value;
  return val === '' ? null : parseFloat(val);
}

// ------- Guardar examen -------
async function guardarExamen() {
  ocultarError('error-examen');
  ocultarExito('exito-examen');

  const fvcPre = leerValor('fvc-pre');
  const fev1Pre = leerValor('fev1-pre');
  if (!fvcPre || !fev1Pre) {
    mostrarError('error-examen', 'FVC y FEV1 pre-broncodilatador son obligatorios.');
    return;
  }

  const tienePostBD = document.getElementById('tiene-postbd').checked;
  const cuerpo = {
    fechaExamen: document.getElementById('fecha-examen').value || undefined,
    fvcPre, fev1Pre,
    pefPre: leerValor('pef-pre') ?? undefined,
    fef2575Pre: leerValor('fef2575-pre') ?? undefined,
    observaciones: document.getElementById('observaciones').value.trim() || undefined,
  };

  if (tienePostBD) {
    cuerpo.fvcPost = leerValor('fvc-post') ?? undefined;
    cuerpo.fev1Post = leerValor('fev1-post') ?? undefined;
    cuerpo.pefPost = leerValor('pef-post') ?? undefined;
    cuerpo.fef2575Post = leerValor('fef2575-post') ?? undefined;
    cuerpo.minutosPostBroncodilatador = leerValor('minutos-post') ?? undefined;
  }

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    const datos = await sissoFetch(`/espirometria/trabajadores/${trabajadorActualId}`, {
      method: 'POST',
      body: cuerpo
    });

    mostrarExito('exito-examen', 'Examen de espirometría registrado correctamente.');
    mostrarResultado(datos.examen);

    document.querySelectorAll('.input-med').forEach(el => el.value = '');
    document.getElementById('observaciones').value = '';
    document.getElementById('tiene-postbd').checked = false;
    alternarPostBD();
    await cargarHistorial();

  } catch (err) {
    mostrarError('error-examen', err.message || 'Error al guardar el examen.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar examen de espirometría';
  }
}

// G19-01 (Auditoria N.19): la espirometria usa ecuaciones de referencia
// interinas (ECSC/ERS 1993), no una implementacion validada de GLI/ERS-ATS.
const AVISO_INTERINO_ESPIROMETRIA = `
  <div style="margin-bottom:10px;font-size:12px;font-weight:600;color:var(--amb2);background:var(--bg3);border-radius:6px;padding:8px 10px;">
    ⚠ Resultado INTERINO de apoyo: no es una conclusión diagnóstica. Requiere interpretación y validación del médico ocupacional.
  </div>`;

function mostrarResultado(examen) {
  const cont = document.getElementById('caja-resultado');
  const info = infoPatron(examen.patron);

  // CORREGIDO en Auditoria N.16 (C-16-01, P0): el nombre de campo
  // real es cambio_fev1_pct_predicho (no cambio_fev1_pct, que nunca
  // existio en la respuesta del backend -- este texto nunca se
  // renderizaba). El criterio mostrado ahora es exactamente el que
  // usa el motor (espirometria.js): ERS/ATS 2022, >10% del predicho,
  // no el ATS/ERS 2005 (>=12% y >=200 mL) que el backend ya no usa.
  let htmlReversibilidad = '';
  if (examen.reversibilidad_positiva) {
    htmlReversibilidad = `
      <div class="alerta-reversibilidad">
        <div class="alerta-reversibilidad-titulo">✓ Respuesta broncodilatadora positiva</div>
        <div>FEV1 cambió ${examen.cambio_fev1_pct_predicho > 0 ? '+' : ''}${examen.cambio_fev1_pct_predicho}% del predicho (criterio ERS/ATS 2022: &gt;10% del predicho de FEV1 o FVC).</div>
        ${examen.reversibilidad_protocolo_valido === false ? '<div style="margin-top:4px;color:var(--amb2);">⚠ Protocolo de broncodilatador no confirmado como válido — resultado no evaluable con certeza.</div>' : ''}
      </div>`;
  }

  // G19-01 (Auditoria N.19): el estado INTERINO se muestra SIEMPRE junto al
  // resultado, no solo cuando el backend envia metadatos_referencia.
  cont.innerHTML = `
    <div class="resultado-caja">
      ${AVISO_INTERINO_ESPIROMETRIA}
      <div style="margin-bottom:10px;">
        <span class="patron-chip-grande" style="background:${info.bg};color:${info.fg};">${info.etiqueta}</span>
      </div>
      <div class="resultado-fila">
        <div>FVC</div>
        <div class="valor">${examen.fvc_pre} L (${examen.fvc_pct_predicho ?? '—'}% del predicho)</div>
      </div>
      <div class="resultado-fila">
        <div>FEV1</div>
        <div class="valor">${examen.fev1_pre} L (${examen.fev1_pct_predicho ?? '—'}% del predicho)</div>
      </div>
      <div class="resultado-fila">
        <div>FEV1/FVC</div>
        <div class="valor">${examen.fev1_fvc_medido ?? '—'}%</div>
      </div>
      ${htmlReversibilidad}
      ${construirAvisoReferencia(examen)}
    </div>`;
}

// CREADO en Auditoria N.16 (C-16-01, P0): muestra exactamente el
// criterio/version que uso el backend para este examen puntual
// (metadatos_referencia), en vez de un texto fijo en el HTML que
// puede desincronizarse del motor. Si el backend todavia no envia
// metadatos_referencia (respuestas antiguas antes de esta
// correccion), no se muestra nada en vez de inventar un valor.
function construirAvisoReferencia(examen) {
  const meta = examen.metadatos_referencia;
  if (!meta) return '';
  return `
    <div style="margin-top:10px;font-size:11.5px;color:var(--t3);background:var(--bg3);border-radius:6px;padding:8px 10px;">
      <div><strong>Referencia de predichos:</strong> ${escHtml(meta.ecuacionPredichos || '—')}</div>
      <div><strong>Versión del algoritmo:</strong> ${escHtml(meta.versionAlgoritmo || '—')}${meta.esDefinitivo === false ? ' (interina, no GLI-2012 oficial)' : ''}</div>
      <div style="margin-top:4px;">Este resultado es una aproximación técnica. La interpretación clínica final es responsabilidad del médico ocupacional.</div>
    </div>`;
}

// ------- Historial -------
async function cargarHistorial() {
  const cont = document.getElementById('lista-examenes');
  cont.innerHTML = '<div class="sisso-cargando">Cargando historial…</div>';
  try {
    const datos = await sissoFetch(`/espirometria/trabajadores/${trabajadorActualId}`);
    const examenes = datos.examenes || [];

    if (examenes.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Aún no hay espirometrías registradas para este trabajador.</div>';
      return;
    }

    cont.innerHTML = examenes.map(e => {
      const info = infoPatron(e.patron);
      return `
        <div class="historial-item">
          <div class="historial-cabecera">
            <div>
              <strong>${formatearFecha(e.fecha_examen)}</strong>
              <span class="sisso-chip" style="background:${info.bg};color:${info.fg};margin-left:8px;">${info.etiqueta}</span>
              ${e.reversibilidad_positiva ? '<span class="sisso-chip verde" style="margin-left:4px;">✓ Reversibilidad +</span>' : ''}
            </div>
            <span style="font-size:11px;color:var(--t3);">Dr(a). ${escHtml(e.medico_nombre)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;">
            <div>FVC: ${e.fvc_pre} L (${e.fvc_pct_predicho ?? '—'}%)</div>
            <div>FEV1: ${e.fev1_pre} L (${e.fev1_pct_predicho ?? '—'}%)</div>
            <div>FEV1/FVC: ${e.fev1_fvc_medido ?? '—'}%</div>
          </div>
          ${construirFilaPostBD(e)}
          ${e.observaciones ? `<div style="font-size:12px;color:var(--t3);margin-top:6px;">${escHtml(e.observaciones)}</div>` : ''}
        </div>`;
    }).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

// Lote F (Fase 12): "presentacion pre/post broncodilatador" -- solo
// visualizacion, el calculo de reversibilidad_positiva ya lo hace el
// backend (motor de espirometria, no tocado).
function construirFilaPostBD(e) {
  if (e.fev1_post == null && e.fvc_post == null) return '';
  const flechaFev1 = (e.fev1_post != null && e.fev1_pre != null)
    ? (e.fev1_post > e.fev1_pre ? '↑' : e.fev1_post < e.fev1_pre ? '↓' : '=')
    : '';
  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11.5px;color:var(--t3);margin-top:4px;background:var(--bg3);border-radius:6px;padding:5px 8px;">
      <strong style="color:var(--t2);">Post-BD${e.minutos_post_broncodilatador ? ` (${e.minutos_post_broncodilatador} min)` : ''}:</strong>
      <div>FVC: ${e.fvc_post ?? '—'} L</div>
      <div>FEV1: ${e.fev1_post ?? '—'} L ${flechaFev1}</div>
      ${e.cambio_fev1_pct_predicho != null ? `<div>Δ FEV1: ${e.cambio_fev1_pct_predicho > 0 ? '+' : ''}${e.cambio_fev1_pct_predicho}% del predicho</div>` : ''}
    </div>`;
}

function infoPatron(patron) {
  const mapa = {
    normal:                        { etiqueta: 'Normal',                       bg: 'var(--grn3)', fg: 'var(--grn2)' },
    obstructivo_leve:              { etiqueta: 'Obstructivo leve',             bg: 'var(--amb3)', fg: 'var(--amb2)' },
    obstructivo_moderado:          { etiqueta: 'Obstructivo moderado',         bg: 'var(--amb3)', fg: 'var(--amb2)' },
    obstructivo_moderado_severo:   { etiqueta: 'Obstructivo moderado-severo',  bg: 'var(--red3)', fg: 'var(--red2)' },
    obstructivo_severo:            { etiqueta: 'Obstructivo severo',           bg: 'var(--red3)', fg: 'var(--red2)' },
    obstructivo_muy_severo:        { etiqueta: 'Obstructivo muy severo',       bg: 'var(--red3)', fg: 'var(--red2)' },
    restrictivo_sugerido:          { etiqueta: 'Restrictivo sugerido',         bg: 'var(--blue3)', fg: 'var(--blue2)' },
    mixto_sugerido:                { etiqueta: 'Mixto sugerido',               bg: 'var(--pur3)', fg: 'var(--pur2)' },
    no_clasificable:               { etiqueta: 'No clasificable',              bg: 'var(--bg3)', fg: 'var(--t2)' },
  };
  return mapa[patron] || mapa.no_clasificable;
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
