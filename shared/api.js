// ============================================================
// SISSO - Modulo compartido de API.
//
// Centraliza: la URL del backend, el manejo de sesion (guardar/leer/
// borrar el token), y una funcion fetch() que ya agrega el header
// de autenticacion y reintenta una vez con el refresh token si el
// access token expiro.
//
// Por que un solo archivo: si el backend cambia de URL, o si la
// logica de sesion necesita un ajuste, se edita aqui UNA vez y
// todos los modulos (reba, rula, aptitud, etc.) quedan actualizados
// automaticamente, porque todos importan este archivo.
//
// CORREGIDO tras auditoria de seguridad (hallazgo GRAVE): los
// tokens (access y refresh) se guardaban en localStorage. Ahora se
// guardan en sessionStorage.
//
// Por que este cambio y que NO resuelve:
//   - localStorage persiste indefinidamente (sobrevive cerrar el
//     navegador), asi que un XSS que robe el refresh token da al
//     atacante acceso indefinido hasta que se revoque manualmente.
//     sessionStorage se borra al cerrar la pestaña/navegador, asi
//     que acorta la ventana de un robo. Es una mitigacion, no una
//     solucion completa: sessionStorage sigue siendo legible por
//     cualquier JavaScript que corra en la pagina (un XSS activo
//     durante la sesion abierta igual puede robar el token).
//   - La proteccion real contra robo de tokens vía XSS es que el
//     refresh token viva en una cookie HttpOnly + Secure + SameSite,
//     invisible para JavaScript incluso con un XSS activo. El
//     backend ya tiene `credentials: true` en CORS (ver src/index.js),
//     lo que sugiere que se penso dejar esa puerta abierta para una
//     migracion futura, pero login/refrescar/logout todavia
//     devuelven los tokens en el cuerpo JSON en vez de asentarlos
//     como cookies. Migrar a cookies HttpOnly es el siguiente paso
//     recomendado y requiere cambios coordinados en el backend
//     (Set-Cookie en authController.js) y en este archivo (usar
//     `credentials: 'include'` y dejar de manejar el token a mano),
//     por lo que no se hizo en esta correccion puntual.
// ============================================================

// ------------------------------------------------------------
// URL del backend. Unico lugar de todo el frontend donde esto
// se escribe. Si el backend cambia de direccion, se edita aqui.
// ------------------------------------------------------------
const SISSO_API_BASE = 'https://sissso-backend.onrender.com/api';

// Claves usadas en sessionStorage. Prefijadas con "sisso_" para no
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
    sessionStorage.setItem(CLAVE_ACCESS_TOKEN, datos.accessToken);
    sessionStorage.setItem(CLAVE_REFRESH_TOKEN, datos.refreshToken);
    sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
  },

  /**
   * Actualiza los tokens tras un refresh exitoso. Guarda tanto el
   * access token como el refresh token nuevos: desde la correccion
   * de seguridad de rotacion de refresh tokens (backend), cada
   * refresh invalida el token anterior y emite uno nuevo, asi que
   * el frontend SIEMPRE debe reemplazar el refresh token guardado o
   * la siguiente renovacion fallara (se interpretaria como reuso).
   */
  actualizarTokens(nuevoAccessToken, nuevoRefreshToken) {
    sessionStorage.setItem(CLAVE_ACCESS_TOKEN, nuevoAccessToken);
    if (nuevoRefreshToken) sessionStorage.setItem(CLAVE_REFRESH_TOKEN, nuevoRefreshToken);
  },

  obtenerAccessToken() {
    return sessionStorage.getItem(CLAVE_ACCESS_TOKEN);
  },

  obtenerRefreshToken() {
    return sessionStorage.getItem(CLAVE_REFRESH_TOKEN);
  },

  /** @returns {{id:string, email:string, nombreCompleto:string, rol:string, organizacion:object}|null} */
  obtenerUsuario() {
    const crudo = sessionStorage.getItem(CLAVE_USUARIO);
    return crudo ? JSON.parse(crudo) : null;
  },

  haySesion() {
    return !!this.obtenerAccessToken();
  },

  limpiar() {
    sessionStorage.removeItem(CLAVE_ACCESS_TOKEN);
    sessionStorage.removeItem(CLAVE_REFRESH_TOKEN);
    sessionStorage.removeItem(CLAVE_USUARIO);
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
    SissoSesion.actualizarTokens(datos.accessToken, datos.refreshToken);
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
 * Descarga un archivo binario (ej: un PDF) del backend, con el
 * mismo manejo de autenticacion/refresh que sissoFetch(), pero
 * devolviendo un Blob en vez de intentar parsear JSON (la
 * respuesta de un PDF no es JSON, sissoFetch() rompería aqui).
 *
 * @param {string} ruta - ej: '/consentimientos/abc-123/pdf'
 * @returns {Promise<Blob>}
 */
async function sissoDescargarArchivo(ruta) {
  const construirHeaders = () => {
    const headers = {};
    const token = SissoSesion.obtenerAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  let respuesta = await fetch(`${SISSO_API_BASE}${ruta}`, { headers: construirHeaders() });

  if (respuesta.status === 401) {
    const renovado = await intentarRefrescarToken();
    if (renovado) {
      respuesta = await fetch(`${SISSO_API_BASE}${ruta}`, { headers: construirHeaders() });
    } else {
      SissoSesion.limpiar();
      window.location.href = '../login/index.html';
      throw new Error('Sesion expirada. Por favor inicie sesion de nuevo.');
    }
  }

  if (!respuesta.ok) {
    let mensaje = `Error al descargar el archivo (HTTP ${respuesta.status}).`;
    try { const datos = await respuesta.json(); if (datos && datos.error) mensaje = datos.error; } catch (e) { /* sin cuerpo JSON */ }
    throw new Error(mensaje);
  }

  return respuesta.blob();
}

/**
 * Abre un Blob (ej: el PDF que devuelve sissoDescargarArchivo) en
 * una nueva pestaña del navegador.
 */
function sissoAbrirBlobEnNuevaPestana(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Liberamos el object URL despues de un momento; el navegador ya
  // tuvo tiempo de cargarlo en la nueva pestaña.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
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
