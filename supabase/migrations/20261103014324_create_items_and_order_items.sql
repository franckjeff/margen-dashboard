-- Items: the garments MARGEN makes (e.g. Women's Racerback). item_code is the human-readable ID.
create table public.items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique check (length(btrim(item_code)) > 0),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

alter table public.items enable row level security;

create policy "Admins have full access to items" on public.items
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Order lines: how many of an item, in which size, an order contains.
-- Sizes follow the order spreadsheet: adult XS to 3XL, junior 2 to 16. Must match SIZES in app.js.
-- An item can't be deleted while an order uses it; an order's lines go with the order.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  size text not null check (size in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '2', '4', '6', '8', '10', '12', '14', '16')),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  constraint order_items_one_line_per_size unique (order_id, item_id, size)
);

create index order_items_item_id_idx on public.order_items (item_id);

alter table public.order_items enable row level security;

create policy "Admins have full access to order items" on public.order_items
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Order lines show in the order's history as item_added, item_changed and item_removed events,
-- with changes { item, size, quantity: { "from": old, "to": new } } (item stored by name).
alter table public.order_events drop constraint order_events_action_check;
alter table public.order_events add constraint order_events_action_check
  check (action in ('created', 'updated', 'deleted', 'item_added', 'item_changed', 'item_removed'));

create function private.log_order_item_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_order uuid := coalesce(new.order_id, old.order_id);
  order_code text;
  old_item text;
  new_item text;
begin
  -- Lines removed because their order was deleted: the order's own "deleted" event covers them.
  select margen_order_id into order_code from public.orders where id = line_order;
  if not found then
    return null;
  end if;

  if tg_op = 'UPDATE' and (new.item_id, new.size, new.quantity, new.order_id) is not distinct from (old.item_id, old.size, old.quantity, old.order_id) then
    return null;
  end if;

  if tg_op <> 'INSERT' then
    select name into old_item from public.items where id = old.item_id;
  end if;
  if tg_op <> 'DELETE' then
    select name into new_item from public.items where id = new.item_id;
  end if;

  insert into public.order_events (order_id, margen_order_id, action, changes, changed_by)
  values (
    line_order,
    order_code,
    case tg_op when 'INSERT' then 'item_added' when 'UPDATE' then 'item_changed' else 'item_removed' end,
    jsonb_build_object(
      'item', jsonb_build_object('from', old_item, 'to', new_item),
      'size', jsonb_build_object('from', case when tg_op <> 'INSERT' then old.size end, 'to', case when tg_op <> 'DELETE' then new.size end),
      'quantity', jsonb_build_object('from', case when tg_op <> 'INSERT' then old.quantity end, 'to', case when tg_op <> 'DELETE' then new.quantity end)
    ),
    (select id from public.profiles where id = auth.uid())
  );
  return null;
end;
$$;

revoke all on function private.log_order_item_event() from public, anon, authenticated;

create trigger order_items_audit
  after insert or update or delete on public.order_items
  for each row execute function private.log_order_item_event();

-- Starting catalog: the garments on MARGEN's order spreadsheet.
insert into public.items (item_code, name) values
  ('MEN-TANK', 'Men''s Tank'),
  ('MEN-SLEEVELESS', 'Men''s Sleeveless'),
  ('MEN-SS', 'Men''s Short Sleeve'),
  ('MEN-LS', 'Men''s Long Sleeve'),
  ('MEN-HOODIE', 'Men''s Hoodie'),
  ('WMN-RACERBACK', 'Women''s Racerback'),
  ('WMN-SS', 'Women''s Short Sleeve'),
  ('WMN-LS', 'Women''s Long Sleeve'),
  ('WMN-HOODIE', 'Women''s Hoodie'),
  ('JR-SS', 'Junior Short Sleeve'),
  ('JR-LS', 'Junior Long Sleeve');
