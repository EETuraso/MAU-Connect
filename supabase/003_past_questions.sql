-- Apply after 002_admin_dashboard.sql.
begin;

create table if not exists public.past_questions(
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title) between 3 and 160),
  course text not null check(length(course) between 2 and 120),
  level text not null check(length(level) between 1 and 40),
  year integer not null check(year between 2000 and 2100),
  file_url text not null,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now()
);
create index if not exists past_questions_course_year_idx on public.past_questions(course, year desc);
alter table public.past_questions enable row level security;
create policy past_questions_read on public.past_questions for select using(true);
create policy past_questions_admin_insert on public.past_questions for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy past_questions_admin_delete on public.past_questions for delete to authenticated using(public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('past-questions','past-questions',true,10485760,array['application/pdf'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy past_questions_files_read on storage.objects for select using(bucket_id='past-questions');
create policy past_questions_files_admin_upload on storage.objects for insert to authenticated with check(bucket_id='past-questions' and public.is_admin());
create policy past_questions_files_admin_delete on storage.objects for delete to authenticated using(bucket_id='past-questions' and public.is_admin());

commit;
