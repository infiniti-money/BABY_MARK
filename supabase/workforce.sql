-- Apply once AFTER schema.sql and notifications.sql, only to the BABY_MARK database.
begin;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','manager','staff'));
create table public.branch_managers(
 user_id uuid not null references public.profiles(id),
 branch_id uuid not null references public.branches(id),
 primary key(user_id,branch_id)
);
alter table public.branch_managers enable row level security;
revoke all on public.branch_managers from public,anon,authenticated;
grant select on public.branch_managers to authenticated;
grant all on public.branch_managers to service_role;
create policy manager_memberships on public.branch_managers for select to authenticated using(user_id=auth.uid() or private.is_admin());
create function private.active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)
$$;
create function private.manages_branch(p_branch uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.branch_managers m join public.profiles p on p.id=m.user_id where m.user_id=auth.uid() and m.branch_id=p_branch and p.role='manager' and p.active)
$$;
create function private.manages_employee(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.assignments a where a.user_id=p_user and private.manages_branch(a.branch_id))
$$;
create function private.manages_assignment(p_assignment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.assignments a where a.id=p_assignment and private.manages_branch(a.branch_id))
$$;
revoke all on function private.active_user(),private.manages_branch(uuid),private.manages_employee(uuid),private.manages_assignment(uuid) from public;
grant execute on function private.active_user(),private.manages_branch(uuid),private.manages_employee(uuid),private.manages_assignment(uuid) to authenticated;
drop policy profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin() or private.manages_employee(id));
drop policy branch_read on public.branches;
create policy branch_read on public.branches for select to authenticated using(private.active_user() and (private.is_admin() or private.manages_branch(id) or exists(select 1 from public.assignments a where a.branch_id=branches.id and a.user_id=auth.uid())));
drop policy shift_read on public.shifts;
create policy shift_read on public.shifts for select to authenticated using(private.active_user() and (private.is_admin() or exists(select 1 from public.assignments a where a.shift_id=shifts.id and (a.user_id=auth.uid() or private.manages_branch(a.branch_id)))));
drop policy assignment_read on public.assignments;
create policy assignment_read on public.assignments for select to authenticated using(private.active_user() and (user_id=auth.uid() or private.is_admin() or private.manages_branch(branch_id)));
drop policy attendance_read on public.attendances;
create policy attendance_read on public.attendances for select to authenticated using(private.active_user() and (user_id=auth.uid() or private.is_admin() or private.manages_assignment(assignment_id)));
drop policy attendance_photo_read on storage.objects;
create policy attendance_photo_read on storage.objects for select to authenticated using(bucket_id='attendance-private' and private.active_user() and exists(select 1 from public.attendances a where a.photo_path=name and (a.user_id=auth.uid() or private.is_admin() or private.manages_assignment(a.assignment_id))));
-- Requests preserve original attendance evidence. No fabricated photo/GPS.
create table public.workforce_requests(
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references public.assignments(id),
 user_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('LEAVE','CORRECTION')),
 reason text not null check(length(trim(reason)) between 5 and 1000),
 proposed_in timestamptz, proposed_out timestamptz,
 state text not null default 'PENDING' check(state in ('PENDING','APPROVED','REJECTED')),
 created_at timestamptz not null default now(),
 decided_by uuid references public.profiles(id), decided_at timestamptz,
 decision_note text check(length(decision_note)<=1000),
 check((kind='LEAVE' and proposed_in is null and proposed_out is null) or (kind='CORRECTION' and proposed_in is not null and proposed_out is not null and proposed_out>proposed_in)),
 check((state='PENDING' and decided_by is null and decided_at is null) or (state in ('APPROVED','REJECTED') and decided_by is not null and decided_at is not null))
);
create unique index request_pending_or_approved on public.workforce_requests(assignment_id) where state in ('PENDING','APPROVED');
create index on public.workforce_requests(user_id,created_at desc);
alter table public.workforce_requests enable row level security;
revoke all on public.workforce_requests from public,anon,authenticated;
grant select on public.workforce_requests to authenticated;
grant all on public.workforce_requests to service_role;
create policy request_read on public.workforce_requests for select to authenticated using(private.active_user() and (user_id=auth.uid() or private.is_admin() or private.manages_assignment(assignment_id)));
create function public.submit_workforce_request(p_actor uuid,p_assignment uuid,p_kind text,p_reason text,p_in timestamptz,p_out timestamptz)
returns public.workforce_requests language plpgsql security invoker set search_path='' as $$
declare a public.assignments; result public.workforce_requests;
begin
 if not exists(select 1 from public.profiles where id=p_actor and active) then raise exception 'INACTIVE';end if;
 select * into a from public.assignments where id=p_assignment and user_id=p_actor for update;
 if not found then raise exception 'NOT_OWN_ASSIGNMENT';end if;
 if p_kind='CORRECTION' then
  if p_in is null or p_out is null or p_in<a.starts_at-interval '2 hours' or p_out>a.ends_at+interval '6 hours' or p_out<=p_in or p_out>now() then raise exception 'INVALID_CORRECTION_TIME';end if;
 elsif p_kind='LEAVE' then
  if exists(select 1 from public.attendances where assignment_id=a.id) then raise exception 'ALREADY_ATTENDED';end if;
 else raise exception 'INVALID_KIND';end if;
 insert into public.workforce_requests(assignment_id,user_id,kind,reason,proposed_in,proposed_out)
 values(a.id,p_actor,p_kind,trim(p_reason),p_in,p_out) returning * into result;
 return result;
end $$;
create function public.decide_workforce_request(p_actor uuid,p_id uuid,p_decision text,p_note text)
returns public.workforce_requests language plpgsql security invoker set search_path='' as $$
declare r public.workforce_requests; a public.assignments; result public.workforce_requests;
begin
 select * into r from public.workforce_requests where id=p_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 select * into a from public.assignments where id=r.assignment_id for update;
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.active and (p.role='admin' or (p.role='manager' and exists(select 1 from public.branch_managers m where m.user_id=p_actor and m.branch_id=a.branch_id)))) or p_actor=r.user_id then raise exception 'FORBIDDEN';end if;
 if r.state<>'PENDING' or p_decision not in ('APPROVED','REJECTED') or length(trim(coalesce(p_note,'')))<3 then raise exception 'INVALID_DECISION';end if;
 if p_decision='APPROVED' and r.kind='LEAVE' and exists(select 1 from public.attendances where assignment_id=a.id) then raise exception 'ALREADY_ATTENDED';end if;
 update public.workforce_requests set state=p_decision,decided_by=p_actor,decided_at=now(),decision_note=trim(p_note) where id=r.id returning * into result;
 return result;
end $$;
revoke all on function public.submit_workforce_request(uuid,uuid,text,text,timestamptz,timestamptz),public.decide_workforce_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_workforce_request(uuid,uuid,text,text,timestamptz,timestamptz),public.decide_workforce_request(uuid,uuid,text,text) to service_role;
create function private.prevent_leave_attendance() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.assignments where id=new.assignment_id for update;
 if exists(select 1 from public.workforce_requests where assignment_id=new.assignment_id and kind='LEAVE' and state='APPROVED') then raise exception 'APPROVED_LEAVE';end if;
 return new;
end $$;
revoke all on function private.prevent_leave_attendance() from public;
create trigger block_leave_attendance before insert on public.attendances for each row execute function private.prevent_leave_attendance();
-- Protect completed and reviewed assignments from direct schedule rewrites.
create function private.lock_historical_assignment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.attendances where assignment_id=old.id) or exists(select 1 from public.workforce_requests where assignment_id=old.id) then raise exception 'ASSIGNMENT_HAS_HISTORY';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.lock_historical_assignment() from public;
create trigger protect_assignment before update or delete on public.assignments for each row execute function private.lock_historical_assignment();
commit;
