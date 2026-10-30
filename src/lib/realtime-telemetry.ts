// Telemetria de latência do Realtime.
// Mede o tempo entre o INSERT no banco (payload.new.created_at) e a
// chegada do evento no cliente (Date.now()). Loga métricas agregadas e
// dispara alertas quando ultrapassa o limite configurado.

import { toast } from "sonner";

export type RealtimeSource = "kds" | "waiter" | "orders" | "calls" | string;

export type LatencySample = {
  source: RealtimeSource;
  table: string;
  event: string;
  latencyMs: number;
  at: number;
};

// Limite padrão em ms — acima disso disparamos alerta.
export const REALTIME_LATENCY_THRESHOLD_MS = Number(
  import.meta.env.VITE_REALTIME_LATENCY_THRESHOLD_MS || 3000,
);

// Janela de deduplicação para não spamar toasts em burst.
const ALERT_COOLDOWN_MS = 30_000;

const samples: LatencySample[] = [];
const MAX_SAMPLES = 200;
let lastAlertAt = 0;

function pushSample(sample: LatencySample) {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

function fireAlert(sample: LatencySample) {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;
  console.warn(
    `[realtime-telemetry] latência alta: ${sample.latencyMs}ms em ${sample.table} (${sample.source}) — limite ${REALTIME_LATENCY_THRESHOLD_MS}ms`,
    sample,
  );
  try {
    toast.warning("Sincronização lenta detectada", {
      description: `Evento ${sample.table} levou ${(sample.latencyMs / 1000).toFixed(1)}s para chegar (limite ${(REALTIME_LATENCY_THRESHOLD_MS / 1000).toFixed(1)}s).`,
      duration: 5000,
    });
  } catch {
    /* toast pode não estar disponível fora do app */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("flux:realtime-slow", { detail: sample }));
  }
}

/** Extrai o `created_at` do payload do postgres_changes. */
type RealtimePayload = {
  new?: { created_at?: string };
  old?: { created_at?: string };
  table?: string;
  eventType?: string;
  event?: string;
};

function extractCreatedAt(payload: RealtimePayload): number | null {
  const raw = payload?.new?.created_at ?? payload?.old?.created_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Mede latência de um evento postgres_changes.
 * Usa `created_at` do payload como origem, `Date.now()` na chegada.
 * Só considera INSERTs recentes (< 60s) para evitar contabilizar
 * updates em linhas antigas.
 */
export function recordRealtimeEvent(
  source: RealtimeSource,
  payload: RealtimePayload,
): LatencySample | null {
  const table = payload?.table ?? "unknown";
  const event = payload?.eventType ?? payload?.event ?? "unknown";
  const createdAt = extractCreatedAt(payload);
  if (createdAt == null) return null;

  const now = Date.now();
  const latencyMs = now - createdAt;
  // Ignora eventos com created_at antigo (> 60s) — não representam ciclo real.
  if (latencyMs < 0 || latencyMs > 60_000) return null;

  const sample: LatencySample = { source, table, event, latencyMs, at: now };
  pushSample(sample);

  if (latencyMs > REALTIME_LATENCY_THRESHOLD_MS) {
    fireAlert(sample);
  }
  return sample;
}

/** Estatísticas resumidas das amostras em memória. */
export function getRealtimeStats() {
  if (samples.length === 0) {
    return { count: 0, avg: 0, p95: 0, max: 0, threshold: REALTIME_LATENCY_THRESHOLD_MS };
  }
  const sorted = [...samples].map((s) => s.latencyMs).sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    p95: sorted[p95Idx],
    max: sorted[sorted.length - 1],
    threshold: REALTIME_LATENCY_THRESHOLD_MS,
  };
}

/** Limpa amostras (útil em testes). */
export function resetRealtimeTelemetry() {
  samples.length = 0;
  lastAlertAt = 0;
}
