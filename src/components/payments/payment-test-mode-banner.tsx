const clientToken = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-center text-xs text-red-300">
        Pagamentos indisponíveis. Entre em contato com o estabelecimento.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
        Todos os pagamentos no preview são em modo de teste. Use o cartão{" "}
        <span className="font-mono">4242 4242 4242 4242</span> com qualquer validade futura e CVC.
      </div>
    );
  }
  return null;
}
