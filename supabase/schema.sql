-- Initial schema for a NEW Supabase project. Run once as database owner.
begin;
create schema if not exists private;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 employee_code text unique not null, full_name text not null,
 role text not null default 'staff' check(role in ('admin','staff')),
 department text not null default '', active boolean not null default true
);
create table public.branches (
 id uuid primary key default gen_random_uuid(), name text not null,
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 allowed_radius integer not null default 100 check(allowed_radius between 20 and 1000)
);
create table public.shifts (
 id uuid primary key default gen_random_uuid(), name text not null,
 start_time time not null, end_time time not null,
 grace_period integer not null default 0 check(grace_period between 0 and 120)
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 branch_id uuid not null references public.branches(id),
 shift_id uuid not null references public.shifts(id),
 work_date date not null, starts_at timestamptz not null, ends_at timestamptz not null,
 grace_minutes integer not null default 0 check(grace_minutes between 0 and 120),
 check(ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
 unique(user_id, starts_at)
);
create table public.attendances (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references public.assignments(id),
 user_id uuid not null references public.profiles(id),
 type text not null check(type in ('IN','OUT')),
 server_timestamp timestamptz not null,
 gps_lat double precision not null check(gps_lat between -90 and 90),
 gps_lng double precision not null check(gps_lng between -180 and 180),
 accuracy_m double precision not null check(accuracy_m between 0 and 50),
 distance_m double precision not null,
 address_text text not null default '',
 photo_path text unique not null,
 status text not null check(status in ('ON_TIME','LATE','EARLY','OUTSIDE')),
 late_minutes integer not null default 0,
 early_minutes integer not null default 0,
 unique(assignment_id,type)
);
create index on public.assignments(user_id,work_date);
create index on public.attendances(user_id,server_timestamp);
create function private.is_admin() returns boolean language sql stable security definer
set search_path = '' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active) $$;
revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.shifts enable row level security;
alter table public.assignments enable row level security;
alter table public.attendances enable row level security;
revoke all on public.profiles,public.branches,public.shifts,public.assignments,public.attendances from anon, authenticated;
grant select on public.profiles,public.branches,public.shifts,public.assignments,public.attendances to authenticated;
grant insert,update,delete on public.branches,public.shifts,public.assignments to authenticated;
grant all on public.profiles,public.branches,public.shifts,public.assignments,public.attendances to service_role;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
create policy branch_read on public.branches for select to authenticated using(private.is_admin() or exists(select 1 from public.assignments a where a.branch_id=branches.id and a.user_id=auth.uid()));
create policy shift_read on public.shifts for select to authenticated using(private.is_admin() or exists(select 1 from public.assignments a where a.shift_id=shifts.id and a.user_id=auth.uid()));
create policy assignment_read on public.assignments for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy attendance_read on public.attendances for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy branch_admin on public.branches for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy shift_admin on public.shifts for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy assignment_admin on public.assignments for all to authenticated using(private.is_admin()) with check(private.is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('attendance-private','attendance-private',false,1048576,array['image/jpeg']);
create policy attendance_photo_read on storage.objects for select to authenticated using(
 bucket_id='attendance-private' and exists(select 1 from public.attendances a where a.photo_path=name and (a.user_id=auth.uid() or private.is_admin()))
);
-- Service-only RPC. Never expose the service key to mobile/web.
create function public.record_attendance(
 p_user uuid,p_assignment uuid,p_type text,p_time timestamptz,
 p_lat double precision,p_lng double precision,p_accuracy double precision,
 p_address text,p_photo text
) returns public.attendances language plpgsql security invoker set search_path='' as $$
declare a public.assignments; b public.branches; result public.attendances;
 d double precision; late integer:=0; early integer:=0; s text; prev timestamptz;
begin
 if p_type not in ('IN','OUT') or p_lat is null or p_lng is null or p_accuracy is null
 or not (p_lat between -90 and 90 and p_lng between -180 and 180 and p_accuracy between 0 and 50)
 then raise exception 'INVALID_LOCATION'; end if;
 if p_time is null or abs(extract(epoch from(clock_timestamp()-p_time)))>120 then raise exception 'STALE_REQUEST'; end if;
 if not exists(select 1 from public.profiles where id=p_user and active) then raise exception 'INACTIVE_USER'; end if;
 select * into a from public.assignments where id=p_assignment and user_id=p_user for update;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
 if p_time<a.starts_at-interval '2 hours' or p_time>a.ends_at+interval '6 hours' then raise exception 'OUTSIDE_SHIFT_WINDOW'; end if;
 select * into b from public.branches where id=a.branch_id;
 d:= 2*6371000*asin(sqrt(least(1.0,power(sin(radians(p_lat-b.latitude)/2),2)+cos(radians(b.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-b.longitude)/2),2))));
 if p_type='OUT' then
 select server_timestamp into prev from public.attendances where assignment_id=a.id and type='IN';
 if prev is null or p_time<prev then raise exception 'CHECK_IN_REQUIRED'; end if;
 early:=greatest(0,ceil(extract(epoch from(a.ends_at-p_time))/60))::integer;
 else
 if p_time>a.starts_at+make_interval(mins=>a.grace_minutes) then late:=ceil(extract(epoch from(p_time-a.starts_at))/60)::integer; end if;
 end if;
 s:=case when d>b.allowed_radius then 'OUTSIDE' when late>0 then 'LATE' when early>0 then 'EARLY' else 'ON_TIME' end;
 insert into public.attendances(assignment_id,user_id,type,server_timestamp,gps_lat,gps_lng,accuracy_m,distance_m,address_text,photo_path,status,late_minutes,early_minutes)
 values(a.id,p_user,p_type,p_time,p_lat,p_lng,p_accuracy,d,coalesce(p_address,''),p_photo,s,late,early) returning * into result;
 return result;
end $$;
revoke all on function public.record_attendance(uuid,uuid,text,timestamptz,double precision,double precision,double precision,text,text) from public,anon,authenticated;
grant execute on function public.record_attendance(uuid,uuid,text,timestamptz,double precision,double precision,double precision,text,text) to service_role;
commit;
