-- Apply after workforce.sql; replace scheduling function so managers receive alerts for their assigned stores.
create or replace function public.enqueue_attendance_notifications() returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.attendance_notifications(recipient_id,assignment_id,kind,title,body)
 select a.user_id,a.id,'REMIND_IN','Nhắc giờ vào ca','Ca làm việc của bạn sắp bắt đầu.'
 from public.assignments a join public.profiles p on p.id=a.user_id and p.active
 where not exists(select 1 from public.workforce_requests w where w.assignment_id=a.id and w.state='APPROVED') and a.starts_at between now() and now()+interval '10 minutes'
 and not exists(select 1 from public.attendances t where t.assignment_id=a.id and t.type='IN')
 on conflict do nothing;
 insert into public.attendance_notifications(recipient_id,assignment_id,kind,title,body)
 select a.user_id,a.id,'REMIND_OUT','Nhắc giờ tan ca','Ca làm việc của bạn sắp kết thúc.'
 from public.assignments a join public.profiles p on p.id=a.user_id and p.active
 where not exists(select 1 from public.workforce_requests w where w.assignment_id=a.id and w.state='APPROVED') and a.ends_at between now() and now()+interval '10 minutes'
 and exists(select 1 from public.attendances t where t.assignment_id=a.id and t.type='IN')
 and not exists(select 1 from public.attendances t where t.assignment_id=a.id and t.type='OUT')
 on conflict do nothing;
 insert into public.attendance_notifications(recipient_id,assignment_id,kind,title,body)
 select m.id,a.id,'LATE','Cảnh báo chấm công',p.full_name||' · '||b.name||' · Chưa vào ca đúng giờ hoặc đã đi muộn.'
 from public.assignments a join public.profiles p on p.id=a.user_id and p.active join public.branches b on b.id=a.branch_id
 cross join public.profiles m
 where (m.role='admin' or (m.role='manager' and exists(select 1 from public.branch_managers bm where bm.user_id=m.id and bm.branch_id=a.branch_id))) and m.active and a.starts_at>now()-interval '24 hours'
 and not exists(select 1 from public.workforce_requests w where w.assignment_id=a.id and w.state='APPROVED') and now()>a.starts_at+make_interval(mins=>a.grace_minutes)
 and not exists(select 1 from public.attendances t where t.assignment_id=a.id and t.type='IN' and t.late_minutes=0)
 on conflict do nothing;
 insert into public.attendance_notifications(recipient_id,assignment_id,kind,title,body)
 select t.user_id,t.assignment_id,case when t.type='IN' then 'SUCCESS_IN' else 'SUCCESS_OUT' end,
 'Đã ghi nhận chấm công',case when t.type='IN' then 'Vào ca' else 'Tan ca' end||' · '||case when t.status='OUTSIDE' then 'Ngoài vùng, cần xem xét' else 'Xem chi tiết trong ứng dụng' end
 from public.attendances t join public.profiles p on p.id=t.user_id and p.active where t.server_timestamp>now()-interval '24 hours'
 on conflict do nothing;
 insert into public.push_deliveries(notification_id,token)
 select n.id,d.token from public.attendance_notifications n join public.push_devices d on d.user_id=n.recipient_id
 join public.profiles p on p.id=d.user_id and p.active
 where n.created_at>now()-interval '15 minutes' and d.updated_at>now()-interval '90 days'
 on conflict do nothing;
end $$;
