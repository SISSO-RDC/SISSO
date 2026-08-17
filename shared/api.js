// ============================================================
// SISSO - Modulo compartido de API.
//
// Centraliza: la URL del backend, el manejo de sesion (guardar/leer/
// borrar el access token), y una funcion fetch() que ya agrega el
// header de autenticacion y reintenta una vez si el access token
// expiro.
//
// Por que un solo archivo: si el backend cambia de URL, o si la
// logica de sesion necesita un ajuste, se edita aqui UNA vez y
// todos los modulos (reba, rula, aptitud, etc.) quedan actualizados
// automaticamente, porque todos importan este archivo.
//
// CORREGIDO tras auditoria de seguridad (hallazgo GRAVE G4, version
// 2): el refresh token YA NO pasa por JavaScript en absoluto. Antes
// vivia en sessionStorage (una mitigacion parcial que dejamos en la
// correccion anterior); ahora el backend lo entrega como cookie
// HttpOnly (ver authController.js: completarLogin/refrescar/logout),
// asi que ni siquiera un XSS activo en esta pagina puede leerlo. El
// navegador la adjunta solo el mismo, automaticamente, en las 3
// peticiones que la necesitan.
//
// Esto cambia el contrato con el backend: login/verificar-mfa/
// refrescar ya NO devuelven `refreshToken` en el JSON, y refrescar/
// logout ya NO necesitan mandarlo en el body. Todas las llamadas
// fetch que hablan con el backend deben incluir `credentials:
// 'include'` para que el navegador mande/reciba esa cookie (las
// peticiones sin esto simplemente no veran la cookie, con o sin
// error visible, asi que es facil de olvidar en un fetch nuevo que
// se agregue mas adelante — ver sissoFetch/sissoDescargarArchivo
// abajo, que ya lo incluyen por defecto).
//
// El access token (de corta duracion, 15 min) sigue guardandose en
// sessionStorage: es una perdida de sesion aceptable si se cierra la
// pestaña (se renueva solo con la cookie mientras dure el refresh
// token), y mantenerlo ahi permite que sissoFetch() lo agregue como
// header Authorization en cada peticion sin depender de que la
// cookie httpOnly (invisible para JS, a proposito) exista todavia.
// ============================================================

// ------------------------------------------------------------
// URL del backend. Unico lugar de todo el frontend donde esto
// se escribe. Si el backend cambia de direccion, se edita aqui.
// ------------------------------------------------------------
const SISSO_API_BASE = 'https://sissso-backend.onrender.com/api';

// Claves usadas en sessionStorage. Prefijadas con "sisso_" para no
// chocar con nada mas que pueda existir en el navegador. Ya NO hay
// clave de refresh token: vive exclusivamente en la cookie HttpOnly
// que administra el backend.
const CLAVE_ACCESS_TOKEN = 'sisso_access_token';
const CLAVE_USUARIO = 'sisso_usuario';

// ------------------------------------------------------------
// Manejo de sesion
// ------------------------------------------------------------
const SissoSesion = {
  /**
   * Guarda la sesion completa tras un login exitoso.
   * @param {{accessToken: string, usuario: object}} datos
   */
  guardar(datos) {
    sessionStorage.setItem(CLAVE_ACCESS_TOKEN, datos.accessToken);
    sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
  },

  /**
   * Actualiza el access token tras un refresh exitoso. El refresh
   * token rotado ya quedo asentado como cookie por el propio
   * backend en la respuesta; aqui no hay nada que hacer con el.
   */
  actualizarAccessToken(nuevoAccessToken) {
    sessionStorage.setItem(CLAVE_ACCESS_TOKEN, nuevoAccessToken);
  },

  obtenerAccessToken() {
    return sessionStorage.getItem(CLAVE_ACCESS_TOKEN);
  },

  /** @returns {{id:string, email:string, nombreCompleto:string, rol:string, organizacion:object}|null} */
  obtenerUsuario() {
    const crudo = sessionStorage.getItem(CLAVE_USUARIO);
    return crudo ? JSON.parse(crudo) : null;
  },

  haySesion() {
    return !!this.obtenerAccessToken();
  },

  /**
   * Actualiza solo el logo de la organizacion en la sesion en cache,
   * para que el sidebar lo refleje de inmediato tras subir/cambiar
   * el logo desde Mi Empresa, sin tener que cerrar sesion y volver
   * a entrar para verlo.
   */
  actualizarLogoOrganizacion(nuevoLogoUrl) {
    const usuario = this.obtenerUsuario();
    if (!usuario) return;
    usuario.organizacion = usuario.organizacion || {};
    usuario.organizacion.logoUrl = nuevoLogoUrl;
    sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  },

  limpiar() {
    sessionStorage.removeItem(CLAVE_ACCESS_TOKEN);
    sessionStorage.removeItem(CLAVE_USUARIO);
  },
};

// ------------------------------------------------------------
// Cliente HTTP con autenticacion automatica.
// ------------------------------------------------------------

/**
 * Intenta renovar el access token usando el refresh token, que el
 * navegador manda solo (cookie HttpOnly) gracias a `credentials:
 * 'include'`. Ya no se lee ni se manda ningun token a mano aqui.
 * @returns {Promise<boolean>} true si se renovo con exito.
 */
async function intentarRefrescarToken() {
  try {
    const respuesta = await fetch(`${SISSO_API_BASE}/auth/refrescar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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
    credentials: 'include',
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
          credentials: 'include',
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

  let respuesta = await fetch(`${SISSO_API_BASE}${ruta}`, { headers: construirHeaders(), credentials: 'include' });

  if (respuesta.status === 401) {
    const renovado = await intentarRefrescarToken();
    if (renovado) {
      respuesta = await fetch(`${SISSO_API_BASE}${ruta}`, { headers: construirHeaders(), credentials: 'include' });
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
 * (que el navegador manda solo via cookie) y limpia todo lo
 * guardado localmente, luego redirige al login.
 */
async function sissoCerrarSesion() {
  try {
    await fetch(`${SISSO_API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  } catch (err) {
    // Si el backend no responde, igual cerramos la sesion localmente.
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
