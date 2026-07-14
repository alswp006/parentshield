import { loadEntitlement, saveEntitlement } from "@/lib/storage/repo";

export async function getEffectivePremium(): Promise<boolean> {
  const entitlement = await loadEntitlement();
  return (
    entitlement.isPremium === true &&
    entitlement.expiresAtISO !== null &&
    new Date().toISOString() < entitlement.expiresAtISO
  );
}

export async function normalizeEntitlementIfExpired(): Promise<void> {
  const entitlement = await loadEntitlement();
  if (!entitlement.isPremium) return;

  const effective = await getEffectivePremium();
  if (effective) return;

  await saveEntitlement({ ...entitlement, isPremium: false });
}
