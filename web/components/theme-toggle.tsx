"use client";

import { MonitorCog, MoonStar, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import type { ThemeMode } from "@/lib/theme";
import { THEME_STORAGE_KEY, applyTheme } from "@/lib/theme";

const cycleOrder: ThemeMode[] = ["light", "dark", "system"];

function iconFor(mode: ThemeMode) {
  if (mode === "light") return <Sun size={16} />;
  if (mode === "dark") return <MoonStar size={16} />;
  return <MonitorCog size={16} />;
}

function labelFor(mode: ThemeMode): string {
  if (mode === "light") return "Light";
  if (mode === "dark") return "Dark";
  return "System";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initial = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setMode(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    const onSystemThemeChange = () => {
      if (mode === "system") {
        applyTheme(mode);
      }
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, [mode]);

  const nextMode = () => {
    const index = cycleOrder.indexOf(mode);
    const next = cycleOrder[(index + 1) % cycleOrder.length];
    setMode(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <button className="btn btn-secondary icon-btn" type="button" onClick={nextMode} title={`Tema: ${labelFor(mode)}`}>
      {iconFor(mode)}
      <span>{labelFor(mode)}</span>
    </button>
  );
}

