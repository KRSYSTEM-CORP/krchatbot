import "server-only";
import { GoogleGenAI, ThinkingLevel, type Content } from "@google/genai";
import type {
  AiProvider,
  Conversation,
  ConverseResult,
  Effort,
  JsonSchemaObject,
  ToolSpec,
} from "./types";

// `gemini-flash-latest` es un alias que Google mantiene apuntando a su mejor
// modelo Flash vigente — evita que este archivo quede obsoleto cada vez que
// sale una versión nueva. Se puede fijar una versión concreta por variable de
// entorno si se prefiere estabilidad sobre estar siempre al día.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const MAX_TOOL_TURNS = 6;

let cached: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  cached ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return cached;
}

function thinkingLevel(effort: Effort): ThinkingLevel {
  if (effort === "low") return ThinkingLevel.LOW;
  if (effort === "high") return ThinkingLevel.HIGH;
  return ThinkingLevel.MEDIUM;
}

// `parametersJsonSchema` acepta JSON Schema estándar tal cual — el mismo
// objeto que ya usan las herramientas de Anthropic — así que no hace falta
// traducir a la representación propia de Gemini (`Schema`/`Type`), que es un
// formato distinto y sin ganancia real para lo que hacemos aquí.
function toGeminiTools(tools: ToolSpec[]) {
  if (tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parameters,
      })),
    },
  ];
}

class GeminiConversation implements Conversation {
  // El historial completo viaja en cada llamada (Gemini no tiene un
  // equivalente documentado y estable al "previous_response_id" de otras
  // APIs para esta forma de uso) — es más verboso, pero su formato es el
  // estándar y documentado `Content[]`.
  private history: Content[];
  private tools: ReturnType<typeof toGeminiTools>;
  private turns = 0;

  constructor(
    private system: string,
    tools: ToolSpec[],
    private effort: Effort,
    opening: string,
  ) {
    this.tools = toGeminiTools(tools);
    this.history = [{ role: "user", parts: [{ text: opening }] }];
  }

  addToolResults(results: { id: string; name: string; result: string }[]): void {
    this.history.push({
      role: "user",
      parts: results.map((r) => ({
        functionResponse: { id: r.id, name: r.name, response: { output: r.result } },
      })),
    });
  }

  async run(): Promise<ConverseResult> {
    if (this.turns++ >= MAX_TOOL_TURNS) {
      return { text: "", toolCalls: [], refused: false };
    }

    const response = await client().models.generateContent({
      model: MODEL,
      contents: this.history,
      config: {
        systemInstruction: this.system,
        tools: this.tools,
        thinkingConfig: { thinkingLevel: thinkingLevel(this.effort) },
      },
    });

    // El propio turno del modelo (incluidas sus llamadas a función) se
    // reinyecta tal cual en el historial — es la forma documentada de que el
    // siguiente turno sepa qué function_call está respondiendo.
    const content = response.candidates?.[0]?.content;
    if (content) this.history.push(content);

    const text = response.text ?? "";
    const toolCalls = (response.functionCalls ?? []).map((call, index) => ({
      id: call.id ?? `${this.turns}-${index}`,
      name: call.name ?? "",
      input: call.args ?? {},
    }));

    // Ni texto ni llamada a herramienta suele significar que el filtro de
    // seguridad cortó la respuesta. No hay un motivo explícito y homogéneo
    // entre modelos para distinguirlo de una respuesta legítimamente vacía,
    // así que se trata igual que un rechazo: es la lectura más segura.
    const refused = !text && toolCalls.length === 0;

    return { text, toolCalls, refused };
  }
}

export const geminiProvider: AiProvider = {
  name: "gemini",

  async classify<T>(input: {
    system: string;
    message: string;
    schema: JsonSchemaObject;
    effort: Effort;
  }): Promise<T | null> {
    const response = await client().models.generateContent({
      model: MODEL,
      contents: input.message,
      config: {
        systemInstruction: input.system,
        thinkingConfig: { thinkingLevel: thinkingLevel(input.effort) },
        responseMimeType: "application/json",
        responseJsonSchema: input.schema,
      },
    });

    const text = response.text;
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  },

  startConversation(input: {
    system: string;
    tools: ToolSpec[];
    opening: string;
    effort: Effort;
  }): Conversation {
    return new GeminiConversation(input.system, input.tools, input.effort, input.opening);
  },

  async respond(input: { system: string; message: string; effort: Effort }): Promise<string> {
    const response = await client().models.generateContent({
      model: MODEL,
      contents: input.message,
      config: {
        systemInstruction: input.system,
        thinkingConfig: { thinkingLevel: thinkingLevel(input.effort) },
      },
    });

    return response.text ?? "";
  },
};
