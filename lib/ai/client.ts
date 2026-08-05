import "server-only";
import type { AiProvider, Effort } from "./providers/types";

// Selecciona el motor de IA según qué clave haya en el entorno. Claude tiene
// prioridad si ambas están puestas — es el que da mejor calidad de
// razonamiento y llamado a herramientas — pero Gemini corre con clave
// gratuita (aistudio.google.com/apikey, sin tarjeta) y es una alternativa
// real, no un simulacro: el mismo agente, las mismas herramientas, la misma
// base de conocimiento.
//
// El resto del código de IA (agent.ts, training.ts, las acciones de
// asistencia) habla contra la interfaz AiProvider y nunca importa un SDK de
// proveedor directamente — así añadir un tercero el día de mañana es escribir
// un archivo en providers/, no tocar la lógica del agente.

export type { Effort } from "./providers/types";

let cached: AiProvider | null = null;

export function aiIsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
}

export function aiProviderName(): "anthropic" | "gemini" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export async function getAiProvider(): Promise<AiProvider> {
  if (cached) return cached;

  if (process.env.ANTHROPIC_API_KEY) {
    const { anthropicProvider } = await import("./providers/anthropic");
    cached = anthropicProvider;
  } else if (process.env.GEMINI_API_KEY) {
    const { geminiProvider } = await import("./providers/gemini");
    cached = geminiProvider;
  } else {
    throw new Error(
      "Falta una clave de IA: pon ANTHROPIC_API_KEY o GEMINI_API_KEY en el .env (ver .env.example).",
    );
  }
  return cached;
}

// El agente que le responde a un cliente en WhatsApp compite con su
// paciencia, así que corre en esfuerzo medio.
export const REPLY_EFFORT: Effort = "medium";

// Los clasificadores (activación, flagging) son una decisión binaria sobre un
// texto corto: esfuerzo bajo, sin necesidad de razonar largo.
export const CLASSIFY_EFFORT: Effort = "low";
