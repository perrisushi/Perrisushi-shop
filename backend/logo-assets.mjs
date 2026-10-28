// Se devuelve un identificador de archivo local, jamás una URL arbitraria de BD.
const ids=new Set(['abeja-1','abuela-1','amparo-1','buho-1','cabra-1','cami-1','croqueta-1','esq-1','estresario-1','gato-1','panda-1','pelusa-1','perriweb1','slime-1','slime-2']);
export function logoAsset(logo){
 const canonical=String(logo?.logo_id??'').replace(/^logo-/,'');if(ids.has(canonical))return canonical;
 if(ids.has(logo?.logo_id))return logo.logo_id;
 const match=String(logo?.asset_path??'').match(/(?:^|\/)logo-([a-z0-9-]+)\.(?:png|webp)$/i);
 return match&&ids.has(match[1])?match[1]:null;
}
