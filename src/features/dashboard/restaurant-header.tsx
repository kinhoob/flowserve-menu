import { useQuery } from "@tanstack/react-query";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { getServiceStatus } from "@/features/restaurant/service-hours";
export function RestaurantHeader() {
  const { data: r } = useRestaurant();
  const status = useQuery({
    queryKey: ["dashboard-service-status", r?.id],
    enabled: !!r,
    queryFn: () => getServiceStatus(r!.id),
    refetchInterval: 30000,
    staleTime: 15000,
    retry: false,
  });
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-semibold">{r?.name ?? "Seu restaurante"}</p>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">
        {status.isError
          ? "Horários indisponíveis"
          : !status.data
            ? "Consultando horários…"
            : status.data.setupPending
              ? "Configure os horários"
              : "Cozinha " +
                (status.data.kitchen_open ? "aberta" : "fechada") +
                " · Bar " +
                (status.data.bar_open ? "aberto" : "fechado")}
      </p>
    </div>
  );
}
