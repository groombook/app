-- Clean up existing duplicate services before adding unique constraint.
-- Keep the row with the lowest id per name; delete all others.
DELETE FROM services WHERE id NOT IN (
  SELECT (MIN(id::text))::uuid FROM services GROUP BY name
);

ALTER TABLE "services" ADD CONSTRAINT "services_name_unique" UNIQUE("name");