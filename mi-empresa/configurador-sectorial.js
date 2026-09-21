// ============================================================
// SISSO - Configurador inteligente de sector empresarial
// (Lote B del plan "Perfil inteligente de empresa" -- Fase 3:
// wizard de 6 pasos en "Mi Empresa").
//
// Consume el catalogo global de sectores (Lote A,
// /api/catalogo-sectores) y al confirmar, guarda la eleccion en
// PUT /api/organizacion/perfil-sectorial. No sobrescribe nada del
// perfil de la organizacion hasta que el usuario aprieta
// "Aplicar configuracion" en el paso 6 (Fase 3: "Nada debe
// sobrescribir informacion real sin confirmacion explicita").
//
// La Fase 4 del plan (pais / normativa por pais) todavia no esta
// implementada como arquitectura de backend -- ver Lote C,
// deliberadamente dejado para el final. El paso 4 de este asistente
// (pais y normativa) por ahora es solo informativo: muestra que
// Ecuador es el unico perfil normativo desarrollado y que el resto
// esta "disponible / en desarrollo", tal como exige la Fase 4, sin
// guardar ninguna seleccion todavia.
// ============================================================

const TOTAL_PASOS_CONFIG = 6;

let configEstado = {
  paso: 1,
  sectores: [],
  sectorClave: null,
  sectorDetalle: null,
  ciiu: '',
  ciiuDesc: '',
  numeroTrabajadores: null,
  riesgosSeleccionados: [], // nombres de riesgo confirmados como presentes
  paises: [], // Lote C
  paisNormativoClave: null, // Lote C
};

async function abrirConfiguradorSectorial() {
  configEstado = {
    paso: 1,
    sectores: [],
    sectorClave: organizacionActual?.sector_empresarial_clave || null,
    sectorDetalle: null,
    ciiu: organizacionActual?.actividad_economica_ciiu || '',
    ciiuDesc: organizacionActual?.actividad_economica_desc || '',
    numeroTrabajadores: organizacionActual?.numero_trabajadores_declarado ?? (resumenActual ? resumenActual.trabajadores_activos : null),
    riesgosSeleccionados: Array.isArray(organizacionActual?.riesgos_presentes) ? [...organizacionActual.riesgos_presentes] : [],
    paises: [],
    paisNormativoClave: organizacionActual?.pais_normativo_clave || 'ecuador',
  };

  document.getElementById('modal-config-sectorial').classList.add('visible');
  document.getElementById('config-error').classList.remove('visible');

  try {
    const datos = await sissoFetch('/catalogo-sectores');
    configEstado.sectores = datos.sectores || [];
    if (configEstado.sectorClave) {
      const yaDetalle = configEstado.sectores.find(s => s.clave === configEstado.sectorClave);
      if (yaDetalle) configEstado.sectorDetalle = yaDetalle;
    }
  } catch (err) {
    mostrarErrorConfigurador('No se pudo cargar el catálogo de sectores: ' + err.message);
  }

  // Lote C (Fase 4): catalogo de paises / perfiles normativos.
  try {
    const datosPaises = await sissoFetch('/catalogo-paises');
    configEstado.paises = datosPaises.paises || [];
  } catch (err) {
    mostrarErrorConfigurador('No se pudo cargar el catálogo de países: ' + err.message);
  }

  renderizarPasoConfigurador();
}

function cambiarPaisConfigurador(clave) {
  configEstado.paisNormativoClave = clave;
  renderizarPasoConfigurador();
}

function cerrarConfiguradorSectorial() {
  document.getElementById('modal-config-sectorial').classList.remove('visible');
}

function mostrarErrorConfigurador(msg) {
  const el = document.getElementById('config-error');
  el.textContent = msg;
  el.classList.add('visible');
}

function renderizarIndicadorPasos() {
  let html = '';
  for (let i = 1; i <= TOTAL_PASOS_CONFIG; i++) {
    html += `<div class="${i < configEstado.paso ? 'hecho' : i === configEstado.paso ? 'actual' : ''}"></div>`;
  }
  document.getElementById('config-pasos-indicador').innerHTML = html;
}

function renderizarPasoConfigurador() {
  renderizarIndicadorPasos();
  document.getElementById('config-error').classList.remove('visible');

  const titulos = {
    1: 'Paso 1 de 6 — Sector de la empresa',
    2: 'Paso 2 de 6 — Actividad económica (CIIU)',
    3: 'Paso 3 de 6 — Número de trabajadores',
    4: 'Paso 4 de 6 — País y normativa aplicable',
    5: 'Paso 5 de 6 — Riesgos presentes en tu empresa',
    6: 'Paso 6 de 6 — Confirmación de configuración',
  };
  document.getElementById('config-paso-subtitulo').textContent = titulos[configEstado.paso];

  const contenedor = document.getElementById('config-contenido-paso');
  const btnAtras = document.getElementById('btn-config-atras');
  const btnSiguiente = document.getElementById('btn-config-siguiente');
  btnAtras.style.display = configEstado.paso > 1 ? 'inline-block' : 'none';
  btnSiguiente.textContent = configEstado.paso === TOTAL_PASOS_CONFIG ? '✓ Aplicar configuración' : 'Siguiente →';

  if (configEstado.paso === 1) {
    if (configEstado.sectores.length === 0) {
      contenedor.innerHTML = `<div class="sisso-cargando">Cargando catálogo de sectores…</div>`;
      return;
    }
    contenedor.innerHTML = `
      <div class="sector-cards-grid">
        ${configEstado.sectores.map(s => `
          <div class="sector-card ${s.clave === configEstado.sectorClave ? 'seleccionada' : ''}" data-on-click="seleccionarSectorConfigurador('${s.clave}')">
            <span class="icono">${escSector(s.icono || '🏢')}</span>
            <div class="etiqueta">${escSector(s.etiqueta)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (configEstado.paso === 2) {
    contenedor.innerHTML = `
      <div class="fila-campos">
        <div class="sisso-campo">
          <label class="sisso-etiqueta">Código CIIU</label>
          <input id="cfg-ciiu" class="sisso-input" value="${escAttrSector(configEstado.ciiu)}" placeholder="Ej: Q8610.01">
        </div>
        <div class="sisso-campo">
          <label class="sisso-etiqueta">Descripción de la actividad</label>
          <input id="cfg-ciiu-desc" class="sisso-input" value="${escAttrSector(configEstado.ciiuDesc)}" placeholder="Ej: Actividades de hospitales">
        </div>
      </div>
      <div style="font-size:11.5px; color:var(--t3); margin-top:8px;">Opcional en este paso — puedes completarlo después desde el formulario principal de "Mi Empresa".</div>
    `;
  } else if (configEstado.paso === 3) {
    contenedor.innerHTML = `
      <div class="sisso-campo" style="max-width:220px;">
        <label class="sisso-etiqueta">Número de trabajadores</label>
        <input id="cfg-num-trabajadores" type="number" min="0" class="sisso-input" value="${configEstado.numeroTrabajadores ?? ''}">
      </div>
      <div style="font-size:11.5px; color:var(--t3); margin-top:8px;">${resumenActual ? `Tu organización tiene actualmente ${resumenActual.trabajadores_activos} trabajador(es) activo(s) registrados en el sistema. Este número es el que declaras para fines de configuración inicial (por ejemplo, si todavía no los has cargado a todos).` : ''}</div>
    `;
  } else if (configEstado.paso === 4) {
    if (configEstado.paises.length === 0) {
      contenedor.innerHTML = `<div class="sisso-cargando">Cargando catálogo de países…</div>`;
    } else {
      const paisElegido = configEstado.paises.find(p => p.clave === configEstado.paisNormativoClave);
      contenedor.innerHTML = `
        <div class="fila-campos" style="margin-bottom:12px;">
          <div class="sisso-campo">
            <label class="sisso-etiqueta">País</label>
            <select class="sisso-select" id="cfg-pais" data-on-change="cambiarPaisConfigurador(this.value)">
              ${configEstado.paises.map(p => `<option value="${p.clave}" ${p.clave === configEstado.paisNormativoClave ? 'selected' : ''}>${p.bandera_emoji || ''} ${escSector(p.nombre)}${p.estado === 'en_desarrollo' ? ' — en desarrollo' : ''}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="normativa-aviso">
          <strong>Perfil normativo: ${escSector(paisElegido?.nombre || '')} ${paisElegido?.estado === 'completo' ? '(implementación parcial verificada)' : '(disponible / en desarrollo)'}.</strong><br>
          ${escSector(paisElegido?.descripcion_estado || '')}
          ${paisElegido?.normativa_principal ? `<div style="margin-top:6px;font-size:11.5px;">Referencia normativa: ${escSector(paisElegido.normativa_principal)}</div>` : ''}
          ${construirCoberturaNormativa(paisElegido?.cobertura_detalle)}
          ${paisElegido?.estado === 'en_desarrollo' ? `<div style="margin-top:8px;font-weight:700;">⚠ Seleccionar este país NO activa reglas, formatos ni cumplimiento legal específico — solo registra tu preferencia para cuando ese perfil normativo esté desarrollado.</div>` : ''}
        </div>
      `;
    }
  } else if (configEstado.paso === 5) {
    const riesgos = configEstado.sectorDetalle?.riesgos || [];
    if (riesgos.length === 0) {
      contenedor.innerHTML = `<div class="sisso-vacio">El sector seleccionado no tiene riesgos predefinidos en el catálogo. Puedes continuar sin marcar ninguno.</div>`;
    } else {
      contenedor.innerHTML = `
        <div style="font-size:12px; color:var(--t3); margin-bottom:10px;">Marca los riesgos que efectivamente están presentes en tu empresa. Vienen pre-seleccionados según el sector elegido — puedes desmarcar los que no apliquen.</div>
        <div>
          ${riesgos.map(r => `
            <label class="chip-checkbox">
              <input type="checkbox" value="${escAttrSector(r.nombre)}" ${configEstado.riesgosSeleccionados.includes(r.nombre) ? 'checked' : ''} data-on-change="alternarRiesgoConfigurador('${escAttrSector(r.nombre)}', this.checked)">
              ${escSector(r.icono || '')} ${escSector(r.nombre)}
            </label>
          `).join('')}
        </div>
      `;
    }
  } else if (configEstado.paso === 6) {
    const s = configEstado.sectorDetalle;
    contenedor.innerHTML = `
      <div class="previsualizacion-grupo">
        <h4>🏢 Perfil empresarial</h4>
        <div class="previsualizacion-lista">
          <span>${escSector(s?.icono || '🏢')} ${escSector(s?.etiqueta || configEstado.sectorClave || '—')}</span>
          <span>👥 ${configEstado.numeroTrabajadores ?? '—'} trabajadores declarados</span>
          <span>${escSector(configEstado.paises.find(p => p.clave === configEstado.paisNormativoClave)?.bandera_emoji || '')} ${escSector(configEstado.paises.find(p => p.clave === configEstado.paisNormativoClave)?.nombre || configEstado.paisNormativoClave || '—')}</span>
        </div>
      </div>
      <div class="previsualizacion-grupo">
        <h4>⚠ Riesgos confirmados como presentes</h4>
        <div class="previsualizacion-lista">${configEstado.riesgosSeleccionados.length ? configEstado.riesgosSeleccionados.map(r => `<span>${escSector(r)}</span>`).join('') : '<span>Ninguno seleccionado</span>'}</div>
      </div>
      <div class="previsualizacion-grupo">
        <h4>📍 Áreas típicas sugeridas</h4>
        <div class="previsualizacion-lista">${(s?.areas || []).map(a => `<span>${escSector(a)}</span>`).join('') || '<span>—</span>'}</div>
      </div>
      <div class="previsualizacion-grupo">
        <h4>🩺 Exámenes ocupacionales sugeridos</h4>
        <div class="previsualizacion-lista">${(s?.examenes_sugeridos || []).map(e => `<span>${escSector(e.nombre)}${e.frecuencia ? ' · ' + escSector(e.frecuencia) : ''}${e.tipo ? ` <em style="font-style:normal;color:var(--t3);">(${escSector(e.tipo)})</em>` : ''}</span>`).join('') || '<span>—</span>'}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:4px;">Ninguna de estas etiquetas es una obligación legal o clínica por sí sola — la necesidad real de cada examen depende del puesto, la exposición y el criterio del médico ocupacional.</div>
      </div>
      <div class="previsualizacion-grupo">
        <h4>📐 Herramientas ergonómicas sugeridas</h4>
        <div class="previsualizacion-lista">${(s?.herramientas_ergonomicas || []).map(h => `<span>${escSector(h)}</span>`).join('') || '<span>—</span>'}</div>
      </div>
      <div class="previsualizacion-grupo">
        <h4>🦺 EPP sugerido</h4>
        <div class="previsualizacion-lista">${(s?.epp_sugerido || []).map(e => `<span>${escSector(e)}</span>`).join('') || '<span>—</span>'}</div>
      </div>
      <div class="previsualizacion-grupo">
        <h4>📊 KPIs sugeridos</h4>
        <div class="previsualizacion-lista">${(s?.kpis_sugeridos || []).map(k => `<span>${escSector(k.nombre)}${k.meta ? ' (meta: ' + escSector(k.meta) + ')' : ''}</span>`).join('') || '<span>—</span>'}</div>
      </div>
      <div style="font-size:11.5px; color:var(--t3); margin-top:6px;">Esto NO reemplaza tu configuración real de puestos, exámenes ni matriz de riesgos — son sugerencias del sector para orientarte. Puedes editar todo después desde sus propias pantallas.</div>
    `;
  }
}

function escSector(t) { return (typeof escaparHtml === 'function') ? escaparHtml(String(t ?? '')) : String(t ?? ''); }

// CREADO en Auditoria N.16 (C-16-03, P0): reemplaza la afirmacion
// absoluta "completamente desarrollado" por un desglose verificable
// (reglas implementadas / pendientes / norma fuente / version /
// fecha de revision / responsable), tal como pide la auditoria. Si
// el backend todavia no envia cobertura_detalle (pais sin este dato
// cargado), no se muestra nada en vez de inventar contenido.
function construirCoberturaNormativa(cobertura) {
  if (!cobertura) return '';
  const implementadas = Array.isArray(cobertura.reglasImplementadas) ? cobertura.reglasImplementadas : [];
  const pendientes = Array.isArray(cobertura.reglasPendientes) ? cobertura.reglasPendientes : [];
  return `
    <div style="margin-top:8px;font-size:11.5px;">
      ${implementadas.length ? `<div><strong>Implementado y verificado:</strong> ${implementadas.map(escSector).join(' · ')}</div>` : ''}
      ${pendientes.length ? `<div style="margin-top:4px;"><strong>Pendiente de validación:</strong> ${pendientes.map(escSector).join(' · ')}</div>` : ''}
      ${cobertura.version ? `<div style="margin-top:4px;color:var(--t3);">Versión de esta matriz: ${escSector(cobertura.version)}${cobertura.fechaRevision ? ' · Revisado: ' + escSector(cobertura.fechaRevision) : ''}${cobertura.responsableValidacion ? ' · ' + escSector(cobertura.responsableValidacion) : ''}</div>` : ''}
    </div>`;
}
function escAttrSector(t) { return (typeof escaparAtributoHtml === 'function') ? escaparAtributoHtml(String(t ?? '')) : String(t ?? ''); }

async function seleccionarSectorConfigurador(clave) {
  configEstado.sectorClave = clave;
  configEstado.sectorDetalle = configEstado.sectores.find(s => s.clave === clave) || null;
  // Al cambiar de sector, se re-sugieren sus riesgos por defecto (todavia
  // no se guarda nada -- el usuario confirma recien en el paso 6).
  configEstado.riesgosSeleccionados = (configEstado.sectorDetalle?.riesgos || []).map(r => r.nombre);
  renderizarPasoConfigurador();
}

function alternarRiesgoConfigurador(nombre, marcado) {
  if (marcado) {
    if (!configEstado.riesgosSeleccionados.includes(nombre)) configEstado.riesgosSeleccionados.push(nombre);
  } else {
    configEstado.riesgosSeleccionados = configEstado.riesgosSeleccionados.filter(r => r !== nombre);
  }
}

function pasoAnteriorConfigurador() {
  if (configEstado.paso > 1) {
    configEstado.paso--;
    renderizarPasoConfigurador();
  }
}

async function pasoSiguienteConfigurador() {
  // Validaciones minimas por paso antes de avanzar.
  if (configEstado.paso === 1 && !configEstado.sectorClave) {
    mostrarErrorConfigurador('Selecciona un sector para continuar.');
    return;
  }
  if (configEstado.paso === 2) {
    configEstado.ciiu = document.getElementById('cfg-ciiu')?.value.trim() || '';
    configEstado.ciiuDesc = document.getElementById('cfg-ciiu-desc')?.value.trim() || '';
  }
  if (configEstado.paso === 3) {
    const valor = document.getElementById('cfg-num-trabajadores')?.value;
    configEstado.numeroTrabajadores = valor === '' || valor == null ? null : parseInt(valor, 10);
  }

  if (configEstado.paso < TOTAL_PASOS_CONFIG) {
    configEstado.paso++;
    renderizarPasoConfigurador();
    return;
  }

  // Paso 6: aplicar configuracion de verdad.
  const boton = document.getElementById('btn-config-siguiente');
  boton.disabled = true;
  boton.textContent = 'Aplicando…';
  try {
    const datos = await sissoFetch('/organizacion/perfil-sectorial', {
      method: 'PUT',
      body: {
        sectorClave: configEstado.sectorClave,
        paisNormativoClave: configEstado.paisNormativoClave || undefined,
        numeroTrabajadoresDeclarado: configEstado.numeroTrabajadores,
        riesgosPresentes: configEstado.riesgosSeleccionados,
        actividadEconomicaCiiu: configEstado.ciiu || undefined,
        actividadEconomicaDesc: configEstado.ciiuDesc || undefined,
      },
    });
    organizacionActual = { ...organizacionActual, ...datos.organizacion };
    cerrarConfiguradorSectorial();
    await cargarPerfil();
  } catch (err) {
    mostrarErrorConfigurador('No se pudo aplicar la configuración: ' + err.message);
  } finally {
    boton.disabled = false;
    boton.textContent = '✓ Aplicar configuración';
  }
}
