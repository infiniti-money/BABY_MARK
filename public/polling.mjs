// Retry only background reads. Mutations keep their explicit confirmation/recovery flow.
export function retryAfterMs(value,now=Date.now()){
 if(!value)return 0;
 const ms=/^\d+$/.test(value)?Number(value)*1000:Date.parse(value)-now;
 return Number.isFinite(ms)?Math.max(0,Math.min(3600000,ms)):0;
}
export function pollDelay({idle=0,failures=0,retryAfter=0,random=Math.random}={}){
 const base=failures?Math.min(300000,30000*2**Math.min(5,failures-1)):Math.min(120000,30000*2**Math.min(2,idle));
 return Math.max(retryAfter,Math.round(base*(failures?1+0.1*random():1)));
}
