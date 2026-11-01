import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../src/',import.meta.url);
export async function buildFixedLayout(){
 const files=['styles.css','desktop-layout-fix.css','preview-pages.css','game-window.css'];
 const units={vw:'--design-vw',vh:'--design-vh',dvh:'--design-vh',vmin:'--design-vmin',vmax:'--design-vmax'};
 const sheets=await Promise.all(files.map(async file=>{
  let css=await readFile(new URL(file,root),'utf8');
  css=css.replace(/@media\s*([^{}]+)\{/g,(match,query)=>{
   if(query.includes('prefers-'))return match;
   const parts=query.replace(/\(pointer\s*:\s*fine\)/g,'(min-width:0px)').replace(/\(pointer\s*:\s*coarse\)/g,'(max-width:0px)').split(',');
   return '@container global-design '+(parts.length>1?parts.map(p=>'('+p.trim()+')').join(' or '):parts[0].trim())+' {';
  });
  css=css.replace(/(?<![\w.-])(\d*\.?\d+)(dvh|vmin|vmax|vw|vh)\b/g,(_,value,unit)=>'calc('+value+' * var('+units[unit]+'))');
  return css.replace(/env\(safe-area-inset-\w+(?:,\s*[^)]+)?\)/g,'0px');
 }));
 await writeFile(new URL('fixed-layout.css',root),'/* Generado para PC; las hojas originales conservan la vista móvil. */\n'+sheets.join('\n'));
}
