-- Enable INSERT notifications for the native Supabase Realtime chat subscription.
-- Apply after 013_student_chat_upgrades.sql.

begin;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_messages'
  ) then
    alter publication supabase_realtime add table public.student_messages;
  end if;
exception when undefined_object then
  -- Local or older Supabase instances may not expose the managed publication yet.
  null;
end;
$$;

commit;
