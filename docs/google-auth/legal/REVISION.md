# Datos legales que debe aportar y aprobar el responsable

Los archivos privacidad.html y condiciones.html de esta carpeta son plantillas privadas; no se incluyen en dist ni se publican directamente.

Usar el asistente local:
```powershell
npm run legal:prepare -- --interactive
```

Preguntará:
1. Nombre completo o razón social del responsable.
2. Dirección.
3. Correo de contacto y derechos.
4. Finalidades y bases jurídicas aprobadas.
5. Proveedores reales, ubicación y transferencias/garantías aplicables.
6. Conservación de cuentas, historiales, registros y copias.
7. Derechos, bajas y autoridad competente.
8. Ámbito y menores.
9. Reglas de PC, monedas, objetos, sorteos y canjes.
10. Incidencias, moderación, suspensión y cierre.
11. Otras condiciones: contenidos, disponibilidad, responsabilidad, cambios y conflictos.

No se inventan esos datos ni se sustituyen por respuestas automáticas. El asistente requiere aprobación explícita antes de generar los HTML; después se deben abrir y revisar antes de activar su publicación.

El resultado se guarda en backend/legal-reviewed. No contiene credenciales ni contraseñas y se debe incluir en el repositorio únicamente una vez revisado para que viaje con el código a Railway.

Si una versión ya existe, no se sobrescribe. Puede prepararse otra con --output backend/legal-reviewed-v2 y configurar ese directorio al publicarla.

Los apartados técnicos se han redactado según las funciones reales: identidad/nick, perfiles, inventario, progresos, historial, notificaciones, cookies, operaciones, Google/Supabase Auth y diagnósticos mínimos. Confirmar los proveedores efectivamente contratados y su régimen de tratamiento: tener una integración de Cloudflare no demuestra que esté usándose en ese despliegue.

Guardar las versiones aprobadas: el alta nueva conserva su huella y fecha de aceptación. No poner un correo, domicilio, plazo, base jurídica o jurisdicción inventados solo para habilitar el registro.
