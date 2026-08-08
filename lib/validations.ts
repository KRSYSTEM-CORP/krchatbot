import { z } from "zod";

export const signupSchema = z.object({
  orgName: z.string().trim().min(2, "El nombre del negocio es muy corto").max(80),
  name: z.string().trim().min(2, "Tu nombre es muy corto").max(80),
  email: z.email("Correo inválido").toLowerCase(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const loginSchema = z.object({
  email: z.email("Correo inválido").toLowerCase(),
  password: z.string().min(1, "Escribe tu contraseña"),
});

export const requestPasswordResetSchema = z.object({
  email: z.email("Correo inválido").toLowerCase(),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const phoneSchema = z.object({
  label: z.string().trim().min(2, "Ponle un nombre al número").max(40),
});

export const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  body: z.string().trim().min(1, "El mensaje está vacío").max(4000),
});

export const noteSchema = z.object({
  chatId: z.string().min(1),
  body: z.string().trim().min(1, "La nota está vacía").max(2000),
  mentions: z.array(z.string()).default([]),
});

export const ticketSchema = z.object({
  chatId: z.string().optional(),
  messageId: z.string().optional(),
  title: z.string().trim().min(3, "El título es muy corto").max(140),
  description: z.string().trim().max(4000).default(""),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assigneeId: z.string().optional(),
  dueAt: z.string().optional(),
});

export const taskSchema = z.object({
  chatId: z.string().optional(),
  title: z.string().trim().min(3, "El título es muy corto").max(140),
  notes: z.string().trim().max(2000).default(""),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assigneeId: z.string().optional(),
  dueAt: z.string().optional(),
});

export const labelSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido").default("#4f3ddb"),
});

export const inviteSchema = z.object({
  // Se aceptan varios correos separados por coma: dar de alta a un equipo
  // entero uno por uno es la clase de fricción que hace que nadie lo use.
  emails: z.string().trim().min(3, "Escribe al menos un correo"),
  name: z.string().trim().max(80).default(""),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  labelIds: z.array(z.string()).default([]),
  password: z.string().min(8, "La contraseña temporal debe tener 8 caracteres o más"),
});

export const agentSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  nickname: z.string().trim().min(1).max(40),
  activation: z.enum(["AUTO", "MANUAL"]),
  canSendMessages: z.boolean().default(false),
  canCreateTickets: z.boolean().default(true),
  canCreatePrivateNotes: z.boolean().default(true),
  responseDelaySeconds: z.coerce.number().int().min(0).max(600),
  snoozeMinutes: z.coerce.number().int().min(1).max(1440),
  allowedPhoneIds: z.array(z.string()).default([]),
  businessHoursEnabled: z.boolean().default(false),
  businessHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM"),
  businessHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM"),
  businessHoursDays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  businessHoursAwayMessage: z.string().trim().max(1000).default(""),
});

export const personalizationSchema = z.object({
  rolePrompt: z.string().max(20000).default(""),
  restrictions: z.string().max(8000).default(""),
  personality: z.string().max(2000).default(""),
  activationPrompt: z.string().max(4000).default(""),
  formatRules: z.string().max(4000).default(""),
  ticketRules: z.string().max(4000).default(""),
  privateNoteRules: z.string().max(4000).default(""),
  flaggingPrompt: z.string().max(4000).default(""),
});

export const knowledgeSchema = z.object({
  id: z.string().optional(),
  question: z.string().trim().min(3, "Escribe la pregunta").max(4000),
  answer: z.string().trim().min(1, "Escribe la respuesta").max(8000),
  instructions: z.string().trim().max(2000).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "NEEDS_REVIEW"]).default("ACTIVE"),
});

export const customToolSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,48}$/, "Usa snake_case: solo minúsculas, números y _"),
  description: z.string().trim().min(10, "Describe cuándo debe usarla la IA").max(2000),
  method: z.enum(["GET", "POST"]),
  endpoint: z.url("Debe ser una URL https válida"),
  authType: z.enum(["NONE", "BEARER", "API_KEY", "BASIC"]).default("NONE"),
  authValue: z.string().default(""),
  authHeader: z.string().default(""),
  parameters: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.enum(["string", "number", "boolean"]),
        description: z.string().default(""),
        required: z.boolean().default(false),
      }),
    )
    .default([]),
  isActive: z.boolean().default(true),
});

export const broadcastSchema = z.object({
  name: z.string().trim().min(2, "Ponle un nombre al envío").max(80),
  phoneId: z.string().min(1, "Elige el número desde el que sale"),
  body: z.string().trim().min(1, "El mensaje está vacío").max(4000),
  mediaUrl: z.string().default(""),
  scheduledAt: z.string().default(""),
  repeat: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"),
  throttleSeconds: z.coerce.number().int().min(3).max(120).default(8),
  recipients: z.string().trim().min(1, "Agrega al menos un destinatario"),
});

export const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Ponle un nombre a la regla").max(80),
  trigger: z.enum([
    "MESSAGE_RECEIVED",
    "CHAT_CREATED",
    "LABEL_ADDED",
    "LABEL_REMOVED",
    "MESSAGE_FLAGGED",
    "REACTION_ADDED",
    "TICKET_CREATED",
    "SLA_BREACHED",
  ]),
  isActive: z.boolean().default(true),
  phoneIds: z.array(z.string()).default([]),
  conditions: z.string().default('{"op":"AND","items":[]}'),
  actions: z.string().default("[]"),
});

// ── Facturación de mantenimiento (manual — ver lib/billing.ts) ─────────────

export const paymentMethodSchema = z.enum(["TRANSFER", "PAGO_MOVIL", "ZELLE", "BINANCE", "OTHER"]);

export const PAYMENT_METHODS_REQUIRING_REFERENCE = ["TRANSFER", "PAGO_MOVIL", "BINANCE"] as const;

const toCents = (v: number) => Math.round(v * 100);
const blankToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

const paymentReportLineSchema = z.object({
  paymentMethod: paymentMethodSchema,
  amount: z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents),
  reference: z.preprocess(blankToUndefined, z.string().trim().optional()),
});

export const paymentReportSchema = z
  .object({
    lines: z.array(paymentReportLineSchema),
    proofImageDataUrl: z
      .string()
      .trim()
      .min(1, "El comprobante de pago es obligatorio")
      .refine((v) => v.startsWith("data:image/"), "Comprobante inválido")
      .refine((v) => v.length < 3_000_000, "El comprobante es demasiado grande"),
    note: z.preprocess(blankToUndefined, z.string().trim().optional()),
  })
  .superRefine((data, ctx) => {
    if (data.lines.length === 0) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Agrega al menos un método de pago" });
      return;
    }
    data.lines.forEach((line, i) => {
      if (
        (PAYMENT_METHODS_REQUIRING_REFERENCE as readonly string[]).includes(line.paymentMethod) &&
        !line.reference
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "reference"],
          message: "El número de referencia es obligatorio para este método de pago",
        });
      }
    });
  });

export const maintenancePaymentSchema = z.object({
  amount: z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents),
  periodEnd: z.coerce.date(),
  note: z.preprocess(blankToUndefined, z.string().trim().optional()),
});

export const rejectPaymentReportSchema = z.object({
  reviewNote: z.preprocess(blankToUndefined, z.string().trim().optional()),
});

export const platformSettingsSchema = z.object({
  paymentInstructions: z.preprocess(blankToUndefined, z.string().trim().optional()),
  binanceQrDataUrl: z.preprocess(blankToUndefined, z.string().trim().optional()),
  binanceId: z.preprocess(blankToUndefined, z.string().trim().optional()),
  billingExchangeRate: z.coerce.number().positive("La tasa debe ser mayor a 0").optional(),
  defaultMonthlyFee: z.preprocess(
    blankToUndefined,
    z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents).optional(),
  ),
});

export type FormState = { ok: boolean; error?: string; message?: string };

export const OK: FormState = { ok: true };

export function fail(error: string): FormState {
  return { ok: false, error };
}

// Traduce un error de zod al primer mensaje legible, que es lo único que el
// formulario muestra.
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos";
}
