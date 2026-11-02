create policy "Authenticated users can read organizations" on public.organizations for select to authenticated using (true);
create policy "Authenticated users can insert organizations" on public.organizations for insert to authenticated with check (true);
create policy "Authenticated users can update organizations" on public.organizations for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete organizations" on public.organizations for delete to authenticated using (true);

create policy "Authenticated users can read contacts" on public.contacts for select to authenticated using (true);
create policy "Authenticated users can insert contacts" on public.contacts for insert to authenticated with check (true);
create policy "Authenticated users can update contacts" on public.contacts for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete contacts" on public.contacts for delete to authenticated using (true);

create policy "Authenticated users can read organization_contacts" on public.organization_contacts for select to authenticated using (true);
create policy "Authenticated users can insert organization_contacts" on public.organization_contacts for insert to authenticated with check (true);
create policy "Authenticated users can update organization_contacts" on public.organization_contacts for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete organization_contacts" on public.organization_contacts for delete to authenticated using (true);
