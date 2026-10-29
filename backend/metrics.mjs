import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';
export const metricsContext=new AsyncLocalStorage();
export async function timed(field,work){const metric=metricsContext.getStore(),start=performance.now();try{return await work()}finally{if(metric)metric[field]=(metric[field]??0)+performance.now()-start}}
export function measuredClient(client){return {release:()=>client.release(),query:(...args)=>{const metric=metricsContext.getStore();if(metric)metric.sqlQueries=(metric.sqlQueries??0)+1;return timed('sqlMs',()=>client.query(...args))}}}
export function timingHeader(start){const metric=metricsContext.getStore()??{},ms=value=>Math.max(0,Number.isFinite(value)?value:0).toFixed(1);return `app;dur=${ms(performance.now()-start)}, rest;dur=${ms(metric.restMs)}, sql;dur=${ms(metric.sqlMs)}, pool;dur=${ms(metric.poolMs)}, lock;dur=${ms(metric.lockMs)}, sqlq;desc="${metric.sqlQueries??0}", restq;desc="${metric.queries??0}"`}
