-- Apply after 003_past_questions.sql.
begin;

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text not null default '';
create unique index if not exists profiles_username_unique on public.profiles(lower(username)) where username is not null and username <> '';

create table if not exists public.handouts(
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title) between 3 and 160),
  course text not null check(length(course) between 2 and 120),
  description text not null default '',
  file_url text not null,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now()
);
create table if not exists public.student_messages(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  body text not null check(length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists student_messages_created_at_idx on public.student_messages(created_at desc);

alter table public.handouts enable row level security;
alter table public.student_messages enable row level security;
create policy handouts_read on public.handouts for select using(true);
create policy handouts_admin_insert on public.handouts for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy student_messages_read on public.student_messages for select to authenticated using(true);
create policy student_messages_insert on public.student_messages for insert to authenticated with check(user_id=auth.uid() and public.is_active());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('student-avatars','student-avatars',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy student_avatars_read on storage.objects for select using(bucket_id='student-avatars');
create policy student_avatars_upload on storage.objects for insert to authenticated with check(bucket_id='student-avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());

commit;
