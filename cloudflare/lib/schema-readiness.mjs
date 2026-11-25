// Read-only structural evidence, not an applied migration ledger or schema checksum.
// 0002 seeds data; 0009 replaces the 0008 branch capacity trigger by the same name.
export const checks=[
 [
  "0001",
  "profiles branches shifts branch_managers assignments attendances workforce_requests attendance_notifications push_devices push_deliveries",
  "assignment_user_date assignment_branch_date attendance_user_time request_active notification_recipient_time",
  "",
  ""
 ],
 [
  "0002",
  "",
  "",
  "",
  ""
 ],
 [
  "0003",
  "credentials sessions login_attempts auth_audit",
  "sessions_user sessions_expiry auth_audit_target",
  "",
  ""
 ],
 [
  "0004",
  "photo_inventory photo_storage_lock",
  "photo_inventory_state_age photo_inventory_state_expiry",
  "",
  ""
 ],
 [
  "0005",
  "retention_runs retention_candidates",
  "assignment_end_retention workforce_assignment_retention notification_assignment_retention delivery_notification_retention",
  "",
  ""
 ],
 [
  "0006",
  "management_audit",
  "management_audit_time assignment_user_interval request_user_created",
  "assignments_no_overlap_insert assignments_no_overlap_update assignments_preserve_history attendance_no_approved_leave leave_no_attendance",
  "branches.address_text"
 ],
 [
  "0007",
  "attendance_challenges",
  "challenge_user_time challenge_assignment challenge_processing",
  "assignment_no_edit_with_challenge",
  "attendances.photo_sha256 attendances.photo_source attendances.received_at attendances.stamp_issued_at attendances.metadata_json"
 ],
 [
  "0008",
  "",
  "",
  "branches_capacity_insert profiles_active_capacity_insert profiles_active_capacity_update branch_no_edit_with_challenge",
  ""
 ],
 [
  "0009",
  "system_settings",
  "",
  "branches_capacity_insert branches_capacity_reactivate branch_limit_not_below_active branch_archive_requires_no_open_schedule assignment_active_branch_insert assignment_active_branch_update",
  "branches.active"
 ],
 [
  "0010",
  "web_push_settings web_push_subscriptions web_push_receipts",
  "web_push_user web_push_receipts_age web_push_assignment_start",
  "",
  ""
 ],
 [
  "0011",
  "branch_rosters",
  "roster_morning_user roster_evening_user",
  "roster_no_cross_branch_insert roster_no_cross_branch_update",
  ""
 ],
 [
  "0012",
  "extra_attendance",
  "extra_attendance_state",
  "",
  ""
 ],
 [
  "0013",
  "shift_handover",
  "shift_handover_created",
  "",
  ""
 ],
 [
  "0014",
  "roster_automation payroll_inputs payroll_closings",
  "",
  "payroll_closings_immutable_update payroll_closings_immutable_delete",
  ""
 ],
 [
  "0015",
  "chat_threads chat_members chat_messages chat_reads",
  "chat_members_user chat_messages_thread chat_messages_sender",
  "",
  ""
 ],
 [
  "0016",
  "payroll_components",
  "",
  "",
  ""
 ],
 ["0017","employment_periods payroll_epoch","employment_periods_user","employment_periods_overlap_insert employment_periods_overlap_update payroll_epoch_profiles_insert payroll_epoch_profiles_update payroll_epoch_profiles_delete payroll_epoch_branches_insert payroll_epoch_branches_update payroll_epoch_branches_delete payroll_epoch_shifts_insert payroll_epoch_shifts_update payroll_epoch_shifts_delete payroll_epoch_assignments_insert payroll_epoch_assignments_update payroll_epoch_assignments_delete payroll_epoch_attendances_insert payroll_epoch_attendances_update payroll_epoch_attendances_delete payroll_epoch_workforce_requests_insert payroll_epoch_workforce_requests_update payroll_epoch_workforce_requests_delete payroll_epoch_extra_attendance_insert payroll_epoch_extra_attendance_update payroll_epoch_extra_attendance_delete payroll_epoch_payroll_inputs_insert payroll_epoch_payroll_inputs_update payroll_epoch_payroll_inputs_delete payroll_epoch_payroll_components_insert payroll_epoch_payroll_components_update payroll_epoch_payroll_components_delete payroll_epoch_employment_periods_insert payroll_epoch_employment_periods_update payroll_epoch_employment_periods_delete",""],
 ["0018","","","attendance_no_rejected_extra",""],
 ["0019","push_queue","push_queue_pending","",""],
 ["0020","work_unit_reviews","work_unit_reviews_assignment","work_unit_reviews_immutable_update work_unit_reviews_immutable_delete payroll_epoch_work_unit_reviews_insert",""],
 ["0021","employee_cv","","employee_cv_audit_insert employee_cv_audit_update",""]
];
export async function schemaReadiness(db){
 const {results}=await db.prepare("SELECT name,type FROM sqlite_master WHERE type IN ('table','index','trigger')").all();
 const present=new Map(results.map(r=>[r.name,r.type]));
 const columns=new Map();
 for(const table of ['branches','attendances']){
  if(present.get(table)==='table'){
   const r=await db.prepare('PRAGMA table_info('+table+')').all();
   columns.set(table,new Set(r.results.map(c=>c.name)));
  }
 }
 const migrations=checks.map(([id,tables,indexes,triggers,cols])=>{
  const missing=[];
  for(const [kind,names] of [['table',tables],['index',indexes],['trigger',triggers]])for(const name of names.split(' ').filter(Boolean))if(present.get(name)!==kind)missing.push(kind+':'+name);
  for(const pair of cols.split(' ').filter(Boolean)){const [table,column]=pair.split('.');if(!columns.get(table)?.has(column))missing.push('column:'+pair);}
  return {id,status:id==='0002'?'manual':missing.length?'missing':'present',missing};
 });
 return {target:'0021',ready:migrations.every(m=>m.status!=='missing'),migrations,proof:'catalog_only'};
}
