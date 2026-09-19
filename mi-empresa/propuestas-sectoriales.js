// ============================================================
// SISSO - Propuestas Sectoriales (Auditoria N.17, C-17-03)
//
// CREADO para dar interfaz al motor sectorial que hasta ahora solo
// existia como API (N.17 Lote 1 + los 7 lotes de materializacion
// de C-17-03). Vive dentro de "Mi Empresa" pero es la UNICA parte
// de esa pagina visible a admin/sso/medico por igual (ver
// mi-empresa.js) -- cada rol revisa aqui los tipos de propuesta
// que le corresponden segun ROLES_POR_TIPO_CLIENTE (espejo del
// ROLES_POR_TIPO real del backend, en
// configuracionSectorialController.js -- si el backend cambia
// quien revisa cada tipo, esta constante debe actualizarse igual).
// ============================================================
const SissoPropuestasSectoriales = (() => {

  const ROLES_POR_TIPO_CLIENTE = {
    area: ['admin'], puesto: ['admin'], epp: ['admin'], kpi: ['admin'],
    riesgo: ['sso'], herramienta_ergonomica: ['sso'],
    examen: ['medico'],
  };

  const INFO_TIPO = {
    area:                   { etiqueta: 'Áreas',                   icono: '🏢' },
    puesto:                 { etiqueta: 'Puestos de trabajo',      icono: '🪑' },
    epp:                    { etiqueta: 'EPP',                     icono: '🦺' },
    riesgo:                 { etiqueta: 'Riesgos',                 icono: '⚠️' },
    examen:                 { etiqueta: 'Exámenes médicos',        icono: '🩺' },
    herramienta_ergonomica: { etiqueta: 'Herramientas ergonómicas',icono: '📐' },
    kpi:                    { etiqueta: 'Indicadores (KPI)',       icono: '📈' },
  };

  // Campos adicionales editables al "Modificar" una propuesta, por
  // tipo -- ver MATERIALIZADORES en configuracionSectorialController.js
  // para el detalle exacto de que campo usa cada tipo (todos son
  // opcionales ahi: si no se envian, el materializador sigue
  // funcionando solo con "nombre").
  const CAMPOS_EXTRA_POR_TIPO = {
    area: [],
    puesto: [{ clave: 'area', etiqueta: 'Área sugerida', tipo: 'text' }],
    epp: [{ clave: 'tipo', etiqueta: 'Tipo de EPP', tipo: 'text' }],
    riesgo: [
      { clave: 'nivel', etiqueta: 'Nivel', tipo: 'select', opciones: ['alto', 'medio', 'bajo'] },
      { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
    ],
    examen: [
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', opciones: ['Sugerido por sector', 'Condicionado a exposición', 'Requiere criterio médico'] },
      { clave: 'frecuencia', etiqueta: 'Frecuencia', tipo: 'text' },
      { clave: 'normaReferencia', etiqueta: 'Norma de referencia', tipo: 'text' },
    ],
    herramienta_ergonomica: [{ clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' }],
    kpi: [{ clave: 'meta', etiqueta: 'Meta', tipo: 'text' }],
  };

  let estadoActual = { rol: null, tipos: [], tipoActivo: null, filtroEstado: 'pendiente', propuestas: [], propuestaEnModal: null };

  async function iniciar(rol) {
    estadoActual.rol = rol;
    estadoActual.tipos = Object.entries(ROLES_POR_TIPO_CLIENTE)
      .filter(([, roles]) => roles.includes(rol))
      .map(([tipo]) => tipo);

    if (estadoActual.tipos.length === 0) {
      // 'th' no participa en ningun tipo (ver ROLES_POR_TIPO en el
      // backend) -- no deberia ni ver esta tarjeta por el nav, pero
      // por si acaso llega aqui por URL directa.
      document.getElementById('tarjeta-propuestas-sectoriales').style.display = 'none';
      return;
    }

    estadoActual.tipoActivo = estadoActual.tipos[0];
    await cargarYRenderizar();
  }

  async function cargarYRenderizar() {
    try {
      const datos = await sissoFetch(`/configuracion-sectorial/propuestas?tipo=${estadoActual.tipoActivo}`);
      estadoActual.propuestas = datos.propuestas || [];
      renderizar();
    } catch (err) {
      document.getElementById('contenido-propuestas').innerHTML =
        `<div class="sisso-vacio">Error al cargar las propuestas: ${escHtmlProp(err.message)}</div>`;
    }
  }

  function renderizar() {
    const tabsHtml = estadoActual.tipos.map((tipo) => {
      const info = INFO_TIPO[tipo];
      const activo = tipo === estadoActual.tipoActivo;
      const pendientesTab = activo ? estadoActual.propuestas.filter((p) => p.estado === 'pendiente').length : null;
      return `
        <div class="tab-propuesta ${activo ? 'activo' : ''}" onclick="SissoPropuestasSectoriales.cambiarTipo('${tipo}')">
          ${info.icono} ${info.etiqueta}
          ${activo && pendientesTab > 0 ? `<span class="contador">${pendientesTab}</span>` : ''}
        </div>`;
    }).join('');

    const filtros = ['pendiente', 'aceptada', 'modificada', 'rechazada', 'todas'];
    const etiquetaFiltro = { pendiente: 'Pendientes', aceptada: 'Aceptadas', modificada: 'Modificadas', rechazada: 'Rechazadas', todas: 'Todas' };
    const filtrosHtml = filtros.map((f) => `
      <div class="filtro-estado ${f === estadoActual.filtroEstado ? 'activo' : ''}" onclick="SissoPropuestasSectoriales.cambiarFiltro('${f}')">${etiquetaFiltro[f]}</div>
    `).join('');

    const visibles = estadoActual.filtroEstado === 'todas'
      ? estadoActual.propuestas
      : estadoActual.propuestas.filter((p) => p.estado === estadoActual.filtroEstado);

    const listaHtml = visibles.length === 0
      ? `<div class="sisso-vacio">No hay propuestas ${etiquetaFiltro[estadoActual.filtroEstado].toLowerCase()} de este tipo.</div>`
      : visibles.map(renderizarCard).join('');

    document.getElementById('contenido-propuestas').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
        <div class="tabs-propuestas">${tabsHtml}</div>
        <button class="sisso-boton secundario" id="btn-generar-propuestas" onclick="SissoPropuestasSectoriales.generar()">🔄 Generar propuestas</button>
      </div>
      <div class="filtros-estado">${filtrosHtml}</div>
      <div id="lista-propuestas">${listaHtml}</div>
    `;
  }

  function renderizarCard(p) {
    const chipEstado = {
      pendiente: '<span class="sisso-chip ambar">Pendiente</span>',
      aceptada: '<span class="sisso-chip verde">Aceptada</span>',
      modificada: '<span class="sisso-chip azul">Modificada</span>',
      rechazada: '<span class="sisso-chip rojo">Rechazada</span>',
    }[p.estado] || '';

    const chipAplicado = p.aplicado
      ? '<span class="sisso-chip teal">✓ Aplicado</span>'
      : (p.estado === 'aceptada' || p.estado === 'modificada')
        ? '<span class="sisso-chip gris">Sin aplicar todavía</span>'
        : '';

    const datosMostrar = p.estado === 'modificada' ? p.datos_confirmados : p.datos_propuestos;
    const extraTexto = extraerTextoDetalle(p.tipo, datosMostrar);

    const acciones = p.estado === 'pendiente' ? `
      <div class="propuesta-acciones">
        <button class="sisso-boton" onclick="SissoPropuestasSectoriales.aceptar('${p.id}')">Aceptar</button>
        <button class="sisso-boton secundario" onclick="SissoPropuestasSectoriales.abrirModalModificar('${p.id}')">Modificar</button>
        <button class="sisso-boton secundario" style="color:var(--red2);" onclick="SissoPropuestasSectoriales.rechazar('${p.id}')">Rechazar</button>
      </div>
    ` : '';

    return `
      <div class="propuesta-card">
        <div class="propuesta-info">
          <div class="propuesta-nombre">${escHtmlProp(p.clave_item)}</div>
          <div class="propuesta-detalle">
            ${chipEstado} ${chipAplicado}
            ${extraTexto ? `<span>${escHtmlProp(extraTexto)}</span>` : ''}
            ${p.comentario_revision ? `<span>💬 ${escHtmlProp(p.comentario_revision)}</span>` : ''}
          </div>
        </div>
        ${acciones}
      </div>`;
  }

  // Arma un resumen legible de los campos extra (nivel/tipo/meta/etc.)
  // segun el tipo, para mostrar algo mas que el nombre en la tarjeta.
  function extraerTextoDetalle(tipo, datos) {
    if (typeof datos !== 'object' || datos === null) return '';
    const partes = [];
    for (const campo of CAMPOS_EXTRA_POR_TIPO[tipo] || []) {
      if (datos[campo.clave]) partes.push(`${campo.etiqueta}: ${datos[campo.clave]}`);
    }
    return partes.join(' · ');
  }

  function cambiarTipo(tipo) {
    estadoActual.tipoActivo = tipo;
    estadoActual.filtroEstado = 'pendiente';
    cargarYRenderizar();
  }

  function cambiarFiltro(filtro) {
    estadoActual.filtroEstado = filtro;
    renderizar();
  }

  async function generar() {
    const boton = document.getElementById('btn-generar-propuestas');
    boton.disabled = true;
    boton.textContent = 'Generando…';
    ocultarMensajes();
    try {
      const datos = await sissoFetch('/configuracion-sectorial/propuestas/generar', { method: 'POST', body: {} });
      mostrarExitoProp(`Se generaron ${datos.generadas ?? 0} propuestas nuevas (${datos.consideradas ?? 0} ítems revisados en el catálogo del sector).`);
      await cargarYRenderizar();
    } catch (err) {
      mostrarErrorProp(err.message || 'Error al generar propuestas.');
    } finally {
      boton.disabled = false;
      boton.textContent = '🔄 Generar propuestas';
    }
  }

  async function aceptar(id) {
    if (!confirm('¿Aceptar esta propuesta? Se creará el registro real correspondiente.')) return;
    await confirmarAccion(id, { accion: 'aceptar' });
  }

  async function rechazar(id) {
    const comentario = prompt('Motivo del rechazo (opcional):', '');
    if (comentario === null) return; // el usuario cancelo el prompt, no continuar
    await confirmarAccion(id, { accion: 'rechazar', comentario: comentario.trim() || undefined });
  }

  async function confirmarAccion(id, cuerpo) {
    ocultarMensajes();
    try {
      await sissoFetch(`/configuracion-sectorial/propuestas/${id}/confirmar`, { method: 'PUT', body: cuerpo });
      mostrarExitoProp('Listo.');
      await cargarYRenderizar();
    } catch (err) {
      mostrarErrorProp(err.message || 'Error al procesar la propuesta.');
    }
  }

  // ------- Modal "Modificar" -------
  function abrirModalModificar(id) {
    const p = estadoActual.propuestas.find((x) => x.id === id);
    if (!p) return;
    estadoActual.propuestaEnModal = p;

    const campos = CAMPOS_EXTRA_POR_TIPO[p.tipo] || [];
    const valorActual = (clave) => (typeof p.datos_propuestos === 'object' && p.datos_propuestos) ? (p.datos_propuestos[clave] || '') : '';

    let html = `
      <div class="sisso-campo">
        <label class="sisso-etiqueta">Nombre</label>
        <input id="modificar-nombre" class="sisso-input" value="${escAttrProp(p.clave_item)}">
      </div>`;
    for (const campo of campos) {
      if (campo.tipo === 'select') {
        html += `
          <div class="sisso-campo">
            <label class="sisso-etiqueta">${campo.etiqueta}</label>
            <select id="modificar-${campo.clave}" class="sisso-select">
              <option value="">Sin especificar</option>
              ${campo.opciones.map((o) => `<option value="${escAttrProp(o)}" ${valorActual(campo.clave) === o ? 'selected' : ''}>${escHtmlProp(o)}</option>`).join('')}
            </select>
          </div>`;
      } else if (campo.tipo === 'textarea') {
        html += `
          <div class="sisso-campo">
            <label class="sisso-etiqueta">${campo.etiqueta}</label>
            <textarea id="modificar-${campo.clave}" class="sisso-input" rows="2">${escHtmlProp(valorActual(campo.clave))}</textarea>
          </div>`;
      } else {
        html += `
          <div class="sisso-campo">
            <label class="sisso-etiqueta">${campo.etiqueta}</label>
            <input id="modificar-${campo.clave}" class="sisso-input" value="${escAttrProp(valorActual(campo.clave))}">
          </div>`;
      }
    }
    document.getElementById('modificar-campos').innerHTML = html;
    document.getElementById('modificar-error').classList.remove('visible');
    document.getElementById('modal-modificar-propuesta').classList.add('visible');
  }

  function cerrarModalModificar() {
    document.getElementById('modal-modificar-propuesta').classList.remove('visible');
    estadoActual.propuestaEnModal = null;
  }

  async function confirmarModificacion() {
    const p = estadoActual.propuestaEnModal;
    if (!p) return;
    const nombre = document.getElementById('modificar-nombre').value.trim();
    if (!nombre) {
      const err = document.getElementById('modificar-error');
      err.textContent = 'El nombre no puede quedar vacío.';
      err.classList.add('visible');
      return;
    }
    const datosModificados = { nombre };
    for (const campo of CAMPOS_EXTRA_POR_TIPO[p.tipo] || []) {
      const valor = document.getElementById(`modificar-${campo.clave}`).value.trim();
      if (valor) datosModificados[campo.clave] = valor;
    }

    const boton = document.getElementById('btn-confirmar-modificar');
    boton.disabled = true;
    try {
      await sissoFetch(`/configuracion-sectorial/propuestas/${p.id}/confirmar`, {
        method: 'PUT', body: { accion: 'modificar', datosModificados },
      });
      cerrarModalModificar();
      mostrarExitoProp('Propuesta modificada y aceptada.');
      await cargarYRenderizar();
    } catch (err) {
      const el = document.getElementById('modificar-error');
      el.textContent = err.message || 'Error al modificar la propuesta.';
      el.classList.add('visible');
    } finally {
      boton.disabled = false;
    }
  }

  // ------- Utilidades (usa las funciones de escape compartidas de shared/layout.js) -------
  const escHtmlProp = (s) => escaparHtml(s ?? '');
  const escAttrProp = (s) => escaparAtributoHtml(s ?? '');
  function ocultarMensajes() {
    document.getElementById('propuestas-error').classList.remove('visible');
    document.getElementById('propuestas-exito').classList.remove('visible');
  }
  function mostrarErrorProp(msg) {
    const el = document.getElementById('propuestas-error');
    el.textContent = msg; el.classList.add('visible');
  }
  function mostrarExitoProp(msg) {
    const el = document.getElementById('propuestas-exito');
    el.textContent = msg; el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 4000);
  }

  return { iniciar, cambiarTipo, cambiarFiltro, generar, aceptar, rechazar, abrirModalModificar, cerrarModalModificar, confirmarModificacion };
})();

// Los onclick del HTML (index.html) llaman a estas 2 funciones
// sueltas, igual que el resto de modales de la app (ver
// cerrarConfiguradorSectorial en configurador-sectorial.js).
function cerrarModalModificar() { SissoPropuestasSectoriales.cerrarModalModificar(); }
function confirmarModificacion() { SissoPropuestasSectoriales.confirmarModificacion(); }
