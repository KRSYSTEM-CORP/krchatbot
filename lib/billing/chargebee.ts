import "server-only";

// Cliente delgado sobre la API REST de Chargebee — sin su SDK oficial, que es
// pesado y en su mayoría genera código para operaciones que no usamos. Mismo
// patrón que lib/evolution.ts: una función `call()` central, y cada endpoint
// como una función con nombre.
//
// Chargebee es quien procesa el pago: esta app nunca ve ni toca un número de
// tarjeta. El checkout y el portal de autogestión son páginas alojadas por
// Chargebee — aquí sólo se pide la URL y se redirige.

export class ChargebeeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ChargebeeError";
  }
}

function site(): string {
  const value = process.env.CHARGEBEE_SITE;
  if (!value) throw new ChargebeeError("Falta CHARGEBEE_SITE (ver .env.example)", 0);
  return value;
}

function apiKey(): string {
  const value = process.env.CHARGEBEE_API_KEY;
  if (!value) throw new ChargebeeError("Falta CHARGEBEE_API_KEY (ver .env.example)", 0);
  return value;
}

export function chargebeeConfigured(): boolean {
  return Boolean(process.env.CHARGEBEE_SITE && process.env.CHARGEBEE_API_KEY);
}

async function call<T>(path: string, body?: Record<string, string>): Promise<T> {
  const url = `https://${site()}.chargebee.com/api/v2${path}`;
  // Chargebee usa HTTP Basic con la clave de API como usuario y clave vacía
  // — no un Bearer token.
  const auth = Buffer.from(`${apiKey()}:`).toString("base64");

  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new ChargebeeError(
      `Chargebee ${path} → ${response.status}: ${text.slice(0, 300)}`,
      response.status,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// Página de pago alojada por Chargebee para arrancar una suscripción nueva.
// `planId` es el "item price id" que se define en su panel (Product Catalog
// 2.0), no algo que este código invente.
export async function createCheckoutUrl(input: {
  orgId: string;
  planId: string;
  email: string;
  name: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const data = await call<{ hosted_page: { url: string } }>(
    "/hosted_pages/checkout_new_for_items",
    {
      "subscription_items[item_price_id][0]": input.planId,
      "subscription_items[quantity][0]": "1",
      "customer[email]": input.email,
      "customer[first_name]": input.name,
      // Campo personalizado (Settings → Custom Fields → Customer, id
      // "cf_org_id") para poder ubicar la organización desde el webhook del
      // primer evento, antes de que exista un chargebeeCustomerId guardado.
      "customer[cf_org_id]": input.orgId,
      redirect_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
  );
  return data.hosted_page.url;
}

// Portal de autogestión: cambiar de plan, actualizar la tarjeta, cancelar.
// Todo eso vive en la página alojada de Chargebee — no hay que construir
// ninguna de esas pantallas.
export async function createPortalSessionUrl(
  chargebeeCustomerId: string,
  redirectUrl: string,
): Promise<string> {
  const data = await call<{ portal_session: { access_url: string } }>("/portal_sessions", {
    "customer[id]": chargebeeCustomerId,
    redirect_url: redirectUrl,
  });
  return data.portal_session.access_url;
}

// Chargebee firma sus webhooks con HTTP Basic (usuario/clave que se definen
// al crear el webhook en su panel) — no con una firma HMAC como otros
// proveedores. Sin esto, cualquiera que adivine la URL podría mandar eventos
// falsos que activen o cancelen suscripciones.
export function verifyWebhookAuth(authorizationHeader: string | null): boolean {
  const user = process.env.CHARGEBEE_WEBHOOK_USER;
  const password = process.env.CHARGEBEE_WEBHOOK_PASSWORD;
  if (!user || !password) return false;
  if (!authorizationHeader?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(authorizationHeader.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;

  return decoded.slice(0, separator) === user && decoded.slice(separator + 1) === password;
}
