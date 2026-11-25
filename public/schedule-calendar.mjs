const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const stamp=d=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('Ngày không hợp lệ');const t=Date.parse(d+'T00:00:00Z');if(!Number.isFinite(t)||iso(t)!==d)throw Error('Ngày không hợp lệ');return t};
export function calendarRange(day,mode){
 const t=stamp(day);
 if(mode==='week'){const weekday=(new Date(t).getUTCDay()+6)%7,from=t-weekday*DAY;return {from:iso(from),to:iso(from+6*DAY)};}
 if(mode==='month'){const d=new Date(t),from=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),next=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);return {from:iso(from),to:iso(next-DAY)};}
 throw Error('Chế độ lịch không hợp lệ');
}
export function calendarDays(from,to,assignments){
 const first=stamp(from),last=stamp(to);if(last<first||last-first>30*DAY)throw Error('Lịch tối đa 31 ngày');
 const days=[],map=new Map();for(let t=first;t<=last;t+=DAY){const day=iso(t),entry={day,weekday:(new Date(t).getUTCDay()+6)%7,rows:[]};days.push(entry);map.set(day,entry);}
 for(const a of assignments){const entry=map.get(a.work_date);if(entry)entry.rows.push(a);}
 return days;
}
