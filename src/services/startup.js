// Medidas locales: duraciones y etapas, sin identidad, cookies ni cuerpos de respuestas.
export async function measuredLoad(name,work,{clock=()=>performance.now(),record=()=>{}}={}){
 const start=clock();try{return await work()}finally{const end=clock();record({name,start,duration:end-start});if(globalThis.performance?.measure)performance.measure('pw2:'+name,{start,duration:Math.max(0,end-start)})}
}
// Solo la sesión precede a la interfaz. Cada tarea secundaria resuelve por separado.
export async function startAuthenticatedUI({authenticated,getSession,onSession,show,tasks={},onError=()=>{},clock=()=>performance.now(),record=()=>{}}){
 const started=clock(),options={clock,record};const session=authenticated??await measuredLoad('session',getSession,options);
 if(!onSession(session))return {pending:Promise.resolve([])};
 await measuredLoad('screen',()=>show(session),options);
 const duration=clock()-started;record({name:'startup-to-screen',start:started,duration});if(globalThis.performance?.measure)performance.measure('pw2:startup-to-screen',{start:started,duration:Math.max(0,duration)});
 const pending=Promise.allSettled(Object.entries(tasks).map(([name,work])=>measuredLoad(name,work,options).catch(error=>onError(error,name))));
 return {pending};
}
