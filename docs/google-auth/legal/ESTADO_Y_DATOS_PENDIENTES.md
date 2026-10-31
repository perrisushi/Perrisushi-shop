# Estado de revisión legal de PerriWeb

Fecha de preparación: 30 de octubre de 2026. Documentos privados, sin publicación ni aprobación final. No se ha ejecutado SQL, accedido a producción ni activado Google.

## Hechos confirmados por el titular

- Los sorteos son reales y los organiza durante sus directos de Twitch.
- En relación con los sorteos, PerriWeb únicamente permite obtener, comprar con recursos virtuales y gestionar participaciones.
- PerriWeb no entrega premios. El organizador contacta personalmente con los ganadores y gestiona las entregas mediante Discord u otros medios externos.
- La comunidad es internacional, principalmente de España y Latinoamérica; no se han fijado por ello restricciones territoriales específicas de cada sorteo.
- No se compra absolutamente nada con dinero real dentro de PerriWeb.
- La economía utiliza monedas y recursos virtuales; los premios de los sorteos son reales.

Estas respuestas quedan incorporadas. No solicitar nuevamente confirmación de ellas.

## Comprobaciones locales y límites

- backend/repository.mjs: nick, hash de acceso y estado activo; perfil, Perrilogos, títulos, logros y karma; inventario y PC; historial; notificaciones; boletos y claves canjeadas; sesiones con caducidad.
- backend/google-auth.mjs: identidad Supabase Auth asociada a nick; registro de aceptación de la versión legal; verificador temporal de OAuth. Google se procesa en servidor; no se solicita Gmail, Drive o contactos.
- src/main.js: identificadores de operaciones en sessionStorage para recuperar su resultado.
- games/original/perriduelos-app/app.js e index-production.html: almacenamiento local funcional. No afirmar que no se utiliza localStorage.
- backend/economy.mjs: los boletos pueden obtenerse mediante una operación con precio en PC y límite configurado. No convertir esos parámetros variables en reglas universales ni afirmar que cada boleto de inventario participa automáticamente en cualquier sorteo.
- El titular ha confirmado que el sorteo se realiza en Twitch y que el contacto y la entrega son personales por Discord u otros medios externos. Quedan por concretar para cada evento la selección, los datos adicionales, el canal oficial y los plazos. No son funcionalidades de entrega de la web.
- Supabase y Railway están integrados. La existencia del proxy Cloudflare en el repositorio no acredita que esté contratado/activo ni permite conocer regiones, contratos o plazos reales de registros y copias. No se han inspeccionado esos servicios.
- No se han inventado plazos de borrado, edad mínima, autoridad, domicilio, país, licencias de recursos gráficos, permisos de imagen o derechos de conversión monetaria.

## Falta imprescindible para cerrar las dos páginas

Identidad real y correo de contacto del responsable. La dirección profesional y, en su caso, el NIF se analizan por separado según la aplicabilidad de la LSSI; no son una exigencia de Google OAuth. No se pide un DNI ni un domicilio particular de forma automática. Los demás apartados están redactados en las plantillas y en DATOS_PARA_GENERAR.json según la información conocida. No se han inventado datos de identidad ni registrado una aprobación ficticia.

## Fuentes consultadas para preparar los textos

- AEPD, derecho de información: https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos/derecho-de-informacion
- Reglamento (UE) 2016/679, transparencia, información y derechos: https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A32016R0679
- Twitch, condiciones, apartado de promociones: https://www.twitch.tv/p/terms-of-service
- DGOJ, combinaciones aleatorias promocionales: https://www.ordenacionjuego.es/operadores-juego/rifa-juego-ocasional/combinaciones-aleatorias-fines-publicitarios-o-promocionales

No se ha calificado automáticamente el sorteo como una modalidad legal concreta ni declarado una exención fiscal o administrativa. La residencia, el ámbito territorial y la mecánica del evento pueden cambiar el tratamiento aplicable.

## Archivos y aprobación

privacidad.html y condiciones.html son borradores con data-legal-draft y tres secciones data-legal-required cada uno. El generador mantiene la exigencia de información completa y aprobación expresa. No generar una falsa aprobación para desbloquear Google.

BASES_SORTEOS.md es una plantilla reutilizable privada; no está conectada a ninguna ruta ni a un sorteo activo. Sus campos deben completarse para cada evento.

Solo tras recibir los datos y la aprobación del titular se prepararán los HTML finales con las herramientas locales. El titular no necesita utilizar una terminal. Ningún documento se incluye por estos cambios en la compilación pública.
