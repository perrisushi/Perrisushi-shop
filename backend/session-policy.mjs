// Una sola política para contraseña, Google y renovación de la cookie propia.
export const SESSION_TTL_MS=365*24*3600_000;
export const SESSION_RENEW_INTERVAL_MS=24*3600_000;
export function sessionNeedsRenewal(expiresAt,now,ttl=SESSION_TTL_MS){
 return expiresAt>now&&expiresAt-now<=ttl-Math.min(SESSION_RENEW_INTERVAL_MS,ttl/2);
}
