// ============================================================
// SISSO - Logica de la pagina (enfermedad-profesional/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let trabajadores = [];
let trabajadorActualId = null;
let casoActualId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('enfermedad-profesional', 'Enfermedad Profesional');

  const usuario = SissoSesion.obtenerUsuario();
  if (usuario.rol === 'sso') {
    document.getElementById('vista-sso').style.display = 'block';
    await cargarVistaPreventivaSso();
  } else {
    // 'medico' es el unico otro rol con acceso a este modulo (ver
    // shared/layout.js MENU y enfermedadProfesionalRoutes.js).
    document.getElementById('vista-medico').style.display = 'block';
    await cargarTrabajadores();

    // Autocompletado CIE-10: mismo catalogo que usa el modulo de
    // aptitud (GET /aptitud/cie10/buscar), restringido a medico/admin
    // en el backend -- coherente porque este formulario solo lo ve 'medico'.
    activarAutocompletoCie10(
      document.getElementById('nc-diagnostico-presuntivo'),
      document.getElementById('cie10-sugerencias-nc'),
      (codigo, descripcion) => { document.getElementById('nc-diagnostico-presuntivo').value = `${codigo} — ${descripcion}`; }
    );
    activarAutocompletoCie10(
      document.getElementById('d-diagnostico-cie10'),
      document.getElementById('cie10-sugerencias-d'),
      (codigo) => { document.getElementById('d-diagnostico-cie10').value = codigo; }
    );
  }
});

// ======= Autocompletado CIE-10 (reutilizable) =======
function activarAutocompletoCie10(campoEl, sugerenciasEl, alSeleccionar) {
  let temporizador = null;

  campoEl.addEventListener('input', () => {
    clearTimeout(temporizador);
    const q = campoEl.value.trim();
    if (q.length < 2) {
      sugerenciasEl.style.display = 'none';
      sugerenciasEl.innerHTML = '';
      return;
    }
    temporizador = setTimeout(async () => {
      try {
        const datos = await sissoFetch(`/aptitud/cie10/buscar?q=${encodeURIComponent(q)}`);
        const resultados = datos.resultados || [];
        if (resultados.length === 0) {
          sugerenciasEl.innerHTML = '<div class="cie10-vacio">Sin coincidencias en el catálogo CIE-10.</div>';
        } else {
          sugerenciasEl.innerHTML = resultados.map(r => `
            <div class="cie10-opcion" data-codigo="${escAtributo(r.codigo)}" data-descripcion="${escAtributo(r.descripcion)}">
              <span class="cie10-codigo">${escHtml(r.codigo)}</span>${escHtml(r.descripcion)}
            </div>`).join('');
        }
        sugerenciasEl.style.display = 'block';
        sugerenciasEl.querySelectorAll('.cie10-opcion').forEach((opcionEl) => {
          opcionEl.addEventListener('click', () => {
            alSeleccionar(opcionEl.dataset.codigo, opcionEl.dataset.descripcion);
            sugerenciasEl.style.display = 'none';
            sugerenciasEl.innerHTML = '';
          });
        });
      } catch (err) {
        sugerenciasEl.style.display = 'none';
      }
    }, 300);
  });

  document.addEventListener('click', (evento) => {
    if (evento.target !== campoEl && !sugerenciasEl.contains(evento.target)) {
      sugerenciasEl.style.display = 'none';
    }
  });
}

// ======= VISTA SSO =======
async function cargarVistaPreventivaSso() {
  const cont = document.getElementById('tabla-resumen-sso');
  try {
    const datos = await sissoFetch('/enfermedad-profesional/vista-preventiva-sso');
    const resumen = datos.resumen || [];
    if (resumen.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay casos registrados por el Médico Ocupacional todavía.</div>';
      return;
    }
    cont.innerHTML = `
      <table class="tabla-resumen">
        <thead><tr><th>Estado</th><th>Exposición relacionada</th><th>Casos</th></tr></thead>
        <tbody>
          ${resumen.map(r => `
            <tr>
              <td>${chipDeEstado(r.estado)}</td>
              <td>${escHtml(r.exposicion_relacionada || '—')}</td>
              <td><strong>${r.total}</strong></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar el resumen: ${escHtml(err.message)}</div>`;
  }
}

// ======= VISTA MÉDICO =======
async function cargarTrabajadores() {
  const sel = document.getElementById('sel-trabajador');
  try {
    const datos = await sissoFetch('/trabajadores');
    trabajadores = datos.trabajadores || [];
    sel.innerHTML = '<option value="">Selecciona un trabajador…</option>' +
      trabajadores.map(t => `<option value="${t.id}">${escHtml(t.nombre_completo)} — ${escHtml(t.documento)}</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">Error al cargar trabajadores</option>';
    mostrarError('error-trabajador', err.message);
  }
}

function elegirTrabajador() {
  ocultarError('error-trabajador');
  const id = document.getElementById('sel-trabajador').value;
  if (!id) { mostrarError('error-trabajador', 'Selecciona un trabajador.'); return; }

  trabajadorActualId = id;
  const t = trabajadores.find(x => x.id === id);
  document.getElementById('titulo-trabajador').textContent = t ? `${t.nombre_completo} — ${t.documento}` : 'Trabajador';

  document.getElementById('caja-seleccion-trabajador').style.display = 'none';
  document.getElementById('caja-principal').style.display = 'block';
  cerrarDetalleCaso();
  cargarCasos();
}

function cambiarTrabajador() {
  trabajadorActualId = null;
  document.getElementById('caja-seleccion-trabajador').style.display = 'block';
  document.getElementById('caja-principal').style.display = 'none';
}

async function crearCaso() {
  ocultarError('error-nuevo-caso');
  ocultarExito('exito-nuevo-caso');

  const fecha = document.getElementById('nc-fecha').value;
  const diagnosticoPresuntivo = document.getElementById('nc-diagnostico-presuntivo').value.trim();
  const exposicion = document.getElementById('nc-exposicion').value.trim();

  if (!fecha) { mostrarError('error-nuevo-caso', 'Indica la fecha de sospecha.'); return; }

  const boton = document.getElementById('btn-nuevo-caso');
  boton.disabled = true;
  boton.textContent = 'Abriendo caso…';

  try {
    await sissoFetch(`/enfermedad-profesional/trabajadores/${trabajadorActualId}`, {
      method: 'POST',
      body: { fechaSospecha: fecha, diagnosticoPresuntivo: diagnosticoPresuntivo || undefined, exposicionRelacionada: exposicion || undefined },
    });
    mostrarExito('exito-nuevo-caso', 'Caso abierto correctamente.');
    document.getElementById('nc-diagnostico-presuntivo').value = '';
    document.getElementById('nc-exposicion').value = '';
    await cargarCasos();
  } catch (err) {
    mostrarError('error-nuevo-caso', err.message || 'Error al abrir el caso.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Abrir caso';
  }
}

async function cargarCasos() {
  const cont = document.getElementById('lista-casos');
  cont.innerHTML = '<div class="sisso-cargando">Cargando casos…</div>';
  try {
    const datos = await sissoFetch(`/enfermedad-profesional/trabajadores/${trabajadorActualId}`);
    const casos = datos.casos || [];
    if (casos.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">Este trabajador aún no tiene casos de enfermedad profesional.</div>';
      return;
    }
    cont.innerHTML = casos.map(c => `
      <div class="caso-item" data-on-click="abrirDetalleCaso('${c.id}')">
        <div class="caso-cabecera">
          ${chipDeEstado(c.estado)}
          <span style="font-size:11px;color:var(--t3);">${formatearFecha(c.fecha_sospecha)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--t2);margin-top:6px;">
          ${escHtml(c.diagnostico_descripcion || c.diagnostico_presuntivo || 'Sin diagnóstico registrado aún.')}
        </div>
      </div>`).join('');
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar los casos: ${escHtml(err.message)}</div>`;
  }
}

async function abrirDetalleCaso(casoId) {
  casoActualId = casoId;
  ocultarError('error-detalle');
  ocultarExito('exito-detalle');
  document.getElementById('caja-detalle-caso').style.display = 'block';
  document.getElementById('caja-detalle-caso').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const datos = await sissoFetch(`/enfermedad-profesional/casos/${casoId}`);
    const c = datos.caso;
    document.getElementById('d-estado').value = c.estado;
    document.getElementById('d-diagnostico-cie10').value = c.diagnostico_cie10 || '';
    document.getElementById('d-evolucion').value = c.evolucion_clinica || '';
    document.getElementById('d-conclusion').value = c.conclusion || '';

    const seguimientos = datos.seguimientos || [];
    document.getElementById('lista-seguimientos').innerHTML = seguimientos.length === 0
      ? '<div class="sisso-vacio">Sin seguimientos registrados.</div>'
      : seguimientos.map(s => `
          <div class="seguimiento-item">
            <div style="font-size:11px;color:var(--t3);margin-bottom:3px;">${formatearFecha(s.fecha)}</div>
            <div style="font-size:12.5px;color:var(--t2);">${escHtml(s.nota_clinica)}</div>
          </div>`).join('');
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al cargar el caso.');
  }
}

function cerrarDetalleCaso() {
  casoActualId = null;
  document.getElementById('caja-detalle-caso').style.display = 'none';
}

async function guardarCaso() {
  ocultarError('error-detalle');
  ocultarExito('exito-detalle');

  const estado = document.getElementById('d-estado').value;
  const diagnosticoCie10 = document.getElementById('d-diagnostico-cie10').value.trim();
  const evolucionClinica = document.getElementById('d-evolucion').value.trim();
  const conclusion = document.getElementById('d-conclusion').value.trim();

  const boton = document.getElementById('btn-guardar-caso');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch(`/enfermedad-profesional/casos/${casoActualId}`, {
      method: 'PUT',
      body: {
        estado,
        diagnosticoCie10: diagnosticoCie10 || undefined,
        evolucionClinica: evolucionClinica || undefined,
        conclusion: conclusion || undefined,
        conclusionExistente: !!conclusion,
      },
    });
    mostrarExito('exito-detalle', 'Caso actualizado.');
    await cargarCasos();
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al guardar el caso.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar cambios';
  }
}

async function agregarSeguimiento() {
  ocultarError('error-detalle');
  const fecha = document.getElementById('s-fecha').value;
  const nota = document.getElementById('s-nota').value.trim();

  if (!fecha || nota.length < 5) {
    mostrarError('error-detalle', 'Indica fecha y una nota clínica de al menos 5 caracteres.');
    return;
  }

  try {
    await sissoFetch(`/enfermedad-profesional/casos/${casoActualId}/seguimientos`, {
      method: 'POST',
      body: { fecha, notaClinica: nota },
    });
    document.getElementById('s-nota').value = '';
    await abrirDetalleCaso(casoActualId);
  } catch (err) {
    mostrarError('error-detalle', err.message || 'Error al agregar el seguimiento.');
  }
}

// ======= Utilidades =======
function chipDeEstado(estado) {
  const mapa = {
    sospecha: ['ambar', 'Sospecha'], en_evaluacion: ['ambar', 'En evaluación'],
    confirmada: ['rojo', 'Confirmada'], descartada: ['gris', 'Descartada'],
    en_seguimiento: ['teal', 'En seguimiento'], cerrada: ['verde', 'Cerrada'],
  };
  const [clase, label] = mapa[estado] || ['gris', estado];
  return `<span class="sisso-chip ${clase}">${label}</span>`;
}

function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

const escHtml = escaparHtml;
function escAtributo(texto) {
  return escaparHtml(texto == null ? '' : String(texto)).replace(/'/g, '&#39;');
}
function mostrarError(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 5000);
}
function ocultarExito(idEl) { document.getElementById(idEl).classList.remove('visible'); }
