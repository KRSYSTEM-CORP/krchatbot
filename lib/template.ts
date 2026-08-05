// Sustitución de variables para los envíos masivos: {{ nombre }} toma el valor
// de ese destinatario, y {{ nombre || "cliente" }} usa el respaldo cuando el
// dato falta. El respaldo no es un adorno — sin él, un destinatario sin nombre
// recibe un mensaje con un hueco en medio, y eso sale multiplicado por cuantos
// destinatarios tenga la lista.
//
// Vive fuera de lib/actions porque un archivo "use server" sólo puede exportar
// funciones asíncronas, y esta la necesitan tanto las acciones como el cron.
export function renderVariables(
  template: string,
  variables: Record<string, string>,
  name: string,
): string {
  const rendered = template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) => {
    const [key, fallbackRaw] = expression.split("||").map((part) => part.trim());
    const fallback = fallbackRaw?.replace(/^['"]|['"]$/g, "") ?? "";
    if (key === "nombre") return name || fallback;
    return variables[key] || fallback;
  });

  // Un hueco vacío deja la puntuación colgando: "Hola {{ nombre }}, ..." se
  // convierte en "Hola , ..." para quien no tiene nombre cargado. Se recoge el
  // espacio sobrante antes del signo y se colapsan los dobles espacios, que es
  // lo que separa un mensaje personalizado de uno que se nota generado.
  return rendered
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
