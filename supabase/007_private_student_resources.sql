-- Apply only after the version using /api/resources is live and verified.
begin;
update storage.buckets set public=false where id in ('past-questions','handouts');
drop policy if exists past_questions_files_read on storage.objects;
drop policy if exists handouts_files_read on storage.objects;
create policy student_resource_files_read on storage.objects for select to authenticated
  using(bucket_id in ('past-questions','handouts') and public.is_active());
drop policy if exists past_questions_read on public.past_questions;
create policy past_questions_read on public.past_questions for select to authenticated using(public.is_active());
drop policy if exists handouts_read on public.handouts;
create policy handouts_read on public.handouts for select to authenticated using(public.is_active());
commit;
