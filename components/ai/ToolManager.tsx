"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, Switch } from "@/components/ui/field";
import { Card, Badge, FormMessage, EmptyState } from "@/components/ui/misc";
import { saveCustomTool, deleteCustomTool, testCustomTool } from "@/lib/actions/ai";
import type { FormState } from "@/lib/validations";

type Tool = {
  id: string;
  name: string;
  description: string;
  method: string;
  endpoint: string;
  authType: string;
  authHeader: string;
  isActive: boolean;
  parameters: string;
};

const initial: FormState = { ok: true };

const SAMPLE_PARAMS = `[
  {
    "name": "numero_pedido",
    "type": "string",
    "description": "Número del pedido que consulta el cliente",
    "required": true
  }
]`;

export function ToolManager({ tools }: { tools: Tool[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Tool | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, action, saving] = useActionState(saveCustomTool, initial);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Conecta la IA a tus propios servicios: estado de un pedido, saldo de una cuenta,
          disponibilidad en inventario. El modelo decide cuál llamar leyendo el nombre y la
          descripción, así que ahí está el trabajo real de configurarla bien.
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nueva herramienta
        </Button>
      </div>

      {showForm ? (
        <Card>
          <form action={action} className="space-y-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Nombre"
                hint="En snake_case. Es lo primero que lee el modelo: get_order_status dice más que consulta1."
              >
                <Input
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  required
                  placeholder="consultar_estado_pedido"
                />
              </Field>

              <Field label="Método">
                <Select name="method" defaultValue={editing?.method ?? "GET"}>
                  <option value="GET">GET — consultar datos</option>
                  <option value="POST">POST — enviar datos</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Descripción"
              hint="Describe qué hace y CUÁNDO usarla. Esta frase es la que decide si la IA la llama o no."
            >
              <Textarea
                name="description"
                rows={3}
                defaultValue={editing?.description ?? ""}
                required
                placeholder="Consulta el estado actual de un pedido. Úsala cuando el cliente pregunte por su envío, su despacho o el seguimiento de una compra."
              />
            </Field>

            <Field label="URL del endpoint" hint="Debe ser HTTPS y estar accesible desde internet.">
              <Input
                name="endpoint"
                type="url"
                defaultValue={editing?.endpoint ?? ""}
                required
                placeholder="https://api.minegocio.com/pedidos"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Autenticación">
                <Select name="authType" defaultValue={editing?.authType ?? "NONE"}>
                  <option value="NONE">Sin autenticación</option>
                  <option value="BEARER">Bearer token</option>
                  <option value="API_KEY">API key en cabecera</option>
                  <option value="BASIC">Basic (usuario:clave)</option>
                </Select>
              </Field>

              <Field label="Nombre de la cabecera" hint="Sólo para API key.">
                <Input name="authHeader" defaultValue={editing?.authHeader ?? ""} placeholder="x-api-key" />
              </Field>

              <Field label="Valor" hint="Se guarda tal cual; usa una clave de sólo lectura.">
                <Input name="authValue" type="password" placeholder="••••••••" />
              </Field>
            </div>

            <Field
              label="Parámetros"
              hint="JSON con los datos que la IA debe extraer de la conversación para llamar al endpoint."
            >
              <Textarea
                name="parameters"
                rows={9}
                className="font-mono text-xs"
                defaultValue={editing?.parameters ?? SAMPLE_PARAMS}
              />
            </Field>

            <Switch
              name="isActive"
              defaultChecked={editing?.isActive ?? true}
              label="Herramienta activa"
              hint="Desactivada, la IA deja de verla sin perder la configuración."
            />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                Cancelar
              </Button>
              <FormMessage state={state} />
            </div>
          </form>
        </Card>
      ) : null}

      {testOutput ? (
        <Card className="space-y-2">
          <p className="text-sm font-medium">Respuesta del endpoint</p>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{testOutput}</pre>
          <Button size="sm" variant="ghost" onClick={() => setTestOutput(null)}>
            Cerrar
          </Button>
        </Card>
      ) : null}

      {tools.length === 0 ? (
        <EmptyState
          title="Sin herramientas conectadas"
          description="La IA sólo puede responder con lo que está en la base de conocimiento. Con una herramienta puede además consultar datos en vivo de tus sistemas."
        />
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <Card key={tool.id} className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                    {tool.name}
                  </code>
                  <Badge tone={tool.isActive ? "success" : "neutral"}>
                    {tool.isActive ? "Activa" : "Inactiva"}
                  </Badge>
                  <Badge>{tool.method}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{tool.endpoint}</p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await testCustomTool(tool.id, {});
                      setTestOutput(result.output ?? result.error ?? "Sin respuesta");
                    })
                  }
                  title="Llamar al endpoint sin parámetros para comprobar que responde"
                >
                  <PlugZap className="h-4 w-4" />
                  Probar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(tool);
                    setShowForm(true);
                  }}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteCustomTool(tool.id);
                      router.refresh();
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
