# Entrar con Google

RAX usa el proveedor Google de Supabase Auth. El botón está en `/entrar` (modo entrar y modo registro).
La primera vez que alguien entra con Google se crea su cuenta y su perfil (trigger `handle_new_user`, con el nombre de Google);
el regreso pasa por `/auth/callback` y termina en `/bienvenida`, que muestra el onboarding por rol o manda a la casa de cada rol.

## Configuración (una sola vez)

1. **Google Cloud Console** → APIs y servicios → Pantalla de consentimiento de OAuth: tipo *Externo*, nombre "RAX", correo de soporte. Publicala (o agregá usuarios de prueba).
2. **Credenciales** → Crear credenciales → ID de cliente de OAuth → *Aplicación web*.
   - Orígenes de JavaScript autorizados: `https://rax-red.vercel.app` y `http://localhost:3000`.
   - URI de redireccionamiento autorizado: `https://wsloyabteyfjopnqrhpe.supabase.co/auth/v1/callback`.
3. **Supabase** → Authentication → Sign In / Providers → Google: activarlo y pegar el Client ID y el Client Secret.
4. **Supabase** → Authentication → URL Configuration:
   - Site URL: `https://rax-red.vercel.app`
   - Redirect URLs: `https://rax-red.vercel.app/auth/callback**`, `http://localhost:3000/auth/callback**`
     y, para las vistas previas de Vercel, `https://rax-*-josuechaves01s-projects.vercel.app/auth/callback**`.

No hace falta ninguna variable de entorno nueva en Vercel: el Client Secret vive solo en Supabase.
