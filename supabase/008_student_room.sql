-- Apply before deploying the student chat update.
begin;
grant update(username, avatar_url) on public.profiles to authenticated;
create or replace function public.student_room_messages() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Sign in required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', m.id, 'user_id', m.user_id, 'body', m.body, 'created_at', m.created_at,
    'user', jsonb_build_object('username', coalesce(nullif(p.username,''), nullif(p.name,''), 'Student'), 'avatar_url', p.avatar_url)
  ) order by m.created_at, m.id) from (
    select id, user_id, body, created_at from public.student_messages order by created_at desc, id desc limit 100
  ) m join public.profiles p on p.id=m.user_id), '[]'::jsonb);
end $$;
revoke all on function public.student_room_messages() from public, anon;
grant execute on function public.student_room_messages() to authenticated;
commit;
