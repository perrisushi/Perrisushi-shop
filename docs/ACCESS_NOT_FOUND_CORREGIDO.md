# Causa de la búsqueda fallida y comprobación de solo lectura

## Causa demostrada en el código

`backend/repository.mjs` consultaba `public.shop_access` con columnas `nick,code_hash,active`, pero añadía comillas al valor de los filtros escalares:

```text
Antes: nick=eq."Perrisushi"
Antes: nick=ilike."perrisushi"
Ahora: nick=eq.Perrisushi
Ahora: nick=ilike.perrisushi
```

En un filtro simple, las comillas son parte del valor. Se buscaba el nick con comillas añadidas, no la cuenta original. El backend antiguo usaba `eq.${normalizedNick}` e `ilike.${normalizedNick}`, sin esa envoltura.

La misma función añadía comillas a tokens de sesiones, cursores, identificadores y el propietario de lecturas privadas. Se corrige el constructor completo, para no superar el primer paso y fallar inmediatamente al recuperar la sesión, perfil o inventario. Se fija explícitamente el esquema public y se retira limit de escrituras individuales filtradas, para no provocar un error de límite sin orden al cerrar sesión.

La codificación segura sigue siendo URLSearchParams; un ampersand, comilla real o apóstrofo dentro del nick se conserva como dato, sin introducir parámetros adicionales. La búsqueda recorta espacios de entrada y compara sin distinguir mayúsculas. No recorta ni reescribe los identificadores guardados. Los comodines %, _ y * de nombres reales se tratan literalmente; se rechaza una coincidencia ambigua.

Referencias técnicas: [filtros de PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html), [explicación del mantenedor sobre comillas en operadores simples](https://github.com/PostgREST/postgrest/issues/1943). No se ha accedido al repositorio del usuario ni a ningún servicio real.

## Por qué no lo detectaron las pruebas anteriores

El transporte PostgreSQL local quitaba las comillas artificialmente antes de comparar. Por eso aceptaba consultas que no eran equivalentes al filtro simple enviado a PostgREST. Se ha retirado esa interpretación y añadido una regresión independiente: con una fila existente en PostgreSQL, la forma anterior produce 401/access_not_found; la consulta corregida produce 200, mantiene el nick canónico y permite crear, recuperar y revocar la sesión. Las cuentas de esta prueba existen exclusivamente en memoria.

La causa está demostrada en el adaptador y reproducida localmente. El log real aportado es compatible con ella, pero **la reparación del acceso real aún requiere desplegar y comprobar**. No se han leído las variables privadas de Railway ni consultado las tablas reales.

## Verificación manual en Supabase: exclusivamente lectura

1. Abrir el proyecto que contiene las cuentas originales.
2. Abrir `sql/diagnostico-access-lectura.sql`, sustituir TU_USUARIO por el nick original y ejecutarlo. No introducir la contraseña. Si el nick contiene un apóstrofo, duplicarlo en el literal SQL.
3. El script ejecuta BEGIN READ ONLY, SELECT y ROLLBACK. No crea funciones ni cambia tablas/datos. No devuelve hashes ni contraseñas.
4. Si el nick coincide exactamente, se espera `access_exact=1`, `access_with_added_quotes=0`, `access_player_link=1`. Si cambia la capitalización, revisar `access_case_insensitive=1`. Si solo coincide `access_trimmed`, hay espacios almacenados; no se corrigen automáticamente ni se reasignan identidades.

## Verificación REST y proyecto sin escribir datos

Ejecutar manualmente `npm run check:auth` con las variables privadas del servicio y PW2_VERIFY_NICK/PW2_VERIFY_PASSWORD temporales de una cuenta propia, fuera del repositorio. El comprobador no crea sesiones: usa solo GET y transacciones PostgreSQL READ ONLY.

Se añaden sondas REST de lectura de la consulta anterior y la corregida. `finding=quoted_filter_miss_reproduced` confirma que la cuenta es visible mediante el filtro correcto y no con la envoltura anterior. Para un nick escrito con la capitalización original, se espera `correctExactFound=true`, `oldQuotedExactFound=false`, `oldQuotedCaseFound=false`.

`connections.projectMatch` compara la referencia pública con la de DATABASE_URL, tanto para conexión directa como para pooler. `same` indica coincidencia de referencias reconocidas; `different` detecta proyectos distintos; `unknown` exige comparar manualmente las configuraciones personalizadas. No imprime URLs, referencias, usuarios PostgreSQL ni secretos. El arranque registra también este resultado bajo `auth_connection_configuration`.

`credentialRoleHint=anon` o `publishable_key` identifica una configuración inadecuada para la lectura privada del backend; una clave JWT solo se inspecciona como pista, no se considera validada por decodificarla. No se cambian permisos ni se desactiva RLS para solucionarlo.

## Cómo distinguir otras causas

- Respuesta REST no exitosa: 503 y diagnóstico de consulta/permiso; por ejemplo, código 42501. No se convierte en contraseña incorrecta.
- REST 200 vacío y SQL administrativo encuentra la cuenta: discrepancia de visibilidad/configuración. Después de corregir el filtro y comprobar el proyecto, revisar la clave de servidor y RLS con el propietario.
- REST y SQL administrativo no encuentran el nick: no hay coincidencia bajo esa comparación en el proyecto comprobado. Revisar espacios/capitalización y que sea el proyecto antiguo.
- Ambos encuentran la misma cuenta pero la contraseña no coincide: ese es un fallo distinto y mantiene el diagnóstico password_mismatch.

Un resultado REST vacío **no demuestra por sí solo que el usuario no exista**: RLS puede ocultar filas ([documentación de Supabase](https://supabase.com/kb/troubleshooting/why-is-my-select-returning-an-empty-data-array-and-i-have-data-in-the-table-xvOPgx)). No se han modificado cuentas, contraseñas, inventarios, progresos ni tablas.

## Publicación

Commit y Push a la rama existente; no necesita una migración. El SQL adjunto es exclusivamente diagnóstico opcional de lectura. Tras desplegar, verificar login de una cuenta original, datos personales, recarga con sesión y logout. No dar por resuelto el incidente remoto hasta completar esa comprobación.
