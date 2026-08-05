import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AiProvider,
  Conversation,
  ConverseResult,
  Effort,
  JsonSchemaObject,
  ToolSpec,
} from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const MAX_TOOL_TURNS = 6;

let cached: Anthropic | null = null;
function client(): Anthropic {
  cached ??= new Anthropic();
  return cached;
}

function toAnthropicTools(tools: ToolSpec[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // El SDK de Anthropic pide `required` mutable; el nuestro lo acepta
    // `readonly` para no forzar a agent.ts a abandonar `as const`. Una copia
    // superficial reconcilia ambos sin arriesgar nada: es un arreglo de
    // strings, no una estructura que valga la pena mutar en el origen.
    input_schema: { ...tool.parameters, required: tool.parameters.required?.slice() },
  }));
}

class AnthropicConversation implements Conversation {
  private messages: Anthropic.MessageParam[];
  private turns = 0;

  constructor(
    private system: string,
    private tools: Anthropic.Tool[],
    private effort: Effort,
    opening: string,
  ) {
    this.messages = [{ role: "user", content: opening }];
  }

  addToolResults(results: { id: string; name: string; result: string }[]): void {
    const blocks: Anthropic.ToolResultBlockParam[] = results.map((r) => ({
      type: "tool_result",
      tool_use_id: r.id,
      content: r.result,
    }));
    // Todos los resultados van en un único mensaje de usuario: repartirlos en
    // varios le enseña al modelo a pedir herramientas en paralelo de más.
    this.messages.push({ role: "user", content: blocks });
  }

  async run(): Promise<ConverseResult> {
    if (this.turns++ >= MAX_TOOL_TURNS) {
      return { text: "", toolCalls: [], refused: false };
    }

    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: this.effort },
      system: this.system,
      tools: this.tools,
      messages: this.messages,
    });

    if (response.stop_reason === "refusal") {
      return { text: "", toolCalls: [], refused: true };
    }

    this.messages.push({ role: "assistant", content: response.content });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));

    return { text, toolCalls, refused: false };
  }
}

export const anthropicProvider: AiProvider = {
  name: "anthropic",

  async classify<T>(input: {
    system: string;
    message: string;
    schema: JsonSchemaObject;
    effort: Effort;
  }): Promise<T | null> {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 512,
      // Sin herramientas y con salida estructurada: apagar el pensamiento aquí
      // es seguro y recorta la latencia de cada mensaje entrante.
      thinking: { type: "disabled" },
      output_config: {
        effort: input.effort,
        format: { type: "json_schema", schema: input.schema },
      },
      system: input.system,
      messages: [{ role: "user", content: input.message }],
    });

    const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!block) return null;
    try {
      return JSON.parse(block.text) as T;
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
    return new AnthropicConversation(
      input.system,
      toAnthropicTools(input.tools),
      input.effort,
      input.opening,
    );
  },

  async respond(input: { system: string; message: string; effort: Effort }): Promise<string> {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 1536,
      thinking: input.effort === "low" ? { type: "disabled" } : { type: "adaptive" },
      output_config: { effort: input.effort },
      system: input.system,
      messages: [{ role: "user", content: input.message }],
    });

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  },
};
