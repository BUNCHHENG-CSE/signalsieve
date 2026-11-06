"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon-sm" className="h-7 w-7 text-muted-foreground opacity-70">
        <Moon className="h-3.5 w-3.5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-7 w-7 text-muted-foreground hover:text-foreground transition-all"
      title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5 text-amber-400 transition-transform hover:rotate-45" />
      ) : (
        <Moon className="h-3.5 w-3.5 text-slate-700 transition-transform hover:-rotate-12" />
      )}
      <span className="sr-only">Toggle Theme</span>
    </Button>
  );
}
