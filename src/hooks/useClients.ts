import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/types/domain";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["clients", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Client;
    },
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<Client, "name" | "email" | "phone" | "address" | "notes"> & { owner_id: string }) => {
      const { data, error } = await supabase.from("clients").insert(input).select().single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export interface ClientProperty {
  id: string;
  owner_id: string;
  client_id: string;
  label: string;
  address: string;
  notes: string | null;
}

export function useClientProperties(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client_properties", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_properties")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at");
      if (error) throw error;
      return data as ClientProperty[];
    },
  });
}

export function useAddClientProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ClientProperty, "id">) => {
      const { error } = await supabase.from("client_properties").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["client_properties", variables.client_id] });
    },
  });
}

export function useDeleteClientProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase.from("client_properties").delete().eq("id", id);
      if (error) throw error;
      return clientId;
    },
    onSuccess: (clientId) => {
      queryClient.invalidateQueries({ queryKey: ["client_properties", clientId] });
    },
  });
}

export function useClientJobPhotos(jobIds: string[]) {
  return useQuery({
    queryKey: ["client_job_photos", jobIds],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_photos")
        .select("id, url, caption, created_at, job_id")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data as { id: string; url: string; caption: string | null; created_at: string; job_id: string }[];
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useImportClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      rows: (Pick<Client, "name" | "email" | "phone" | "address" | "notes"> & { owner_id: string })[],
    ) => {
      // Chunk to keep each request comfortably under Supabase's payload/row
      // limits even for a large exported client list.
      const CHUNK_SIZE = 200;
      let imported = 0;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from("clients").insert(chunk);
        if (error) throw error;
        imported += chunk.length;
      }
      return imported;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
