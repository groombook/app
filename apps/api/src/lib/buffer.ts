import { eq } from "@groombook/db";
import { bufferTimeRules, services, type Db } from "@groombook/db";

export async function resolveBufferMinutes({
  serviceId,
  sizeCategory,
  coatType,
  db,
}: {
  serviceId: string;
  sizeCategory: string | null;
  coatType: string | null;
  db: Db;
}): Promise<number> {
  // Query all rules for this service in one DB call
  const allRules = await db
    .select()
    .from(bufferTimeRules)
    .where(eq(bufferTimeRules.serviceId, serviceId));

  // Priority 1: exact match (serviceId + sizeCategory + coatType all match)
  const exact = allRules.find(
    (r) =>
      r.sizeCategory === sizeCategory &&
      r.coatType === coatType
  );
  if (exact) return exact.bufferMinutes;

  // Priority 2: service + size, null coatType
  const serviceSize = allRules.find(
    (r) =>
      r.sizeCategory === sizeCategory &&
      r.coatType === null
  );
  if (serviceSize) return serviceSize.bufferMinutes;

  // Priority 3: service + coat, null sizeCategory
  const serviceCoat = allRules.find(
    (r) =>
      r.sizeCategory === null &&
      r.coatType === coatType
  );
  if (serviceCoat) return serviceCoat.bufferMinutes;

  // Priority 4: service only (null sizeCategory, null coatType)
  const serviceOnly = allRules.find(
    (r) =>
      r.sizeCategory === null &&
      r.coatType === null
  );
  if (serviceOnly) return serviceOnly.bufferMinutes;

  // Priority 5: fallback to service.defaultBufferMinutes
  const [service] = await db
    .select({ defaultBufferMinutes: services.defaultBufferMinutes })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);

  if (service?.defaultBufferMinutes != null) {
    return service.defaultBufferMinutes;
  }

  // Priority 6: final fallback to 0
  return 0;
}