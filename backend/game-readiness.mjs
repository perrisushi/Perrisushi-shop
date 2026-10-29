export const gameNames=['PerriDuelos','PerriPet','PerriCasillas','PerriRPG'];
const common=['shop_players','shop_access','shop_sessions','shop_inventories','shop_operations','shop_profiles','shop_logo_catalog','shop_activity','shop_public_users','shop_notifications','shop_inventory_chests','shop_perri_chests','shop_random_key_tickets','shop_random_key_pool','shop_random_key_claims'];
const tables={
 PerriDuelos:[],
 PerriPet:['shop_perripet_states','shop_perripet_inventory','shop_perripet_item_catalog','shop_rpg_inventory','shop_rpg_catalog'],
 PerriCasillas:['perri_casillas_games'],
 PerriRPG:['shop_rpg_catalog','shop_rpg_inventory','shop_rpg_equipment','shop_rpg_loadout','shop_rpg_combat_state','shop_rpg_ledger']
};
const functions=['public.shop_rpg_ensure_starter_set(text)','public.shop_rpg_purchase_items(text,text,integer)','public.shop_rpg_equip_armor(text,text,text)','public.shop_rpg_set_loadout(text,text,boolean)','public.shop_rpg_consume_item(text,text,integer)','public.shop_rpg_claim_boss_reward(text)'];
export function gamesEnabled(value,hasDatabase){
 if(value===undefined||value===''||value==='auto')return Boolean(hasDatabase);
 if(value==='true')return true;if(value==='false')return false;
 throw Error('PW2_GAMES_ENABLED debe ser true, false o auto');
}
export function gameFailure(error){
 if(['28P01','42501','42P01','42703','42883','53300','57P03','57014','55P03','40P01','40001','ECONNREFUSED','ENOTFOUND','ETIMEDOUT','CERT_HAS_EXPIRED','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error?.code))return error.code;
 return 'connection_or_query_failed';
}
export async function inspectGameStorage(client){
 const names=[...new Set([...common,...Object.values(tables).flat()])];
 const resources=(await client.query("SELECT name,to_regclass('public.'||name) IS NOT NULL AS present,CASE WHEN to_regclass('public.'||name) IS NULL THEN false ELSE has_table_privilege(current_user,to_regclass('public.'||name),'SELECT') END AS readable FROM unnest($1::text[]) AS name",[names])).rows;
 const procedures=(await client.query("SELECT signature,to_regprocedure(signature) IS NOT NULL AS present,CASE WHEN to_regprocedure(signature) IS NULL THEN false ELSE has_function_privilege(current_user,to_regprocedure(signature),'EXECUTE') END AS executable FROM unnest($1::text[]) AS signature",[functions])).rows;
 const found=new Map(resources.map(r=>[r.name,r.present&&r.readable])),proceduresReady=procedures.every(r=>r.present&&r.executable)&&procedures.length===functions.length;
 const games=Object.fromEntries(gameNames.map(name=>[name,[...common,...tables[name]].every(t=>found.get(t))&&(name!=='PerriRPG'||proceduresReady)]));
 const missingTables=names.filter(name=>!resources.some(r=>r.name===name&&r.present)),deniedTables=resources.filter(r=>r.present&&!r.readable).map(r=>r.name);
 const missingFunctions=procedures.filter(r=>!r.present).map(r=>r.signature),deniedFunctions=procedures.filter(r=>r.present&&!r.executable).map(r=>r.signature);
 return {games,missingTables,deniedTables,missingFunctions,deniedFunctions};
}
