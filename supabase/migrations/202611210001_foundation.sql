-- DriveLedger SaaS: isolated tenants, immutable accounting, auditable GPS.
-- Apply to an EMPTY Supabase project using SQL Editor or `supabase db push`.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings(key, value) values
 ('site_title', '"DriveLedger"'::jsonb),
 ('developer_name', '"NPT duy"'::jsonb),
 ('hero_title', '"Quản lý dạy lái xe thông minh"'::jsonb),
 ('hero_description', '"Học viên, lịch dạy, sổ thu chi và GPS trên một nền tảng."'::jsonb),
 ('brand_color', '"#2563eb"'::jsonb),
 ('feature_registration', 'true'::jsonb);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  system_role text not null default 'member' check (system_role in ('member','super_admin')),
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 2 and 120),
  primary_color text not null default '#2563eb' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  bank_bin text check (bank_bin is null or bank_bin ~ '^[0-9]{6}$'),
  bank_account text check (bank_account is null or bank_account ~ '^[0-9]{5,25}$'),
  bank_account_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_owner_idx on public.organizations(owner_id);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('manager','instructor','accountant','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

-- Billing state exists from day one; automatic charging/webhooks are intentionally not enabled.
create table public.billing_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial','starter','pro','enterprise')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz not null default (now()+interval '14 days'),
  current_period_end timestamptz,
  provider text,
  provider_subscription_id text,
  updated_at timestamptz not null default now()
);
create or replace function private.create_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.billing_subscriptions(organization_id) values(new.id);
  return new;
end; $$;
create trigger organization_trial after insert on public.organizations for each row execute function private.create_trial();


create or replace function private.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = (select auth.uid()))
    or exists (select 1 from public.memberships m where m.organization_id = p_org and m.user_id = (select auth.uid()))
  );
$$;
create or replace function private.has_role(p_org uuid, p_allowed text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = (select auth.uid()))
    or exists (select 1 from public.memberships m where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = any(p_allowed))
  );
$$;
create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.system_role = 'super_admin');
$$;
revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_role(uuid,text[]) from public;
revoke all on function private.is_super_admin() from public;
grant execute on function private.is_member(uuid),private.has_role(uuid,text[]),private.is_super_admin() to authenticated;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check(length(trim(full_name)) between 2 and 150),
  phone text not null default '',
  license_class text not null default 'B',
  target_km numeric(10,1) not null default 0 check(target_km >= 0),
  notes text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index students_org_name_idx on public.students(organization_id, full_name);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plate text not null check(length(trim(plate)) between 5 and 20),
  model text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,plate)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id),
  vehicle_id uuid references public.vehicles(id),
  instructor_id uuid not null references auth.users(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'planned' check(status in ('planned','completed','cancelled')),
  fee_vnd bigint not null default 0 check(fee_vnd >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint valid_lesson_time check(ends_at > starts_at)
);
create index lessons_org_start_idx on public.lessons(organization_id,starts_at);

-- Serialize same-organization calendar writes before checking instructor/vehicle conflicts.
create or replace function private.reject_lesson_overlap() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status <> 'planned' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,0));
  if exists (
    select 1 from public.lessons l
    where l.organization_id=new.organization_id and l.id <> new.id
      and l.status='planned'
      and tstzrange(l.starts_at,l.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')
      and (l.instructor_id=new.instructor_id or (l.vehicle_id is not null and l.vehicle_id=new.vehicle_id))
  ) then raise exception 'Trùng lịch giáo viên hoặc xe tập lái'; end if;
  return new;
end; $$;
create trigger lesson_overlap before insert or update on public.lessons for each row execute function private.reject_lesson_overlap();


create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id),
  code text not null check(length(code) between 6 and 50),
  amount_vnd bigint not null check(amount_vnd > 0),
  due_at date,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique(organization_id,code)
);

-- Single source of financial truth: only CONFIRMED entries count in reports.
-- Rows are INSERT-only through tenant RLS: corrections use new offsetting entries.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid references public.students(id),
  invoice_id uuid references public.invoices(id),
  kind text not null check(kind in ('income','expense')),
  status text not null default 'confirmed' check(status in ('pending','confirmed')),
  category text not null check(length(trim(category)) between 2 and 60),
  amount_vnd bigint not null check(amount_vnd > 0),
  method text not null default 'cash' check(method in ('cash','transfer','other')),
  reference text,
  note text not null default '',
  recorded_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  idempotency_key uuid not null default gen_random_uuid(),
  unique(organization_id,idempotency_key),
  constraint invoice_income_only check(invoice_id is null or kind = 'income'),
  constraint confirmed_transfer_reference check(method <> 'transfer' or status <> 'confirmed' or nullif(trim(reference),'') is not null)
);
create index transactions_org_period_idx on public.transactions(organization_id,recorded_at) where status = 'confirmed';
create index transactions_invoice_idx on public.transactions(invoice_id) where status = 'confirmed';
create unique index transactions_transfer_ref_unique on public.transactions(organization_id,reference) where status='confirmed' and method='transfer' and reference is not null;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lesson_id uuid references public.lessons(id),
  student_id uuid references public.students(id),
  vehicle_id uuid references public.vehicles(id),
  created_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'active' check(status in ('active','completed')),
  distance_m numeric(12,2) not null default 0 check(distance_m >= 0)
);
create index trips_org_date_idx on public.trips(organization_id,started_at);
create unique index trips_one_active_per_driver on public.trips(created_by) where status='active';

create table public.trip_points (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  captured_at timestamptz not null,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_m numeric(8,2) not null check(accuracy_m >= 0),
  unique(trip_id,captured_at)
);
create index trip_points_order_idx on public.trip_points(trip_id,captured_at);

-- Every student's GPS mileage is derived solely from completed trips linked to that student.
create view public.student_mileage with (security_invoker=true) as
select s.id,s.organization_id,s.full_name,s.phone,s.license_class,s.archived,s.target_km,
       coalesce(sum(t.distance_m) filter (where t.status='completed'),0)::numeric as completed_distance_m
from public.students s left join public.trips t on t.student_id=s.id and t.organization_id=s.organization_id
group by s.id;


create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  entity text not null,
  entity_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index audit_events_org_date_idx on public.audit_events(organization_id,created_at desc);

-- Enforce org matching in all cross-table references (foreign keys alone are insufficient).
create or replace function private.check_org_links()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name in ('lessons','invoices','transactions','trips') then
    if new.student_id is not null and not exists(select 1 from public.students where id=new.student_id and organization_id=new.organization_id)
      then raise exception 'student belongs to different organization'; end if;
  end if;
  if tg_table_name in ('lessons','trips') then
    if new.vehicle_id is not null and not exists(select 1 from public.vehicles where id=new.vehicle_id and organization_id=new.organization_id)
      then raise exception 'vehicle belongs to different organization'; end if;
  end if;
  if tg_table_name = 'lessons' then
    if not exists(select 1 from public.organizations where id=new.organization_id and owner_id=new.instructor_id)
       and not exists(select 1 from public.memberships where organization_id=new.organization_id and user_id=new.instructor_id and role in ('instructor','manager'))
      then raise exception 'instructor is not assigned to organization'; end if;
  end if;
  if tg_table_name = 'transactions' then
    if new.invoice_id is not null and new.student_id is not null and not exists(select 1 from public.invoices where id=new.invoice_id and student_id=new.student_id)
      then raise exception 'Invoice and student mismatch'; end if;
    if new.invoice_id is not null and not exists(select 1 from public.invoices where id=new.invoice_id and organization_id=new.organization_id)
      then raise exception 'invoice belongs to different organization'; end if;
  end if;
  if tg_table_name = 'trips' then
    if new.lesson_id is not null and not exists(select 1 from public.lessons where id=new.lesson_id and organization_id=new.organization_id)
      then raise exception 'lesson belongs to different organization'; end if;
  end if;
  return new;
end;
$$;
create trigger lesson_links before insert or update on public.lessons for each row execute function private.check_org_links();
create trigger invoice_links before insert or update on public.invoices for each row execute function private.check_org_links();
create trigger transaction_links before insert on public.transactions for each row execute function private.check_org_links();

-- Lock the invoice during confirmation: concurrent payment submissions cannot overpay.
create or replace function private.prevent_invoice_overpayment()
returns trigger language plpgsql set search_path = '' as $$
declare invoice_total bigint; paid_total numeric;
begin
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    raise exception 'A confirmed transaction cannot be changed';
  end if;
  if new.invoice_id is not null and new.status = 'confirmed' then
    select amount_vnd into invoice_total from public.invoices where id = new.invoice_id for update;
    select coalesce(sum(amount_vnd),0) into paid_total from public.transactions where invoice_id = new.invoice_id and status = 'confirmed';
    if paid_total + new.amount_vnd > invoice_total then
      raise exception 'Amount exceeds remaining invoice balance';
    end if;
  end if;
  return new;
end; $$;
create trigger no_overpay before insert or update of status on public.transactions for each row execute function private.prevent_invoice_overpayment();
create trigger trip_links before insert or update on public.trips for each row execute function private.check_org_links();

create or replace function private.write_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(organization_id,actor_id,entity,entity_id,action)
  values(new.organization_id,auth.uid(),tg_table_name,new.id,tg_op);
  return new;
end; $$;
create trigger audit_students after insert or update on public.students for each row execute function private.write_audit();
create trigger audit_vehicles after insert or update on public.vehicles for each row execute function private.write_audit();
create trigger audit_lessons after insert or update on public.lessons for each row execute function private.write_audit();
create trigger audit_invoices after insert or update on public.invoices for each row execute function private.write_audit();
create trigger audit_transactions after insert or update on public.transactions for each row execute function private.write_audit();
create trigger audit_trips after insert or update on public.trips for each row execute function private.write_audit();

-- DB recomputes GPS mileage from stored points, filtering noisy/jumped readings.
create or replace function public.finish_trip(p_trip_id uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_trip public.trips%rowtype; v_meters numeric;
begin
  select * into v_trip from public.trips where id=p_trip_id and created_by=(select auth.uid()) for update;
  if not found then raise exception 'Trip not found or access denied'; end if;
  if not private.has_role(v_trip.organization_id, array['manager','instructor']) then raise exception 'Trip access denied'; end if;
  if v_trip.status <> 'active' then raise exception 'Trip already finished'; end if;
  with ordered as (
    select latitude,longitude,accuracy_m,captured_at,
      lag(latitude) over w as prev_lat,
      lag(longitude) over w as prev_lon,
      lag(accuracy_m) over w as prev_acc,
      lag(captured_at) over w as prev_time
    from public.trip_points where trip_id=p_trip_id
    window w as (order by captured_at)
  ), segments as (
    select accuracy_m,prev_acc,
      extract(epoch from captured_at-prev_time) as seconds,
      2*6371000*asin(least(1.0,sqrt(
        power(sin(radians((latitude-prev_lat)/2)),2) +
        cos(radians(prev_lat))*cos(radians(latitude))*power(sin(radians((longitude-prev_lon)/2)),2)
      ))) as meters
    from ordered where prev_lat is not null
  )
  select coalesce(sum(meters) filter (
    where accuracy_m <= 50 and prev_acc <= 50 and seconds between 1 and 600
      and meters between 5 and 500 and meters/seconds <= 45
  ),0) into v_meters from segments;
  update public.trips set status='completed',finished_at=now(),distance_m=round(v_meters,2) where id=p_trip_id;
  return round(v_meters,2);
end; $$;
revoke all on function public.finish_trip(uuid) from public;
grant execute on function public.finish_trip(uuid) to authenticated;

-- Signup creates a non-privileged profile. Admin elevation is manual (see README).
create or replace function private.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id) values(new.id) on conflict do nothing;
  return new;
end; $$;
create trigger auth_new_user after insert on auth.users
for each row execute function private.on_auth_user_created();

alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.students enable row level security;
alter table public.vehicles enable row level security;
alter table public.lessons enable row level security;
alter table public.invoices enable row level security;
alter table public.transactions enable row level security;
alter table public.trips enable row level security;
alter table public.trip_points enable row level security;
alter table public.audit_events enable row level security;

-- SECURITY INVOKER means invoice calculations respect RLS on underlying tables.
create view public.invoice_balances with (security_invoker=true) as
select i.id,i.organization_id,i.student_id,i.code,i.amount_vnd,i.due_at,i.note,i.created_at,
       coalesce(sum(t.amount_vnd) filter (where t.status='confirmed' and t.kind='income'),0)::numeric as confirmed_vnd
from public.invoices i left join public.transactions t on t.invoice_id=i.id and t.organization_id=i.organization_id
group by i.id;

create or replace function public.get_month_summary(p_org uuid, p_month date)
returns table(income_vnd numeric,expense_vnd numeric,student_count bigint,gps_distance_m numeric)
language sql stable security invoker set search_path = '' as $$
  select
   (select coalesce(sum(amount_vnd),0) from public.transactions
      where organization_id=p_org and status='confirmed' and kind='income'
      and recorded_at >= (date_trunc('month',p_month::timestamp) at time zone 'Asia/Ho_Chi_Minh')
      and recorded_at < ((date_trunc('month',p_month::timestamp)+interval '1 month') at time zone 'Asia/Ho_Chi_Minh')),
   (select coalesce(sum(amount_vnd),0) from public.transactions
      where organization_id=p_org and status='confirmed' and kind='expense'
      and recorded_at >= (date_trunc('month',p_month::timestamp) at time zone 'Asia/Ho_Chi_Minh')
      and recorded_at < ((date_trunc('month',p_month::timestamp)+interval '1 month') at time zone 'Asia/Ho_Chi_Minh')),
   (select count(*) from public.students where organization_id=p_org and not archived),
   (select coalesce(sum(distance_m),0) from public.trips
      where organization_id=p_org and status='completed'
      and started_at >= (date_trunc('month',p_month::timestamp) at time zone 'Asia/Ho_Chi_Minh')
      and started_at < ((date_trunc('month',p_month::timestamp)+interval '1 month') at time zone 'Asia/Ho_Chi_Minh'))
  where private.is_member(p_org);
$$;
revoke all on function public.get_month_summary(uuid,date) from public;
grant execute on function public.get_month_summary(uuid,date) to authenticated;

grant select on public.invoice_balances to authenticated;

create policy platform_read on public.platform_settings for select to anon,authenticated using(true);
create policy platform_admin_insert on public.platform_settings for insert to authenticated with check(private.is_super_admin());
create policy platform_admin_update on public.platform_settings for update to authenticated using(private.is_super_admin()) with check(private.is_super_admin());
create policy profile_self_read on public.profiles for select to authenticated using(user_id = (select auth.uid()));
create policy profile_self_update on public.profiles for update to authenticated using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
-- Restrict profile self-updates to `full_name` at the SQL column-grant layer below.
create policy org_read on public.organizations for select to authenticated using(private.is_member(id));
create policy org_create on public.organizations for insert to authenticated with check(owner_id = (select auth.uid()));
create policy org_update on public.organizations for update to authenticated
 using(owner_id = (select auth.uid())) with check(owner_id = (select auth.uid()));
create policy subscription_read on public.billing_subscriptions for select to authenticated using(private.is_member(organization_id));
create policy membership_read on public.memberships for select to authenticated using(private.is_member(organization_id));
create policy membership_create on public.memberships for insert to authenticated
 with check(exists(select 1 from public.organizations where id=organization_id and owner_id=(select auth.uid())));
create policy membership_update on public.memberships for update to authenticated
 using(exists(select 1 from public.organizations where id=organization_id and owner_id=(select auth.uid())))
 with check(exists(select 1 from public.organizations where id=organization_id and owner_id=(select auth.uid())));
create policy membership_remove on public.memberships for delete to authenticated
 using(exists(select 1 from public.organizations where id=organization_id and owner_id=(select auth.uid())));

create policy student_read on public.students for select to authenticated using(private.is_member(organization_id));
create policy student_insert on public.students for insert to authenticated with check(private.has_role(organization_id,array['manager','instructor']));
create policy student_update on public.students for update to authenticated using(private.has_role(organization_id,array['manager','instructor'])) with check(private.has_role(organization_id,array['manager','instructor']));
create policy vehicle_read on public.vehicles for select to authenticated using(private.is_member(organization_id));
create policy vehicle_insert on public.vehicles for insert to authenticated with check(private.has_role(organization_id,array['manager']));
create policy vehicle_update on public.vehicles for update to authenticated using(private.has_role(organization_id,array['manager'])) with check(private.has_role(organization_id,array['manager']));
create policy lesson_read on public.lessons for select to authenticated using(private.is_member(organization_id));
create policy lesson_insert on public.lessons for insert to authenticated with check(private.has_role(organization_id,array['manager','instructor']));
create policy lesson_update on public.lessons for update to authenticated using(private.has_role(organization_id,array['manager','instructor'])) with check(private.has_role(organization_id,array['manager','instructor']));
create or replace function private.protect_paid_invoice() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.amount_vnd is distinct from old.amount_vnd or new.student_id is distinct from old.student_id)
     and exists (select 1 from public.transactions where invoice_id=old.id and status='confirmed') then
     raise exception 'Cannot modify an invoice that has confirmed payments';
  end if;
  return new;
end; $$;
create trigger invoice_protection before update on public.invoices for each row execute function private.protect_paid_invoice();
create policy invoice_read on public.invoices for select to authenticated using(private.is_member(organization_id));
create policy invoice_insert on public.invoices for insert to authenticated with check(private.has_role(organization_id,array['manager','accountant']));
create policy invoice_update on public.invoices for update to authenticated using(private.has_role(organization_id,array['manager','accountant'])) with check(private.has_role(organization_id,array['manager','accountant']));
create policy transaction_read on public.transactions for select to authenticated using(private.is_member(organization_id));
create policy transaction_insert on public.transactions for insert to authenticated with check(private.has_role(organization_id,array['manager','accountant']) and created_by=(select auth.uid()));
create policy trip_read on public.trips for select to authenticated using(private.is_member(organization_id));
create policy trip_insert on public.trips for insert to authenticated with check(private.has_role(organization_id,array['manager','instructor']) and created_by=(select auth.uid()) and status='active' and distance_m=0 and finished_at is null);
-- Client cannot update trip distance/status; only finish_trip() may close a trip.
create policy points_read on public.trip_points for select to authenticated using(exists(select 1 from public.trips t where t.id=trip_id and private.is_member(t.organization_id)));
create policy points_insert on public.trip_points for insert to authenticated with check(
 created_by=(select auth.uid()) and exists(select 1 from public.trips t where t.id=trip_id and t.created_by=(select auth.uid()) and t.status='active')
);
create policy audit_read on public.audit_events for select to authenticated using(private.has_role(organization_id,array['manager']));

-- Safe explicit grants, especially important if Data API's default privilege grant is disabled.
grant select on public.platform_settings to anon,authenticated;
grant insert,update on public.platform_settings to authenticated;
grant select on public.profiles to authenticated;
revoke update on public.profiles from anon,authenticated;
grant update(full_name) on public.profiles to authenticated;
grant select,insert,update on public.organizations to authenticated;
grant select,insert,update,delete on public.memberships to authenticated;
grant select,insert,update on public.students,public.vehicles,public.lessons,public.invoices to authenticated;
grant select,insert on public.trips to authenticated;
grant select,insert on public.transactions,public.trip_points to authenticated;
grant select on public.audit_events to authenticated;
grant select on public.billing_subscriptions,public.student_mileage to authenticated;

-- Only an organization owner can attach an already-registered account as staff.
-- Invitation emails are not sent by this function.
create or replace function public.add_existing_member(p_org uuid,p_email text,p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not exists(select 1 from public.organizations where id=p_org and owner_id=(select auth.uid())) then
    raise exception 'Only the owner may add staff';
  end if;
  if p_role not in ('manager','instructor','accountant','viewer') then raise exception 'Invalid member role'; end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'Email has not registered a user account'; end if;
  if v_user=(select auth.uid()) then raise exception 'Owner already has access'; end if;
  insert into public.memberships(organization_id,user_id,role) values(p_org,v_user,p_role)
    on conflict(organization_id,user_id) do update set role=excluded.role;
  return v_user;
end; $$;
revoke all on function public.add_existing_member(uuid,text,text) from public;
grant execute on function public.add_existing_member(uuid,text,text) to authenticated;
-- Only this RPC can transition a pending financial record to confirmed.
-- The earlier INSERT/UPDATE trigger serializes invoice balance checks.
create or replace function public.confirm_pending_transaction(p_transaction_id uuid,p_bank_reference text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.transactions%rowtype; v_ref text;
begin
  select * into v from public.transactions where id=p_transaction_id
    and private.has_role(organization_id,array['manager','accountant']) for update;
  if not found then raise exception 'Transaction not found or access denied'; end if;
  if v.status <> 'pending' then raise exception 'Transaction is not pending'; end if;
  v_ref=nullif(trim(coalesce(p_bank_reference,v.reference,'')),'');
  if v.method='transfer' and v_ref is null then raise exception 'Bank statement reference required'; end if;
  update public.transactions set status='confirmed',reference=v_ref where id=v.id;
  return v.id;
end; $$;
revoke all on function public.confirm_pending_transaction(uuid,text) from public;
grant execute on function public.confirm_pending_transaction(uuid,text) to authenticated;

create or replace function public.list_org_members(p_org uuid)
returns table(user_id uuid,email text,role text)
language sql stable security definer set search_path = '' as $$
  select m.user_id,u.email::text,m.role from public.memberships m
  join auth.users u on u.id=m.user_id
  where m.organization_id=p_org
    and exists(select 1 from public.organizations o where o.id=p_org and o.owner_id=(select auth.uid()));
$$;
revoke all on function public.list_org_members(uuid) from public;
grant execute on function public.list_org_members(uuid) to authenticated;
grant usage,select on sequence public.trip_points_id_seq to authenticated;
grant usage,select on sequence public.audit_events_id_seq to authenticated;
commit;
