// ============================================================
// SISSO - Logica de la pagina (configuracion/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
let rolElegido = null;

document.addEventListener('DOMContentLoaded', async () => {
  await SissoLayout.iniciar('configuracion', 'Configuración');
  await cargarUsuarios();
});

async function cargarUsuarios() {
  try {
    const datos = await sissoFetch('/auth/usuarios');
    renderizarTabla(datos.usuarios || []);
  } catch (err) {
    mostrarError('error-lista', 'No se pudieron cargar los usuarios: ' + err.message);
    document.getElementById('tabla-tbody').innerHTML = `<tr><td colspan="5" class="sisso-vacio">Error al cargar.</td></tr>`;
  }
}

function renderizarTabla(usuarios) {
  const tbody = document.getElementById('tabla-tbody');
  if (usuarios.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="sisso-vacio">Aún no hay usuarios registrados.</td></tr>`;
    return;
  }

  const etiquetasRol = { admin: 'Admin', medico: 'Médico', sso: 'SSO', th: 'Talento Humano' };

  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td style="font-weight:600;">${escHtml(u.nombre_completo)}</td>
      <td style="color:var(--t3);">${escHtml(u.email)}</td>
      <td><span class="rol-badge ${u.rol}">${etiquetasRol[u.rol] || u.rol}</span></td>
      <td>
        <span class="estado-punto ${u.activo ? 'activo' : 'inactivo'}"></span>${u.activo ? 'Activo' : 'Inactivo'}
        ${u.requiere_cambio_password ? '<div style="font-size:11px;color:var(--amb2);margin-top:2px;">Pendiente cambio de contraseña</div>' : ''}
      </td>
      <td style="color:var(--t3);font-size:12px;">${u.ultimo_login ? formatearFechaHora(u.ultimo_login) : 'Nunca ha ingresado'}</td>
      <td>
        <button class="btn-mini" data-on-click="abrirModalReset('${u.id}', '${escaparValorOnclickJs(u.nombre_completo)}')">Resetear contraseña</button>
        <button class="btn-mini" data-on-click="abrirModalCorregirNombre('${u.id}', '${escaparValorOnclickJs(u.nombre_completo)}')">Corregir nombre</button>
      </td>
    </tr>`).join('');
}

// ------- Modal nuevo usuario -------
function abrirModalNuevoUsuario() {
  document.getElementById('n-nombre').value = '';
  document.getElementById('n-email').value = '';
  document.getElementById('n-password').value = '';
  rolElegido = null;
  document.querySelectorAll('.rol-opcion').forEach(el => el.classList.remove('activa'));
  ocultarError('error-nuevo');
  document.getElementById('modal-nuevo').style.display = 'flex';
  document.getElementById('n-nombre').focus();
}

function cerrarModal() {
  document.getElementById('modal-nuevo').style.display = 'none';
}

function elegirRol(rol) {
  rolElegido = rol;
  document.querySelectorAll('.rol-opcion').forEach(el => el.classList.toggle('activa', el.dataset.rol === rol));
}

async function guardarUsuario() {
  ocultarError('error-nuevo');

  const nombreCompleto = document.getElementById('n-nombre').value.trim();
  const email = document.getElementById('n-email').value.trim();
  const password = document.getElementById('n-password').value;

  if (!nombreCompleto || !email || !password) { mostrarError('error-nuevo', 'Completa todos los campos obligatorios.'); return; }
  if (password.length < 12) { mostrarError('error-nuevo', 'La contraseña debe tener al menos 12 caracteres.'); return; }
  if (!rolElegido) { mostrarError('error-nuevo', 'Selecciona un rol para el usuario.'); return; }

  const boton = document.getElementById('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Creando…';

  try {
    await sissoFetch('/auth/registrar-usuario-interno', {
      method: 'POST',
      body: { nombreCompleto, email, password, rol: rolElegido }
    });

    cerrarModal();
    mostrarExito('exito-lista', `Usuario "${nombreCompleto}" creado correctamente.`);
    await cargarUsuarios();

  } catch (err) {
    mostrarError('error-nuevo', err.message || 'Error al crear el usuario.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Crear usuario';
  }
}

document.getElementById('modal-nuevo').addEventListener('click', (e) => {
  if (e.target.id === 'modal-nuevo') cerrarModal();
});

// ------- Modal resetear contrasena -------
let usuarioIdParaReset = null;

function abrirModalReset(usuarioId, nombreUsuario) {
  usuarioIdParaReset = usuarioId;
  document.getElementById('reset-nombre-usuario').textContent = nombreUsuario;
  document.getElementById('reset-password').value = '';
  ocultarError('error-reset');
  document.getElementById('modal-reset').style.display = 'flex';
  document.getElementById('reset-password').focus();
}

function cerrarModalReset() {
  document.getElementById('modal-reset').style.display = 'none';
  usuarioIdParaReset = null;
}

// ------- Corregir nombre (Auditoria N.15) -------
let usuarioIdParaCorregirNombre = null;

function abrirModalCorregirNombre(usuarioId, nombreActual) {
  usuarioIdParaCorregirNombre = usuarioId;
  document.getElementById('corregir-nombre-input').value = nombreActual;
  ocultarError('error-corregir-nombre');
  document.getElementById('modal-corregir-nombre').style.display = 'flex';
  document.getElementById('corregir-nombre-input').focus();
}

function cerrarModalCorregirNombre() {
  document.getElementById('modal-corregir-nombre').style.display = 'none';
  usuarioIdParaCorregirNombre = null;
}

async function confirmarCorregirNombre() {
  ocultarError('error-corregir-nombre');
  const nombreCompleto = document.getElementById('corregir-nombre-input').value.trim();

  if (nombreCompleto.length < 2) {
    mostrarError('error-corregir-nombre', 'El nombre debe tener al menos 2 caracteres.');
    return;
  }

  const boton = document.getElementById('btn-corregir-nombre');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    await sissoFetch(`/auth/usuarios/${usuarioIdParaCorregirNombre}/nombre`, {
      method: 'PATCH',
      body: { nombreCompleto },
    });
    cerrarModalCorregirNombre();
    await cargarUsuarios();
  } catch (err) {
    mostrarError('error-corregir-nombre', err.message || 'No se pudo corregir el nombre.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

async function confirmarReset() {
  ocultarError('error-reset');
  const passwordTemporal = document.getElementById('reset-password').value;

  if (!passwordTemporal || passwordTemporal.length < 12) {
    mostrarError('error-reset', 'La contraseña debe tener al menos 12 caracteres.');
    return;
  }

  const boton = document.getElementById('btn-reset');
  boton.disabled = true;
  boton.textContent = 'Reseteando…';

  try {
    await sissoFetch(`/auth/usuarios/${usuarioIdParaReset}/resetear-password`, {
      method: 'PUT',
      body: { passwordTemporal }
    });

    cerrarModalReset();
    mostrarExito('exito-lista', 'Contraseña reseteada. Comunícasela al usuario de forma segura.');
    await cargarUsuarios();

  } catch (err) {
    mostrarError('error-reset', err.message || 'Error al resetear la contraseña.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Resetear contraseña';
  }
}

document.getElementById('modal-reset').addEventListener('click', (e) => {
  if (e.target.id === 'modal-reset') cerrarModalReset();
});

// ------- Helpers -------
function formatearFechaHora(fecha) {
  return new Date(fecha).toLocaleString('es-EC', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
// CORREGIDO tras auditoria de seguridad (hallazgo G9): se usa la
// funcion de escape compartida (shared/layout.js), que tambien
// cubre comillas simples/dobles (relevante cuando el texto escapado
// termina dentro de un atributo HTML entre comillas, no solo en el
// texto visible), en vez de la copia local que solo cubria &, < y >.
const escHtml = escaparHtml;
function mostrarError(idEl, msg) { const el = document.getElementById(idEl); el.textContent = msg; el.classList.add('visible'); }
function ocultarError(idEl) { document.getElementById(idEl).classList.remove('visible'); }
function mostrarExito(idEl, msg) {
  const el = document.getElementById(idEl);
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 5000);
}
