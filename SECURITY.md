# Seguridad del proyecto

## Excepción temporal: React Router

- Dependencias actuales: `react-router` y `react-router-dom` 7.18.2.
- Aviso: `GHSA-qwww-vcr4-c8h2`, relacionado con CSRF en rutas experimentales de React Server Components (RSC).
- Evaluación: el sistema USPG utiliza una aplicación SPA con `BrowserRouter`, `Routes` y `Route`. No utiliza RSC, acciones de React Router ni su modo framework.
- Riesgo actual: bajo y no explotable mediante la arquitectura implementada, siempre que no se habiliten las APIs RSC afectadas.
- Decisión: no ejecutar `npm audit fix --force`, porque instalaría React Router 8 y puede introducir incompatibilidades.

## Requisito antes del despliegue

1. Crear una rama o respaldo de actualización.
2. Actualizar juntos `react-router` y `react-router-dom` a una versión corregida igual o posterior a 8.3.0.
3. Ejecutar `npm run lint`, `npm run build` y `npm audit --omit=dev`.
4. Probar inicio y cierre de sesión, redirecciones por rol, menú lateral y todas las rutas protegidas.
5. Publicar únicamente si no existen regresiones funcionales ni alertas aplicables.

No se deben incorporar React Server Components ni acciones de React Router mientras continúe instalada la versión 7.18.2.
