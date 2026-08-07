import { COPYRIGHT_LINE } from "@/lib/legal";

export function SiteFooter() {
  return (
    <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
      {COPYRIGHT_LINE}
    </footer>
  );
}
