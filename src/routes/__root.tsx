import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";

import { AuthProvider } from "@/features/auth/auth-provider";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-7xl text-gradient-gold">404</p>
        <h1 className="mt-4 text-xl font-medium tracking-tight text-foreground">
          We couldn't find that page
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be broken, or the page may have moved.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Back to Flux Menu
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: unknown }) {
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-medium tracking-tight">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não foi possível carregar esta tela. Tente novamente.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Reload
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Flux Menu — Digital Menus for Bars & Restaurants" },
      {
        name: "description",
        content:
          "Flux Menu is the digital menu platform for modern bars and restaurants. QR ordering, kitchen display, and real-time operations.",
      },
      { name: "theme-color", content: "#111111" },
      { property: "og:title", content: "Flux Menu — Digital Menus for Bars & Restaurants" },
      {
        property: "og:description",
        content:
          "QR ordering, kitchen display, and real-time operations — built for hospitality teams that care about craft.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "oklch(0.21 0 0)",
              border: "1px solid oklch(0.295 0 0)",
              color: "oklch(0.96 0.012 80)",
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
