-- Supabase may grant privileges directly to API roles as well as via PUBLIC.
-- Reset only DriveLedger objects and grant the operations used by the application.
revoke all privileges on public.platform_settings, public.profiles,
  public.organizations, public.memberships, public.billing_subscriptions,
  public.students, public.vehicles, public.lessons, public.invoices,
  public.transactions, public.trips, public.trip_points, public.audit_events,
  public.student_mileage, public.invoice_balances from public, anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
grant insert, update on public.platform_settings to authenticated;
grant select, update(full_name) on public.profiles to authenticated;
grant select, insert, update on public.organizations, public.students, public.vehicles,
  public.lessons, public.invoices to authenticated;
grant select, insert on public.transactions, public.trips, public.trip_points to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select on public.billing_subscriptions, public.audit_events,
  public.student_mileage, public.invoice_balances to authenticated;

revoke all on sequence public.trip_points_id_seq, public.audit_events_id_seq from public, anon, authenticated;
grant usage on sequence public.trip_points_id_seq to authenticated;

-- Keep privileged implementations out of the exposed API schema. Existing clients
-- keep their RPC names, argument names and return types through invoker wrappers.
alter function public.finish_trip(uuid) set schema private;
alter function public.add_existing_member(uuid, text, text) set schema private;
alter function public.confirm_pending_transaction(uuid, text) set schema private;
alter function public.list_org_members(uuid) set schema private;

create function public.finish_trip(p_trip_id uuid)
returns numeric language sql security invoker set search_path = '' as $$
  select private.finish_trip(p_trip_id)
$$;
create function public.add_existing_member(p_org uuid, p_email text, p_role text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.add_existing_member(p_org, p_email, p_role)
$$;
create function public.confirm_pending_transaction(p_transaction_id uuid, p_bank_reference text default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.confirm_pending_transaction(p_transaction_id, p_bank_reference)
$$;
create function public.list_org_members(p_org uuid)
returns table(user_id uuid, email text, role text)
language sql stable security invoker set search_path = '' as $$
  select * from private.list_org_members(p_org)
$$;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(uuid), private.has_role(uuid,text[]), private.is_super_admin(),
  private.finish_trip(uuid), private.add_existing_member(uuid,text,text),
  private.confirm_pending_transaction(uuid,text), private.list_org_members(uuid) to authenticated;
revoke all on function public.finish_trip(uuid), public.add_existing_member(uuid,text,text),
  public.confirm_pending_transaction(uuid,text), public.list_org_members(uuid),
  public.get_month_summary(uuid,date) from public, anon, authenticated;
grant execute on function public.finish_trip(uuid), public.add_existing_member(uuid,text,text),
  public.confirm_pending_transaction(uuid,text), public.list_org_members(uuid),
  public.get_month_summary(uuid,date) to authenticated;
notify pgrst, 'reload schema';
