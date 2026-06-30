// ============================================================
// SISSO - Modulo compartido de API.
//
// Centraliza: la URL del backend, el manejo de sesion (guardar/leer/
// borrar el token en localStorage), y una funcion fetch() que ya
// agrega el header de autenticacion y reintenta una vez con el
// refresh token si el access token expiro.
//
// Por que un solo archivo: si el backend cambia de URL, o si la
// logica de sesion necesita un ajuste, se edita aqui UNA vez y
// todos los modulos (reba, rula, aptitud, etc.) quedan actualizados
// automaticamente, porque todos importan este archivo.
// ============================================================

// ------------------------------------------------------------
// URL del backend. Unico lugar de todo el frontend donde esto
// se escribe. Si el backend cambia de direccion, se edita aqui.
// ------------------------------------------------------------
const SISSO_API_BASE = 'https://sissso-backend.onrender.com/api';

// Claves usadas en localStorage. Prefijadas con "sisso_" para no
// chocar con nada mas que pueda existir en el navegador.
const CLAVE_ACCESS_TOKEN = 'sisso_access_token';
const CLAVE_REFRESH_TOKEN = 'sisso_refresh_token';
const CLAVE_USUARIO = 'sisso_usuario';

// ------------------------------------------------------------
// Manejo de sesion
// ------------------------------------------------------------
const SissoSesion = {
  /**
   * Guarda la sesion completa tras un login exitoso.
   * @param {{accessToken: string, refreshToken: string, usuario: object}} datos
   */
  guardar(datos) {
    localStorage.setItem(CLAVE_ACCESS_TOKEN, datos.accessToken);
    localStorage.setItem(CLAVE_REFRESH_TOKEN, datos.refreshToken);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
  },

  /** Actualiza solo el access token (despues de un refresh exitoso). */
  actualizarAccessToken(nuevoAccessToken) {
    localStorage.setItem(CLAVE_ACCESS_TOKEN, nuevoAccessToken);
  },

  obtenerAccessToken() {
    return localStorage.getItem(CLAVE_ACCESS_TOKEN);
  },

  obtenerRefreshToken() {
    return localStorage.getItem(CLAVE_REFRESH_TOKEN);
  },

  /** @returns {{id:string, email:string, nombreCompleto:string, rol:string, organizacion:object}|null} */
  obtenerUsuario() {
    const crudo = localStorage.getItem(CLAVE_USUARIO);
    return crudo ? JSON.parse(crudo) : null;
  },

  haySesion() {
    return !!this.obtenerAccessToken();
  },

  limpiar() {
    localStorage.removeItem(CLAVE_ACCESS_TOKEN);
    localStorage.removeItem(CLAVE_REFRESH_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
  },
};

// ------------------------------------------------------------
// Cliente HTTP con autenticacion automatica.
// ------------------------------------------------------------

/**
 * Intenta renovar el access token usando el refresh token guardado.
 * @returns {Promise<boolean>} true si se renovo con exito.
 */
async function intentarRefrescarToken() {
  const refreshToken = SissoSesion.obtenerRefreshToken();
  if (!refreshToken) return false;

  try {
    const respuesta = await fetch(`${SISSO_API_BASE}/auth/refrescar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!respuesta.ok) return false;
    const datos = await respuesta.json();
    SissoSesion.actualizarAccessToken(datos.accessToken);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Hace una peticion al backend de SISSO, agregando el header de
 * autenticacion automaticamente. Si el access token expiro, intenta
 * refrescarlo una vez y reintenta la peticion original.
 *
 * Si la sesion no puede renovarse (refresh token tambien invalido),
 * limpia la sesion y redirige a la pantalla de login.
 *
 * @param {string} ruta - ej: '/trabajadores' o '/ergonomia/sesiones'
 * @param {object} [opciones] - mismas opciones que fetch(), pero
 *        `body` puede pasarse como objeto JS (se convierte a JSON solo).
 * @returns {Promise<any>} el cuerpo de la respuesta ya parseado como JSON.
 * @throws {Error} con `.status` y `.datos` si la respuesta no fue exitosa.
 */
async function sissoFetch(ruta, opciones = {}) {
  const construirHeaders = () => {
    const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
    const token = SissoSesion.obtenerAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const cuerpo = opciones.body && typeof opciones.body !== 'string'
    ? JSON.stringify(opciones.body)
    : opciones.body;

  let respuesta = await fetch(`${SISSO_API_BASE}${ruta}`, {
    ...opciones,
    headers: construirHeaders(),
    body: cuerpo,
  });

  // Si el token expiro, intentamos renovarlo una sola vez y reintentamos.
  if (respuesta.status === 401) {
    let datosError = null;
    try { datosError = await respuesta.clone().json(); } catch (e) { /* respuesta sin cuerpo JSON */ }

    if (datosError && datosError.codigo === 'TOKEN_EXPIRADO') {
      const renovado = await intentarRefrescarToken();
      if (renovado) {
        respuesta = await fetch(`${SISSO_API_BASE}${ruta}`, {
          ...opciones,
          headers: construirHeaders(),
          body: cuerpo,
        });
      } else {
        SissoSesion.limpiar();
        window.location.href = '../login/index.html';
        throw new Error('Sesion expirada. Por favor inicie sesion de nuevo.');
      }
    }
  }

  let datos = null;
  try { datos = await respuesta.json(); } catch (e) { /* respuesta sin cuerpo */ }

  if (!respuesta.ok) {
    const error = new Error((datos && datos.error) || `Error en la peticion (HTTP ${respuesta.status}).`);
    error.status = respuesta.status;
    error.datos = datos;
    throw error;
  }

  return datos;
}

/**
 * Cierra la sesion: avisa al backend para revocar el refresh token
 * y limpia todo lo guardado localmente, luego redirige al login.
 */
async function sissoCerrarSesion() {
  const refreshToken = SissoSesion.obtenerRefreshToken();
  if (refreshToken) {
    try {
      await fetch(`${SISSO_API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (err) {
      // Si el backend no responde, igual cerramos la sesion localmente.
    }
  }
  SissoSesion.limpiar();
  window.location.href = '../login/index.html';
}

/**
 * Protege una pagina: si no hay sesion activa, redirige al login
 * inmediatamente. Se llama al inicio de cada pagina que requiera
 * estar autenticado.
 */
function sissoRequerirSesion() {
  if (!SissoSesion.haySesion()) {
    window.location.href = '../login/index.html';
  }
}
