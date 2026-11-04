export function gameScopeFromAction(action){
 if(action==='publicShopConsumeSpecialItem'||action.includes('PerriPet'))return 'PerriPet';
 if(action.includes('Rpg'))return 'PerriRPG';
 if(action.includes('Casilla'))return 'PerriCasillas';
 if(['publicShopGetDuelTarget','publicShopExpireDuelTarget','publicShopPerformAttack','publicShopUpgradeEquipment'].includes(action))return 'PerriDuelos';
 return null;
}
export function gameScopeFromPath(path){
 if(path.startsWith('/games/perriland/'))return 'PerriLand';
 if(path.includes('/perripet-app/'))return 'PerriPet';
 if(path.includes('/perriduelos-app/'))return 'PerriDuelos';
 if(path.includes('perricasillas')||path.endsWith('/index-production.html'))return 'PerriCasillas';
 if(path.includes('/perrirpg'))return 'PerriRPG';
 return null;
}
