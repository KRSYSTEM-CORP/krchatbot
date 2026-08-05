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
});

export const personalizationSchema = z.object({
  rolePrompt: z.string().max(20000).default(""),
  restrictions: z.string().max(8000).default(""),
  personality: z.string().max(2000).default(""),
  activationPrompt: z.string().max(4000).default(""),
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
