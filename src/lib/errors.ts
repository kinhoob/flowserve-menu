export type ErrorDetails = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function getErrorDetails(error: unknown): ErrorDetails {
  if (typeof error === "string") return { message: error };
  if (!error || typeof error !== "object") return { message: "Ocorreu um erro inesperado." };
  const record = error as Record<string, unknown>;
  return {
    message: typeof record.message === "string" ? record.message : "Ocorreu um erro inesperado.",
    code: typeof record.code === "string" ? record.code : undefined,
    details: typeof record.details === "string" ? record.details : undefined,
    hint: typeof record.hint === "string" ? record.hint : undefined,
  };
}
