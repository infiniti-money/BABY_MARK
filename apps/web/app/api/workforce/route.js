import {authenticatedUser,serviceClient} from '../../../lib/server-auth';
export const runtime='nodejs';
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export async function POST(req){
 try{
 const actor=await authenticatedUser(req);if(!actor)return Response.json({error:'Phiên không hợp lệ'},{status:401});
 const b=await req.json(),db=serviceClient();let result;
 if(b.action==='submit'&&uuid(b.assignment_id)&&['LEAVE','CORRECTION'].includes(b.kind)&&typeof b.reason==='string'&&b.reason.trim().length>=5&&b.reason.length<=1000){
 const parse=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
 const i=b.kind==='CORRECTION'?parse(b.proposed_in):null,o=b.kind==='CORRECTION'?parse(b.proposed_out):null;
 result=await db.rpc('submit_workforce_request',{p_actor:actor,p_assignment:b.assignment_id,p_kind:b.kind,p_reason:b.reason,p_in:i,p_out:o});
 }else if(b.action==='decide'&&uuid(b.id)&&['APPROVED','REJECTED'].includes(b.decision)&&typeof b.note==='string'&&b.note.trim().length>=3&&b.note.length<=1000){
 result=await db.rpc('decide_workforce_request',{p_actor:actor,p_id:b.id,p_decision:b.decision,p_note:b.note});
 }else return Response.json({error:'Yêu cầu không hợp lệ'},{status:400});
 if(result.error)return Response.json({error:'Không thể lưu: '+(result.error.code==='23505'?'Ca đã có yêu cầu đang chờ hoặc được duyệt':result.error.message)},{status:409});
 return Response.json({ok:true,data:result.data});
 }catch{return Response.json({error:'Lỗi xử lý yêu cầu'},{status:500})}
}
