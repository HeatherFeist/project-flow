import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useOnboardingStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ["onboarding_status", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", userId)
        .maybeSingle();
      // No profile row yet (brand-new signup) counts as "not completed" —
      // that's exactly the case the wizard exists for.
      return { completed: data?.onboarding_completed ?? false };
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, onboarding_completed: true });
      if (error) throw error;
    },
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_status", userId] });
    },
  });
}
