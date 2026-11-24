// Parse explicit point coordinates only, never use @lat,lng camera center.
function pair(value){
 const m=String(value??'').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
 if(!m)return null;const lat=Number(m[1]),lng=Number(m[2]);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
export function mapsSearchUrl(query){
 return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(String(query).slice(0,500));
}
export function parseMapsCoords(value){
 const raw=String(value??'').trim(),direct=pair(raw);if(direct)return direct;
 try{
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||!['google.com','www.google.com','maps.google.com','google.com.vn','www.google.com.vn'].includes(u.hostname))return null;
 for(const name of ['query','q']){const point=pair(u.searchParams.get(name));if(point)return point;}
 const decoded=decodeURIComponent(u.pathname+u.search);
 const points=[...decoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)(?=!|\/|&|$)/g)].map(m=>pair(m[1]+','+m[2])).filter(Boolean);
 const unique=[...new Map(points.map(p=>[p.lat+','+p.lng,p])).values()];
 return unique.length===1?unique[0]:null;
 }catch{return null}
}
