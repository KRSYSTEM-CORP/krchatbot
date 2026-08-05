"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { day: string; entrantes: number; salientes: number; ia: number };

// Tres series apiladas para leer de un vistazo qué proporción del trabajo se
// llevó la IA frente al equipo. Los colores salen de las variables del tema
// para que la gráfica siga funcionando en modo oscuro.
export function MessageChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* El margen derecho existe para que el día de hoy —el que todo el
            mundo mira primero— no quede cortado contra el borde del panel. */}
        <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--muted-foreground)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="out" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--success)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--success)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="ai" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          <Area
            type="monotone"
            dataKey="entrantes"
            stackId="1"
            stroke="var(--muted-foreground)"
            fill="url(#in)"
            name="Entrantes"
          />
          <Area
            type="monotone"
            dataKey="salientes"
            stackId="1"
            stroke="var(--success)"
            fill="url(#out)"
            name="Del equipo"
          />
          <Area
            type="monotone"
            dataKey="ia"
            stackId="1"
            stroke="var(--primary)"
            fill="url(#ai)"
            name="De la IA"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
