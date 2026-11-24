import {invalid} from './access.mjs';
import {componentDefaults,componentFields,incomeFields,deductionFields,salaryModes} from '../../public/payroll-components.mjs';
export async function componentsReady(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_components'").first();}
export function validateComponents(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Object.hasOwn(salaryModes,raw.salary_mode))invalid('Chọn cách tính lương hợp lệ');
 const out={salary_mode:raw.salary_mode};
 for(const [k,max] of [['unit_rate',10000000],['monthly_base',1000000000],['overtime_rate',10000000],['overtime_approved_minutes',44640],...componentFields.map(([k])=>[k,1000000000])]){
  const v=raw[k]??0;if(!Number.isSafeInteger(v)||v<0||v>max)invalid('Khoản tiền hoặc phút làm thêm không hợp lệ');out[k]=v;
 }
 return out;
}
export function calculatePay(row,input,raw){
 const c=componentDefaults({components:raw}),configured=!!input;
 const base=!configured?null:c.salary_mode==='unit'?Math.round(row.work_units*c.unit_rate):c.salary_mode==='month'?c.monthly_base:Math.round(row.regular_minutes*input.hourly_rate/60);
 const approved=Math.min(c.overtime_approved_minutes,row.overtime_minutes),overtime_pay=Math.round(approved*c.overtime_rate/60);
 const additions_other=input?.additions??0,deductions_other=input?.deductions??0;
 const additions=additions_other+incomeFields.reduce((s,[k])=>s+c[k],0),deductions=deductions_other+deductionFields.reduce((s,[k])=>s+c[k],0);
 return {components:c,base,overtime_pay,overtime_paid_minutes:approved,overtime_review_required:c.overtime_approved_minutes>row.overtime_minutes,additions_other,deductions_other,additions,deductions,estimated_total:base===null?null:base+overtime_pay+additions-deductions};
}
