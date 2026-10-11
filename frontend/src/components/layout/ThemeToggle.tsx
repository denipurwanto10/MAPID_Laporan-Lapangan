import { Moon, Sun } from "lucide-react";
import { Button } from "../ui/button";
import type { Theme } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  className?: string;
}

export function ThemeToggle({ theme, onToggle, className }: ThemeToggleProps) {
  const dark = theme === "dark";
  const label = dark ? "Aktifkan mode terang" : "Aktifkan mode gelap";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={cn(className)}
    >
      {dark ? (
        <Sun aria-hidden="true" className="size-4" />
      ) : (
        <Moon aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}
