-- Allow active members to delete only their own group messages.
begin;
drop policy if exists student_messages_delete_own on public.student_messages;
create policy student_messages_delete_own on public.student_messages for delete to authenticated
  using (user_id = auth.uid() and public.is_active());
create table if not exists public.student_members (user_id uuid primary key references public.profiles(id) on delete cascade, joined_at timestamptz not null default now());
alter table public.student_members enable row level security;
insert into public.student_members (user_id) select distinct user_id from public.student_messages on conflict do nothing;
create or replace function public.student_group_info() returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Sign in required'; end if;
  insert into public.student_members(user_id) values(auth.uid()) on conflict do nothing;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', coalesce(nullif(p.username,''), nullif(p.name,''), 'Student'), 'avatar_url', p.avatar_url) order by coalesce(nullif(p.username,''), nullif(p.name,''), 'Student')) from public.student_members m join public.profiles p on p.id=m.user_id where not p.suspended), '[]'::jsonb);
end $$;
revoke all on function public.student_group_info() from public, anon;
grant execute on function public.student_group_info() to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('student-chat-images','student-chat-images',false,4194304,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists student_chat_images_read on storage.objects;
create policy student_chat_images_read on storage.objects for select to authenticated using(bucket_id='student-chat-images' and public.is_active());
drop policy if exists student_chat_images_upload on storage.objects;
create policy student_chat_images_upload on storage.objects for insert to authenticated with check(bucket_id='student-chat-images' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());
drop policy if exists student_chat_images_delete on storage.objects;
create policy student_chat_images_delete on storage.objects for delete to authenticated using(bucket_id='student-chat-images' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());
commit;
