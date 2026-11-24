// Old production schema is supported until migration 0009 is applied.
export async function policy(env){
 const fallback={available:false,branch_limit:14,photo_eviction:env.PHOTO_EVICTION_ENABLED==='true',attendance_retention:env.ATTENDANCE_RETENTION_ENABLED==='true',late_alerts:false,retention_secret_configured:typeof env.RETENTION_SECRET==='string'&&env.RETENTION_SECRET.length>=32};
 try{
  const r=await env.DB.prepare('SELECT * FROM system_settings WHERE id=1').first();
  if(!r)throw Error('SYSTEM_SETTINGS_MISSING_ROW');
  return {...fallback,available:true,branch_limit:r.branch_limit,photo_eviction:r.photo_eviction==null?fallback.photo_eviction:!!r.photo_eviction,attendance_retention:r.attendance_retention==null?fallback.attendance_retention:!!r.attendance_retention,late_alerts:!!r.late_alerts};
 }catch(e){if(/no such table: (?:main\.)?system_settings/i.test(String(e?.message)))return fallback;throw e;}
}
