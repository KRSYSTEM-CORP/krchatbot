// Contrato que agent.ts, training.ts y las acciones de asistencia usan sin
// saber si del otro lado hay Claude o Gemini. Cada proveedor traduce esto a
// la forma nativa de su API — bloques de contenido para Anthropic, "steps"
// para la API de Interactions de Gemini — en vez de forzar un formato común
// con forma de mínimo común denominador que termine sirviéndole mal a los dos.

export type Effort = "low" | "medium" | "high";

// Igual a un JSON Schema de tipo objeto: es lo que ya usan tanto el
// input_schema de las herramientas de Anthropic como el response_format de
// Gemini, así que reutilizarlo tal cual evita una tercera representación.
export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, unknown>;
  // `readonly` para que los esquemas declarados con `as const` (la forma
  // natural de escribirlos en agent.ts y training.ts) se acepten tal cual.
  required?: readonly string[];
  additionalProperties?: boolean;
};

export type ToolSpec = {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ConverseResult = {
  text: string;
  toolCalls: ToolCall[];
  // El modelo se negó a continuar (filtro de seguridad, contenido bloqueado).
  // Ninguna de las dos APIs garantiza texto utilizable en ese caso.
  refused: boolean;
};

// Una conversación con herramientas es más que "mandar mensajes": cada
// proveedor necesita acumular su propio estado nativo entre turnos (el
// arreglo `messages` de Anthropic, el arreglo `steps` de Gemini). Por eso es
// un objeto con memoria y no una función pura — el estado nativo vive dentro
// de la implementación de cada proveedor, nunca en agent.ts.
export interface Conversation {
  run(): Promise<ConverseResult>;
  addToolResults(results: { id: string; name: string; result: string }[]): void;
}

export interface AiProvider {
  readonly name: "anthropic" | "gemini";

  // Clasificación con salida JSON estructurada, sin herramientas. Se usa para
  // decidir si el agente responde y para marcar mensajes importantes: son
  // decisiones binarias sobre un texto corto, no conversaciones.
  classify<T>(input: {
    system: string;
    message: string;
    schema: JsonSchemaObject;
    effort: Effort;
  }): Promise<T | null>;

  // Arranca una conversación con herramientas a partir de un único mensaje de
  // usuario (el hilo de WhatsApp ya viene colapsado a un solo turno — ver
  // agent.ts). Se ejecuta llamando a `run()` y, si trae `toolCalls`,
  // resolviéndolas y devolviéndolas con `addToolResults` antes de repetir.
  startConversation(input: {
    system: string;
    tools: ToolSpec[];
    opening: string;
    effort: Effort;
  }): Conversation;

  // Texto libre sin herramientas: resumir un chat, redactar un borrador,
  // traducir o pulir un mensaje.
  respond(input: { system: string; message: string; effort: Effort }): Promise<string>;
}
