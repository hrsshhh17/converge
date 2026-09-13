-- Workspace operations require an authenticated session. Prevent exposed
-- SECURITY DEFINER helpers from being called through the anonymous API role.
do $$
declare fn record;
begin
  for fn in
    select n.nspname, p.proname,
      pg_get_function_identity_arguments(p.oid) as args,
      p.prorettype as return_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon',
      fn.nspname, fn.proname, fn.args
    );
    if fn.return_type <> 'trigger'::regtype then
      execute format(
        'grant execute on function %I.%I(%s) to authenticated',
        fn.nspname, fn.proname, fn.args
      );
    end if;
  end loop;
end $$;
