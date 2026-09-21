// ============================================================
// SISSO - Logica de la pagina (higiene-industrial/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let esGestor = false;
let usuariosOrganizacion = [];
let medicionModalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('higiene-industrial', 'Higiene Industrial');

  const usuario = SissoSesion.obtenerUsuario();
  esGestor = ['admin', 'sso'].includes(usuario.rol);

  if (esGestor) {
    document.getElementById('caja-crear').style.display = 'block';
    await cargarUsuarios();
  }

  await cargarListado();
});

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/usuarios');
    usuariosOrganizacion = datos.usuarios || [];
    document.getElementById('m-responsable').innerHTML = '<option value="">Selecciona…</option>' +
      usuariosOrganizacion.map(u => `<option value="${u.id}">${escHtml(u.nombre_completo)} (${escHtml(u.rol)})</option>`).join('');
  } catch (err) {
    document.getElementById('m-responsable').innerHTML = '<option value="">Error</option>';
  }
}

async function crearMedicion() {
  ocultarError('error-crear');
  ocultarExito('exito-crear');

  const tipoMedicion = document.getElementById('c-tipo').value;
  const criterio = document.getElementById('c-criterio').value;
  const area = document.getElementById('c-area').value.trim();
  const parametro = document.getElementById('c-parametro').value.trim();
  const valorMedido = document.getElementById('c-valor').value;
  const unidad = document.getElementById('c-unidad').value.trim();
  const limitePermisible = document.getElementById('c-limite').value;
  const equipoUtilizado = document.getElementById('c-equipo').value.trim();
  const metodoReferencia = document.getElementById('c-norma').value.trim();
  const fechaMedicion = document.getElementById('c-fecha').value;
  const observaciones = document.getElementById('c-observaciones').value.trim();

  if (!area) { mostrarError('error-crear', 'Indica el área.'); return; }
  if (!parametro) { mostrarError('error-crear', 'Indica el parámetro medido.'); return; }
  if (valorMedido === '' || limitePermisible === '') { mostrarError('error-crear', 'Indica el valor medido y el límite permisible.'); return; }
  if (!unidad) { mostrarError('error-crear', 'Indica la unidad.'); return; }
  if (!fechaMedicion) { mostrarError('error-crear', 'Indica la fecha de medición.'); return; }

  const boton = document.getElementById('btn-crear');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch('/higiene-industrial/mediciones', {
      method: 'POST',
      body: {
        tipoMedicion, criterio, area, parametro, valorMedido: parseFloat(valorMedido), unidad,
        limitePermisible: parseFloat(limitePermisible), equipoUtilizado: equipoUtilizado || undefined,
        metodoReferencia: metodoReferencia || undefined, fechaMedicion, observaciones: observaciones || undefined,
      },
    });
    mostrarExito('exito-crear', 'Medición registrada.');
    document.getElementById('c-area').value = '';
    document.getElementById('c-parametro').value = '';
    document.getElementById('c-valor').value = '';
    document.getElementById('c-unidad').value = '';
    document.getElementById('c-limite').value = '';
    document.getElementById('c-equipo').value = '';
    document.getElementById('c-norma').value = '';
    document.getElementById('c-observaciones').value = '';
    await cargarListado();
  } catch (err) {
    mostrarError('error-crear', err.message || 'Error al registrar la medición.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Registrar medición';
  }
}

async function cargarListado() {
  const cont = document.getElementById('tabla-mediciones');
  cont.innerHTML = '<div class="sisso-cargando">Cargando…</div>';

  const tipo = document.getElementById('f-tipo').value;
  const cumple = document.getElementById('f-cumple').value;
  const parametros = new URLSearchParams();
  if (tipo) parametros.set('tipoMedicion', tipo);
  if (cumple) parametros.set('cumple', cumple);

  try {
    const datos = await sissoFetch(`/higiene-industrial/mediciones?${parametros.toString()}`);
    const mediciones = datos.mediciones || [];
    if (mediciones.length === 0) {
      cont.innerHTML = '<div class="sisso-vacio">No hay mediciones con estos filtros.</div>';
      return;
    }
    cont.innerHTML = `
      <table class="tabla-medic">
        <thead><tr><th>Tipo</th><th>Área</th><th>Parámetro</th><th>Valor</th><th>Límite</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>
          ${mediciones.map(m => `
            <tr data-on-click="abrirModal('${m.id}')">
              <td>${etiquetaTipo(m.tipo_medicion)}</td>
              <td>${escHtml(m.area)}</td>
              <td>${escHtml(m.parametro)}</td>
              <td>${m.valor_medido} ${escHtml(m.unidad)}</td>
              <td>${m.limite_permisible} ${escHtml(m.unidad)}</td>
              <td>${m.cumple ? '<span class="sisso-chip verde">Cumple</span>' : '<span class="sisso-chip rojo">No cumple</span>'}${m.capa_id ? ' <span class="sisso-chip teal">CAPA</span>' : ''}</td>
              <td>${formatearFecha(m.fecha_medicion)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    cont.innerHTML = `<div class="sisso-vacio">Error al cargar: ${escHtml(err.message)}</div>`;
  }
}

async function abrirModal(id) {
  medicionModalId = id;
  document.getElementById('error-modal') && ocultarError('error-modal');
  try {
    const datos = await sissoFetch(`/higiene-industrial/mediciones/${id}`);
    const m = datos.medicion;
    document.getElementById('modal-titulo').textContent = `${etiquetaTipo(m.tipo_medicion)} — ${m.area}`;
    document.getElementById('modal-cuerpo').innerHTML = `
      <div style="font-size:13px;color:var(--t2);line-height:1.7;">
        <strong>Parámetro:</strong> ${escHtml(m.parametro)}<br>
        <strong>Valor medido:</strong> ${m.valor_medido} ${escHtml(m.unidad)}<br>
        <strong>Límite permisible:</strong> ${m.limite_permisible} ${escHtml(m.unidad)}<br>
        <strong>Resultado:</strong> ${m.cumple ? '<span class="sisso-chip verde">Cumple</span>' : '<span class="sisso-chip rojo">No cumple</span>'}<br>
        ${m.equipo_utilizado ? `<strong>Equipo:</strong> ${escHtml(m.equipo_utilizado)}<br>` : ''}
        ${m.metodo_referencia ? `<strong>Norma/método:</strong> ${escHtml(m.metodo_referencia)}<br>` : ''}
        <strong>Fecha:</strong> ${formatearFecha(m.fecha_medicion)}<br>
        <strong>Responsable:</strong> ${escHtml(m.responsable_nombre || '—')}<br>
        ${m.observaciones ? `<strong>Observaciones:</strong> ${escHtml(m.observaciones)}` : ''}
      </div>`;

    const cajaCapa = document.getElementById('modal-generar-capa');
    cajaCapa.style.display = (esGestor && !m.cumple && !m.capa_id) ? 'block' : 'none';
    if (m.capa_id) {
      document.getElementById('modal-cuerpo').innerHTML += '<div style="margin-top:10px;"><span class="sisso-chip verde">Ya tiene una acción CAPA generada</span></div>';
    }

    document.getElementById('modal-fondo').classList.add('visible');
  } catch (err) {
    alert('Error al cargar la medición: ' + (err.message || ''));
  }
}
function cerrarModal() { document.getElementById('modal-fondo').classList.remove('visible'); }

async function confirmarGenerarCapa() {
  ocultarError('error-modal');
  const responsableId = document.getElementById('m-responsable').value;
  const fechaLimite = document.getElementById('m-fecha-limite').value;
  if (!responsableId) { mostrarError('error-modal', 'Selecciona un responsable.'); return; }
  if (!fechaLimite) { mostrarError('error-modal', 'Indica la fecha límite.'); return; }

  try {
    await sissoFetch(`/higiene-industrial/mediciones/${medicionModalId}/generar-capa`, {
      method: 'POST', body: { responsableId, fechaLimite },
    });
    cerrarModal();
    await cargarListado();
  } catch (err) {
    mostrarError('error-modal', err.message || 'Error al generar la acción CAPA.');
  }
}

// ======= Utilidades =======
function etiquetaTipo(tipo) {
  const mapa = { ruido: 'Ruido', iluminacion: 'Iluminación', vibracion: 'Vibración', quimico: 'Agente químico', estres_termico: 'Estrés térmico', polvo: 'Polvo', radiacion: 'Radiación', otro: 'Otro' };
  return mapa[tipo] || tipo;
}
function formatearFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

const escHtml = escaparHtml;
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
