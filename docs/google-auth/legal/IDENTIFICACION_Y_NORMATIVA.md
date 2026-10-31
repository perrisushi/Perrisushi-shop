# Datos de identificación: Google OAuth, RGPD y LSSI

Comprobación de fuentes oficiales: 30 de octubre de 2026. Nota privada; no se publica como política ni sustituye la información del responsable.

## Google OAuth

La configuración de marca pide nombre de aplicación, correo de asistencia y enlaces apropiados. Las políticas para producción requieren página pública con descripción funcional y enlaces a privacidad y condiciones, en dominio verificado. Esos requisitos no incluyen publicar el DNI ni el domicilio particular del desarrollador. No confundir OAuth web con la verificación de identidad de Google Play.

Fuente: https://developers.google.com/identity/protocols/oauth2/policies
Fuente: https://support.google.com/cloud/answer/15549049?hl=en

## Protección de datos

El artículo 13.1.a del RGPD exige identidad y datos de contacto del responsable. No establece una obligación general de publicar el DNI ni exige que los datos de contacto sean el domicilio particular. El nick comercial no debe sustituir sin más a la identidad real del responsable. Debe existir un medio efectivo de contacto y ejercicio de derechos. No se declara que un correo satisfaga cualquier obligación de cualquier normativa.

Fuente: https://www.boe.es/buscar/doc.php?id=DOUE-L-2016-80807

## LSSI española, si resulta aplicable

La gratuidad para los usuarios no excluye por sí sola la LSSI: su anexo incluye servicios gratuitos que constituyan actividad económica para el prestador. No se presume que PerriWeb la realice ni que esté exenta solo por no cobrar. La vinculación con un canal monetizado, publicidad, patrocinios u otras vías de ingresos puede ser relevante; no se ha inspeccionado ni afirmado que esas vías existan.

Cuando procede el artículo 10, exige identidad, dirección en los términos previstos, correo y NIF, entre otros datos según el caso. No exige publicar una fotografía del DNI. Para una persona física, el NIF puede coincidir con el número del DNI: no presentarlo como dato distinto que eluda esa obligación.

Una dirección profesional puede ser alternativa cuando corresponda a un domicilio o establecimiento real admitido por el artículo 10. No afirmar que cualquier apartado postal, buzón virtual o dirección prestada sustituya válidamente al domicilio o establecimiento.

Fuente: https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10
Fuente: https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#an

## Consecuencia en el proyecto

El generador local requiere identidad y correo reales para generar documentos aprobados, pero permite omitir direccion. No existe campo de DNI ni se introduce uno. La ausencia de dirección en el generador no certifica la inaplicabilidad de la LSSI: es una separación entre datos técnicos y decisión jurídica.

No se publican documentos incompletos, ni se sustituye una identidad por datos ficticios. Las marcas de borrador y la aprobación siguen protegiendo la publicación. SQL, sesiones, cuentas, inventarios y economía no cambian.
