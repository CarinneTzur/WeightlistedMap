-- Run in STAGING first. Links a real approved coach profile to the founder login.
-- Does not create an account, change passwords, or grant administrator access.
begin;
do $$
declare founder_id uuid; application_id uuid;
begin
 select id into founder_id from auth.users where lower(email)='getweightlisted@gmail.com';
 if founder_id is null then raise exception 'Create the founder account in this project first.'; end if;
 if not exists(select 1 from public.profiles where user_id=founder_id and is_admin=true) then
  raise exception 'Founder account must already be an administrator.';
 end if;
 select id into application_id from public.coach_applications where user_id=founder_id
 order by (status='approved') desc,created_at desc limit 1;
 if application_id is null then
  insert into public.coach_applications(user_id,first_name,last_name,email,coach_title,
   public_name,public_title,status,reviewed_at,profile_visible,accepting_requests,
   city,state,gym_name,gym_city,gym_state,gym_zip,latitude,longitude,
   specialties,bio,online_training,remote_available,in_person_coaching,coaching_formats,admin_notes)
  values(founder_id,'Weightlisted','Founder','getweightlisted@gmail.com','Personal Trainer',
   'Weightlisted Founder','Strength & Wellness Coach','approved',now(),true,true,
   'New York','NY','Anytime Fitness','New York','NY','10001',40.7506,-73.9972,
   array['Powerlifting','General Fitness','Nutrition'],
   'Founder test coaching profile. Location is sample data for testing.',true,true,true,
   array['Online','In-person'],'Founder testing profile linked to the founder account.')
  returning id into application_id;
 else
  update public.coach_applications set status='approved',reviewed_at=coalesce(reviewed_at,now()),
   public_name='Weightlisted Founder',profile_visible=true,accepting_requests=true
  where id=application_id;
 end if;
 update public.profiles set coach_enabled=true where user_id=founder_id;
end;
$$;
commit;
select id,public_name,status from public.coach_applications
where user_id=(select id from auth.users where lower(email)='getweightlisted@gmail.com');
