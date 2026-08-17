import { supabase } from "@/lib/supabase";
import { buildClientLookup, matchClientId } from "@/lib/csv";

/**
 * Resolves each {name, email} entry to an existing client's id (matched by
 * email, then exact name), creating a new client for any that don't match
 * anything — deduped so the same new client isn't created twice across
 * multiple rows referencing them. Entries with no name resolve to null
 * (caller should skip those rows).
 */
export async function resolveClientIds(
  ownerId: string,
  entries: { name: string; email: string | null }[],
): Promise<(string | null)[]> {
  const { data: existing, error } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("owner_id", ownerId);
  if (error) throw error;

  const lookup = buildClientLookup(existing ?? []);
  const results: (string | null)[] = new Array(entries.length).fill(null);
  const toCreate = new Map<string, { name: string; email: string | null }>();

  entries.forEach((entry, i) => {
    if (!entry.name) return;
    const existingId = matchClientId(lookup, entry.name, entry.email);
    if (existingId) {
      results[i] = existingId;
      return;
    }
    const key = entry.email?.trim().toLowerCase() || entry.name.trim().toLowerCase();
    toCreate.set(key, entry);
  });

  if (toCreate.size > 0) {
    const newRows = Array.from(toCreate.values()).map((e) => ({
      owner_id: ownerId,
      name: e.name,
      email: e.email,
      phone: null,
      address: null,
      notes: null,
      source: "import",
    }));
    const { data: created, error: createError } = await supabase
      .from("clients")
      .insert(newRows)
      .select("id, name, email");
    if (createError) throw createError;

    const newLookup = buildClientLookup(created ?? []);
    entries.forEach((entry, i) => {
      if (results[i] || !entry.name) return;
      const id = matchClientId(newLookup, entry.name, entry.email);
      if (id) results[i] = id;
    });
  }

  return results;
}
