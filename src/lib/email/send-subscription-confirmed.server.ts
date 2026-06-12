// Server-only helper: sends the "subscription confirmed" email via Resend gateway.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

const PLAN_LABEL: Record<string, string> = {
  basic: "Basic",
  essential: "Essential",
  pro: "Pro",
};

function renderHtml(planLabel: string, displayName: string | null): string {
  const greeting = displayName ? `Olá, ${displayName}!` : "Olá!";
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0b0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e7e7ea;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0f;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:linear-gradient(180deg,#15151c 0%,#0f0f15 100%);border:1px solid #26262e;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:32px 40px 8px 40px;">
            <div style="font-size:13px;letter-spacing:2px;color:#9b9ba3;text-transform:uppercase;">Flux</div>
            <h1 style="margin:16px 0 8px 0;font-size:26px;line-height:1.25;color:#ffffff;font-weight:700;">
              Assinatura confirmada! 🎉
            </h1>
            <p style="margin:0;font-size:15px;color:#b8b8c1;">${greeting}</p>
          </td></tr>
          <tr><td style="padding:16px 40px 8px 40px;">
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#d4d4dc;">
              Seu pagamento foi processado com sucesso e seu plano <strong style="color:#ffffff;">${planLabel}</strong> já está ativo.
              O Flux agora é seu braço direito para automatizar pedidos, chamadas de garçom e análises do seu restaurante.
            </p>
            <div style="background:#1a1a22;border:1px solid #2a2a34;border-radius:12px;padding:16px 20px;margin:20px 0;">
              <div style="font-size:12px;color:#9b9ba3;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Plano ativado</div>
              <div style="font-size:18px;color:#ffffff;font-weight:600;">${planLabel}</div>
            </div>
          </td></tr>
          <tr><td style="padding:8px 40px 32px 40px;" align="center">
            <a href="https://flux.app/dashboard" style="display:inline-block;background:#ffffff;color:#0b0b0f;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;">
              Ir para o painel
            </a>
            <p style="margin:24px 0 0 0;font-size:13px;color:#7a7a85;line-height:1.6;">
              Dúvidas? Responda este email — estamos por aqui.
            </p>
          </td></tr>
          <tr><td style="padding:20px 40px;border-top:1px solid #1f1f27;font-size:12px;color:#6a6a75;" align="center">
            © Flux · Pedidos inteligentes para restaurantes
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendSubscriptionConfirmedEmail(opts: {
  to: string;
  planType: string;
  displayName?: string | null;
}): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) {
    console.error("[email] Missing LOVABLE_API_KEY or RESEND_API_KEY");
    return;
  }

  const planLabel = PLAN_LABEL[opts.planType] ?? opts.planType;
  const html = renderHtml(planLabel, opts.displayName ?? null);

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: "Flux App <onboarding@resend.dev>",
      to: [opts.to],
      subject: "Assinatura Confirmada! O Flux agora é seu braço direito.",
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[email] Resend gateway error", res.status, body);
    return;
  }
  console.log("[email] Subscription confirmation sent to", opts.to);
}
