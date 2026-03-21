/**
 * reset.ts — Drop all application tables and re-run migrations + seed.
 *
 * Intended for local development only. Never run against production.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx packages/db/src/reset.ts
 */

import postgres from "postgres";

async function reset() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    console.error("[FATAL] db:reset must not be run in production.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });

  console.log("Dropping all application tables...\n");

  // Drop in dependency order (children before parents)
  await client`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
      ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `;

  // Drop custom enums
  await client`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT typname FROM pg_type
        WHERE typtype = 'e' AND typnamespace = (
          SELECT oid FROM pg_namespace WHERE nspname = 'public'
        )
      ) LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
      END LOOP;
    END $$;
  `;

  // Drop the drizzle migrations tracking table
  await client`DROP TABLE IF EXISTS drizzle.__drizzle_migrations CASCADE`;
  await client`DROP SCHEMA IF EXISTS drizzle CASCADE`;

  console.log("✓ All tables and enums dropped\n");

  await client.end();
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
