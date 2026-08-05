import { MessagesSquare } from "lucide-react";

export const metadata = { title: "Bandeja — KR ChatBot" };

// Panel derecho vacío en escritorio. En el teléfono no se ve nunca: allí la
// lista ocupa toda la pantalla hasta que se abre un chat.
export default function InboxIndexPage() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-2 text-center md:flex">
      <MessagesSquare className="h-10 w-10 text-muted-foreground" />
      <p className="font-medium">Elige una conversación</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Todos los números conectados llegan a esta misma bandeja. Filtra por etiqueta para ver
        sólo lo tuyo.
      </p>
    </div>
  );
}
