// ============================================================
// SISSO - Logica de la pagina (login/index.html).
//
// N.18 (CSP estricta, hallazgos C18-02/G18-08): este codigo vivia en un
// bloque <script> en linea dentro de index.html, lo que obligaba a
// mantener script-src 'unsafe-inline'. Se movio SIN cambios de logica a
// este archivo; index.html lo carga con <script src="pagina.js">.
// ============================================================
  // Si ya hay una sesion activa, ir directamente al dashboard
  if (SissoSesion.haySesion()) {
    window.location.href = '../dashboard/index.html';
  }

  // Permitir hacer login con Enter en cualquier campo del formulario
  document.getElementById('email').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('contrasena').focus();
  });
  document.getElementById('contrasena').addEventListener('keydown', e => {
    if (e.key === 'Enter') iniciarSesion();
  });

  function alternarContrasena() {
    const campo = document.getElementById('contrasena');
    campo.type = campo.type === 'password' ? 'text' : 'password';
  }

  function mostrarError(mensaje) {
    const el = document.getElementById('error-login');
    el.textContent = mensaje;
    el.classList.add('visible');
  }

  function ocultarError() {
    document.getElementById('error-login').classList.remove('visible');
  }

  let mfaTokenPendiente = null;

  function mostrarPaso(idVisible) {
    ['paso-credenciales', 'paso-mfa', 'paso-mfa-setup'].forEach((id) => {
      document.getElementById(id).style.display = (id === idVisible) ? 'block' : 'none';
    });
  }

  async function iniciarSesion() {
    ocultarError();

    const email = document.getElementById('email').value.trim();
    const contrasena = document.getElementById('contrasena').value;
    const codigoOrganizacion = document.getElementById('codigo-organizacion').value.trim();
    const boton = document.getElementById('btn-login');

    if (!email || !contrasena) {
      mostrarError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Iniciando sesión…';

    try {
      const cuerpoPeticion = { email, password: contrasena };
      if (codigoOrganizacion) cuerpoPeticion.codigoOrganizacion = codigoOrganizacion;

      const datos = await fetch('https://sissso-backend.onrender.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cuerpoPeticion),
      }).then(async (r) => {
        const cuerpo = await r.json();
        if (!r.ok) throw Object.assign(new Error(cuerpo.error || 'Error al iniciar sesión.'), { status: r.status, codigo: cuerpo.codigo, mfaToken: cuerpo.mfaToken });
        return cuerpo;
      });

      // Si el usuario tiene MFA habilitado, el backend no entrega
      // tokens todavia: pide el segundo factor primero.
      if (datos.requiereMfa) {
        mfaTokenPendiente = datos.mfaToken;
        mostrarPaso('paso-mfa');
        document.getElementById('codigo-mfa').value = '';
        document.getElementById('codigo-mfa').focus();
        return;
      }

      SissoSesion.guardar(datos);
      window.location.href = '../dashboard/index.html';

    } catch (err) {
      // CORREGIDO (hallazgo GRAVE G5): si el rol exige MFA obligatorio
      // y todavia no esta configurado, el backend responde 403 con
      // codigo MFA_OBLIGATORIO_NO_CONFIGURADO + un mfaToken. En vez de
      // solo mostrar el error, llevamos al usuario directo a
      // configurar su MFA (no puede acceder de otra forma).
      if (err.codigo === 'MFA_OBLIGATORIO_NO_CONFIGURADO' && err.mfaToken) {
        mfaTokenPendiente = err.mfaToken;
        await iniciarConfiguracionMfaObligatoria();
        return;
      }
      // CORREGIDO (hallazgo CRITICO C1): el mismo correo existe en
      // mas de una organizacion y la contraseña es valida en ambas.
      // Mostramos el campo de codigo de organizacion para que el
      // usuario pueda desambiguar, en vez de fallar sin explicacion.
      if (err.codigo === 'ORGANIZACION_AMBIGUA') {
        document.getElementById('campo-codigo-organizacion').style.display = 'block';
        document.getElementById('codigo-organizacion').focus();
        mostrarError(err.message || 'Hay más de una cuenta con este correo. Ingresa el código de tu organización.');
        return;
      }
      let mensaje = err.message || 'Error al conectar con el servidor.';
      if (err.status === 401) mensaje = 'Correo o contraseña incorrectos.';
      if (err.status === 423) mensaje = 'Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta en unos minutos.';
      mostrarError(mensaje);
    } finally {
      boton.disabled = false;
      boton.textContent = 'Iniciar sesión';
    }
  }

  async function iniciarConfiguracionMfaObligatoria() {
    ocultarError();
    try {
      const datos = await fetch('https://sissso-backend.onrender.com/api/auth/mfa/iniciar-configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: mfaTokenPendiente }),
      }).then(async (r) => {
        const cuerpo = await r.json();
        if (!r.ok) throw Object.assign(new Error(cuerpo.error || 'No se pudo iniciar la configuración de MFA.'), { status: r.status });
        return cuerpo;
      });

      document.getElementById('mfa-setup-qr').src = datos.qrCodeDataUrl;
      mostrarPaso('paso-mfa-setup');
      document.getElementById('codigo-mfa-setup').value = '';
      document.getElementById('codigo-mfa-setup').focus();
    } catch (err) {
      mostrarError(err.message || 'No se pudo iniciar la configuración de MFA. Vuelve a ingresar tu contraseña.');
      volverACredenciales();
    }
  }

  async function confirmarMfaSetupObligatorio() {
    ocultarError();
    const codigo = document.getElementById('codigo-mfa-setup').value.trim();
    const boton = document.getElementById('btn-confirmar-mfa-setup');

    if (!codigo || codigo.length !== 6) {
      mostrarError('Ingresa el código de 6 dígitos.');
      return;
    }
    if (!mfaTokenPendiente) {
      mostrarError('La sesión de configuración expiró. Vuelve a ingresar tu contraseña.');
      volverACredenciales();
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Activando…';

    try {
      await fetch('https://sissso-backend.onrender.com/api/auth/mfa/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: mfaTokenPendiente, codigo }),
      }).then(async (r) => {
        const cuerpo = await r.json();
        if (!r.ok) throw Object.assign(new Error(cuerpo.error || 'Código incorrecto.'), { status: r.status });
        return cuerpo;
      });

      // MFA activado. No abrimos sesion aqui: por seguridad, el usuario
      // vuelve a ingresar su contrasena y ahora sí completara el
      // segundo paso normal (paso-mfa) con su app ya configurada.
      mfaTokenPendiente = null;
      mostrarPaso('paso-credenciales');
      document.getElementById('contrasena').value = '';
      mostrarError('Verificación en 2 pasos activada. Vuelve a iniciar sesión con tu contraseña y el código de tu app.');
      document.getElementById('email').focus();
    } catch (err) {
      mostrarError(err.message || 'Código incorrecto. Verifica la hora de tu dispositivo e intenta de nuevo.');
    } finally {
      boton.disabled = false;
      boton.textContent = 'Activar y continuar';
    }
  }

  function volverACredenciales() {
    mfaTokenPendiente = null;
    ocultarError();
    mostrarPaso('paso-credenciales');
    document.getElementById('contrasena').value = '';
  }

  async function verificarMfa() {
    ocultarError();
    const codigo = document.getElementById('codigo-mfa').value.trim();
    const boton = document.getElementById('btn-verificar-mfa');

    if (!codigo || codigo.length !== 6) {
      mostrarError('Ingresa el código de 6 dígitos.');
      return;
    }
    if (!mfaTokenPendiente) {
      mostrarError('La sesión de verificación expiró. Vuelve a ingresar tu contraseña.');
      volverACredenciales();
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Verificando…';

    try {
      const datos = await fetch('https://sissso-backend.onrender.com/api/auth/mfa/verificar-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mfaToken: mfaTokenPendiente, codigo }),
      }).then(async (r) => {
        const cuerpo = await r.json();
        if (!r.ok) throw Object.assign(new Error(cuerpo.error || 'Código incorrecto.'), { status: r.status });
        return cuerpo;
      });

      SissoSesion.guardar(datos);
      window.location.href = '../dashboard/index.html';

    } catch (err) {
      mostrarError(err.message || 'Código incorrecto.');
    } finally {
      boton.disabled = false;
      boton.textContent = 'Verificar';
    }
  }

  document.getElementById('codigo-mfa').addEventListener('keydown', e => {
    if (e.key === 'Enter') verificarMfa();
  });
  document.getElementById('codigo-mfa-setup').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmarMfaSetupObligatorio();
  });
