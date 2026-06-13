const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

function renderWelcomeHtml(displayName: string | null): string {
  const greeting = displayName ? `Olá, ${displayName}!` : "Olá!";
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#07070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e7e7ea;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07070a;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:linear-gradient(180deg,#15151c 0%,#0b0b11 100%);border:1px solid #2a2418;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px -30px rgba(212,175,90,0.18);">
          <tr><td style="height:3px;background:linear-gradient(90deg,#7a5a1c 0%,#d4af5a 50%,#7a5a1c 100%);"></td></tr>
          <tr><td style="padding:36px 40px 8px 40px;">
            <div style="font-size:12px;letter-spacing:3px;color:#d4af5a;text-transform:uppercase;font-weight:600;">Flux</div>
            <h1 style="margin:18px 0 10px 0;font-size:28px;line-height:1.25;color:#ffffff;font-weight:700;letter-spacing:-0.01em;">
              Bem-vindo ao Flux <span style="color:#d4af5a;">🚀</span>
            </h1>
            <p style="margin:0;font-size:15px;color:#b8b8c1;">${greeting} Seu salão está prestes a evoluir.</p>
          </td></tr>
          <tr><td style="padding:20px 40px 8px 40px;">
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#d4d4dc;">
              Olá! É um prazer ter você no <strong style="color:#ffffff;">Flux</strong>. Estamos aqui para transformar a
              agilidade do seu atendimento. Seu próximo passo é cadastrar seu primeiro cardápio e gerar seus
              <strong style="color:#d4af5a;">QR Codes</strong>.
            </p>
            <div style="background:#13131a;border:1px solid #2a2418;border-radius:14px;padding:20px 22px;margin:22px 0;">
              <div style="font-size:11px;color:#d4af5a;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;font-weight:600;">Primeiros passos</div>
              <ol style="margin:0;padding-left:20px;color:#d4d4dc;font-size:14px;line-height:1.9;">
                <li>Configure seu restaurante e cardápio</li>
                <li>Gere QR Codes para as mesas</li>
                <li>Receba pedidos e chamadas em tempo real</li>
              </ol>
            </div>
          </td></tr>
          <tr><td style="padding:12px 40px 36px 40px;" align="center">
            <a href="https://flux.app/dashboard" style="display:inline-block;background:linear-gradient(180deg,#e6c478 0%,#c79a3d 100%);color:#1a1408;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 12px 30px -10px rgba(212,175,90,0.5);">
              Acessar meu Painel
            </a>
            <p style="margin:26px 0 0 0;font-size:13px;color:#7a7a85;line-height:1.6;">
              Precisa de ajuda? Responda este email — a gente lê tudo.
            </p>
          </td></tr>
          <tr><td style="padding:22px 40px;border-top:1px solid #1f1a10;font-size:12px;color:#6a6a75;" align="center">
            © Flux · Pedidos inteligentes para restaurantes
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendWelcomeEmail(opts: {
  to: string;
  displayName?: string | null;
}): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) {
    console.error("[email] Missing LOVABLE_API_KEY or RESEND_API_KEY");
    return;
  }

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
      subject: "Bem-vindo ao Flux! 🚀 Seu salão está prestes a evoluir.",
      html: renderWelcomeHtml(opts.displayName ?? null),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[email] Welcome send error", res.status, body);
    return;
  }
  console.log("[email] Welcome email sent to", opts.to);
}
