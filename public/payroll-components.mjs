// Shared display definitions; actual calculations and validation run on server.
export const incomeFields=[["meal","Phụ cấp ăn ca"],["transport","Phụ cấp đi lại"],["phone","Phụ cấp điện thoại"],["responsibility","Phụ cấp trách nhiệm"],["housing","Phụ cấp nhà ở"],["attendance_bonus","Thưởng chuyên cần"],["sales_bonus","Thưởng doanh số / KPI"],["event_bonus","Thưởng chương trình"],["other_bonus","Thưởng khác"],["paid_leave","Tiền nghỉ hưởng lương"]];
export const deductionFields=[["advance","Tạm ứng"],["insurance","Bảo hiểm"],["tax","Thuế TNCN"],["other_deduction","Khấu trừ hợp lệ khác"]];
export const componentFields=[...incomeFields,...deductionFields];
export const salaryModes={hour:'Theo giờ',unit:'Theo công quy đổi',month:'Lương tháng đã đối soát'};
export function componentDefaults(row={}){return {salary_mode:'hour',unit_rate:0,monthly_base:0,overtime_rate:0,overtime_approved_minutes:0,...Object.fromEntries(componentFields.map(([k])=>[k,0])),...(row.components||{})};}
