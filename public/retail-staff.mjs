// Department is an explicit assignment, never inferred from the employee's name.
export function isRetailStaff(p){
 const dept=String(p?.department??'').normalize('NFD').replace(/\p{Mark}/gu,'').trim().toLowerCase().replace(/\s+/g,' ');
 return !!p?.active&&['staff','manager'].includes(p.role)&&['ban hang','nhan vien ban hang'].includes(dept);
}
