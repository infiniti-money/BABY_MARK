export default {
 async scheduled(controller,env,ctx){
  if(typeof env.PUSH_CRON_SECRET!=='string'||env.PUSH_CRON_SECRET.length<32||env.PUSH_CRON_SECRET.length>256)throw Error('Push cron secret not configured');
  const response=await fetch('https://babymark.pages.dev/api/maintenance/push',{method:'POST',headers:{Authorization:'Bearer '+env.PUSH_CRON_SECRET},redirect:'error'});
  if(!response.ok)throw Error('Push dispatch HTTP '+response.status);
 }
};
