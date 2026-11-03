import {PERRILOGO_CATALOG,cosmeticById,DEFAULT_BACKGROUND,DEFAULT_FRAME,ADMIN_LOGO} from '../src/services/perrilogo-catalog.js';
import {fail} from './moderation.mjs';
export const saleCosmetics=PERRILOGO_CATALOG.filter(i=>i.origin==='shop');
export const adminLogoAllowed=(nick,isAdmin)=>nick==='Perrisushi'&&isAdmin===true;
export function normalizedComposition(profile={},isAdmin=false){
 const c=profile.cosmetics??{},owns={background:c.ownedBackgroundIds??[],frame:c.ownedFrameIds??[],logo:profile.owned_logo_ids??[]};
 const valid=(id,layer)=>cosmeticById(id)?.layer===layer&&cosmeticById(id)?.active&&owns[layer].includes(id)&&(id!==ADMIN_LOGO||adminLogoAllowed(profile.nick,isAdmin));
 return {background:valid(c.selectedBackgroundId,'background')?c.selectedBackgroundId:DEFAULT_BACKGROUND,logo:valid(profile.selected_logo_id,'logo')?profile.selected_logo_id:'logo-pelusa-1',frame:valid(c.selectedFrameId,'frame')?c.selectedFrameId:DEFAULT_FRAME};
}
export async function cosmeticState(c,nick){
 const p=(await c.query('SELECT p.*,a.is_admin FROM public.shop_profiles p JOIN public.shop_access a ON a.nick=p.nick WHERE p.nick=$1',[nick])).rows[0];if(!p)fail(409,'inventory_missing');
 const state=p.cosmetics??{};const owned={background:state.ownedBackgroundIds??[],logo:p.owned_logo_ids??[],frame:state.ownedFrameIds??[]};
 return {enabled:true,selected:normalizedComposition(p,p.is_admin),owned,items:PERRILOGO_CATALOG.filter(i=>i.active&&owned[i.layer].includes(i.id)&&(i.id!==ADMIN_LOGO||adminLogoAllowed(nick,p.is_admin)))};
}
export async function equipCosmetic(c,nick,body){
 if(!body||Object.keys(body).sort().join(',')!=='id,layer'||!['background','logo','frame'].includes(body.layer)||typeof body.id!=='string')fail(400,'invalid_request');
 const item=cosmeticById(body.id);if(!item?.active||item.layer!==body.layer)fail(403,'cosmetic_not_owned');
 const p=(await c.query('SELECT p.*,a.is_admin FROM public.shop_profiles p JOIN public.shop_access a ON a.nick=p.nick WHERE p.nick=$1 FOR UPDATE OF p',[nick])).rows[0];if(!p)fail(409,'inventory_missing');
 if(body.id===ADMIN_LOGO&&!adminLogoAllowed(nick,p.is_admin))fail(403,'exclusive_cosmetic');
 const key=body.layer==='background'?'ownedBackgroundIds':'ownedFrameIds',owned=body.layer==='logo'?p.owned_logo_ids:p.cosmetics?.[key];if(!Array.isArray(owned)||!owned.includes(body.id))fail(403,'cosmetic_not_owned');
 if(body.layer==='logo'){
  await c.query('UPDATE public.shop_profiles SET selected_logo_id=$1,updated_at=now() WHERE nick=$2',[body.id,nick]);await c.query('UPDATE public.shop_public_users SET logo_id=$1,updated_at=now() WHERE nick=$2',[body.id,nick]);
 }else await c.query("UPDATE public.shop_profiles SET cosmetics=jsonb_set(cosmetics,$1::text[],to_jsonb($2::text)),updated_at=now() WHERE nick=$3",[[body.layer==='background'?'selectedBackgroundId':'selectedFrameId'],body.id,nick]);
 return {ok:true,cosmetics:await cosmeticState(c,nick)};
}
export async function installedCosmetics(pool){
 if(!pool)return false;let c;try{c=await pool.connect();const row=(await c.query("SELECT col_description(attrelid,attnum) AS marker FROM pg_attribute WHERE attrelid='public.shop_profiles'::regclass AND attname='cosmetics' AND NOT attisdropped")).rows[0];if(!row)return false;if(row.marker!=='pw2_cosmetics_v1')throw Error();const triggers=(await c.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND (tgname,tgrelid) IN (('pw2_profile_cosmetics_defaults','public.shop_profiles'::regclass),('pw2_new_player_cosmetics','public.shop_players'::regclass),('pw2_admin_logo_entitlement','public.shop_access'::regclass))")).rows[0];if(triggers.n!==3)throw Error();return true}catch{throw Error('No se pudo verificar la migración de Perrilogos; revisar 005 antes de publicar')}finally{c?.release()}
}
