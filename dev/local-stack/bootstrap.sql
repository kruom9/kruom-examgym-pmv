-- Local-only stand-in for the roles/schemas that a real Supabase project (or `supabase start`) already has.
-- Used by dev/local-stack/start.sh when Docker is not available. NEVER run this on the real project.
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;
create role authenticator login noinherit password 'local-dev-only';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login createrole noinherit password 'local-dev-only';

create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role, postgres;
alter role supabase_auth_admin set search_path = auth;

create schema if not exists extensions;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
-- hosted Supabase also auto-grants table privileges to anon/authenticated; our migration revokes them explicitly,
-- so we mimic that here to make sure the revoke really is in the migration.
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

alter database postgres set search_path = "$user", public, extensions;
