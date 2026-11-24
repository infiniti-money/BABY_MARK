-- Apply AFTER schema.sql; optional notification/realtime upgrade, on BABY_MARK project only.
begin;
create table public.push_devices(
 token text primary key check(length(token) between 20 and 300),
 user_id uuid not null references public.profiles(id) on delete cascade,
 updated_at timestamptz not null default now()
);
create index on public.push_devices(user_id);
create table public.attendance_notifications(
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id),
 assignment_id uuid not null references public.assignments(id),
 kind text not null check(kind in ('REMIND_IN','REMIND_OUT','LATE','SUCCESS_IN','SUCCESS_OUT')),
 title text not null,body text not null,created_at timestamptz not null default now(),
 unique(recipient_id,assignment_id,kind)
);
create index on public.attendance_notifications(recipient_id,created_at desc);
create table public.push_deliveries(
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.attendance_notifications(id) on delete cascade,
 token text not null references public.push_devices(token) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','accepted','failed')),
 updated_at timestamptz not null default now(), ticket_id text,
 unique(notification_id,token)
);
create index on public.push_deliveries(state,updated_at);
alter table public.push_devices enable row level security;
alter table public.attendance_notifications enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_devices,public.attendance_notifications,public.push_deliveries from public,anon,authenticated;
grant select on public.attendance_notifications to authenticated;
grant all on public.push_devices,public.attendance_notifications,public.push_deliveries to service_role;
create policy notification_own on public.attendance_notifications for select to authenticated using(recipient_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active));
-- Never publish device tokens or delivery queue.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='attendances') then alter publication supabase_realtime add table public.attendances; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='assignments') then alter publication supabase_realtime add table public.assignments; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='attendance_notifications') then alter publication supabase_realtime add table public.attendance_notifications; end if;
end $$;
create function public.enqueue_attendance_notifications() returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.attendance_notifications(recipient_id,assignment_id,kind,title,body)
 select a.user_id,a.id,'REMIND_IN','Nhắc giờ vào ca','Ca làm việc của bạn sắp bắt đầu.'
 from public.assignments a join public.profiles p on p.id=a.user_id and p.active
 where a.starts_at between now() and now()+interval '10 minutes'
 and not exists(select 1 from public.attendances t where t.assignment_id=a.id and t.type='IN')
 on conflict do nothing;
 insert into public.attendance_notifications(recipient_id,assignment_id,kind,title,body)
 select a.user_id,a.id,'REMIND_OUT','Nhắc giờ tan ca','Ca làm việc của bạn sắp kết thúc.'
 from public.assignments a join public.profiles p on p.id=a.user_id and p.active
 where a.ends_at between now() and now()+interval '10 minutes'
 and exists(select 1 from public.attendances t where t.assignment_id=a.id and t.type='IN')
 and not exists(select 1 from public.attendances t where t.assignment_id=a.id and t.type='OUT')
 on conflict do nothing;
 insert into public.attendance_notifications(recipient_id,assignment_id,kind,title,body)
 select m.id,a.id,'LATE','Cảnh báo chấm công',p.full_name||' · '||b.name||' · Chưa vào ca đúng giờ hoặc đã đi muộn.'
 from public.assignments a join public.profiles p on p.id=a.user_id and p.active join public.branches b on b.id=a.branch_id
 cross join public.profiles m
 where m.role='admin' and m.active and a.starts_at>now()-interval '24 hours'
 and now()>a.starts_at+make_interval(mins=>a.grace_minutes)
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
create function public.claim_push_deliveries() returns table(delivery_id uuid,push_token text) language sql security invoker set search_path='' as $$
 with picked as (
 select d.id from public.push_deliveries d join public.attendance_notifications n on n.id=d.notification_id
 join public.push_devices v on v.token=d.token and v.user_id=n.recipient_id
 join public.profiles p on p.id=v.user_id and p.active
 where d.state='pending' and n.created_at>now()-interval '15 minutes'
 order by d.updated_at limit 100 for update of d skip locked
 ), claimed as (
 update public.push_deliveries d set state='sending',updated_at=now() from picked where d.id=picked.id returning d.id,d.token
 ) select id,token from claimed;
$$;
revoke all on function public.enqueue_attendance_notifications(),public.claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.enqueue_attendance_notifications(),public.claim_push_deliveries() to service_role;
commit;
