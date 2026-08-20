// Shared helper for logging into the structured communications timeline
// (docs/schema_v18_client_messages.sql) — used by every function that
// sends or receives an SMS/call, so a client's Communications tab
// actually reflects reality instead of only what got appended to notes.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function logClientMessage(
  supabase: SupabaseClient,
  params: {
    ownerId: string;
    clientId: string;
    channel: "sms" | "call" | "email";
    direction: "inbound" | "outbound";
    body: string;
  },
): Promise<void> {
  await supabase.from("client_messages").insert({
    owner_id: params.ownerId,
    client_id: params.clientId,
    channel: params.channel,
    direction: params.direction,
    body: params.body,
  });
}
