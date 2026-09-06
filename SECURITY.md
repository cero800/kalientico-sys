# Seguridad

## Reportar una vulnerabilidad

Si encuentras una vulnerabilidad de seguridad, **no abras un issue público**:
escríbenos al correo listado en el perfil del repositorio. Te responderemos lo
antes posible.

Por favor, incluye:

- Descripción del problema y versión afectada.
- Pasos para reproducirlo.
- Impacto estimado y, si es posible, una propuesta de mitigación.

## Buenas prácticas del proyecto

- Los PIN de operador se guardan en texto plano en la base local por ahora; el
  repositorio **no** almacena credenciales de ningún servicio externo.
- Toda la información sensible vive en la base de datos local
  (`panaderia.db`) dentro de los datos de la aplicación; nunca se sube al repo.
- La base de datos del negocio se respalda automáticamente una vez al día en
  `Documentos/kalientico/backups/`.
- Los binarios distribuidos **no están firmados** aún. Antes de compartir
  instaladores en producción, firma los ejecutables:

  - **Windows**: certificado Authenticode (signtool).
  - **Linux**: AppImage requiere `appimagetool` firma GPG y `zsync`; los `.deb`
    pueden firmarse con `debsigs`/`dpkg-sig`.

## Versiones soportadas

| Versión | Soporte              |
| ------- | -------------------- |
| 1.x     | Parches de seguridad |