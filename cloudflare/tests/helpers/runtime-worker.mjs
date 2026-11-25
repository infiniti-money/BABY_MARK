// Local test worker only; never deployed or copied into public/.
import * as admin from '../../../functions/api/admin/[resource].js';
import * as workforce from '../../../functions/api/workforce.js';
import * as employment from '../../../functions/api/admin/employment.js';
import * as payroll from '../../../functions/api/admin/payroll.js';
import * as rosters from '../../../functions/api/admin/rosters.js';
import * as attendance from '../../../functions/api/attendance/[action].js';
import * as extra from '../../../functions/api/extra-attendance.js';
import {pruneAttendance} from '../../lib/attendance-retention.mjs';
const routes={'/admin/resources':admin,'/workforce':workforce,'/employment':employment,'/payroll':payroll,'/rosters':rosters,'/extra':extra};
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/__metadata')return Response.json(await env.DB.prepare("UPDATE branches SET allowed_radius=allowed_radius+1 WHERE id='BM-001' RETURNING id").run());
 if(url.pathname==='/__retention')return Response.json(await pruneAttendance(env.DB));
 const action=url.pathname.match(/^\/attendance\/(prepare|submit|status)$/)?.[1];
 const module=action?attendance:routes[url.pathname];if(!module)return new Response('Local D1 test fixture', {status:404});
 return module[request.method==='GET'?'onRequestGet':'onRequestPost']({request,env,params:{action,resource:url.searchParams.get('__resource')}});
}};
