import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { applyThemeChoice, getThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme";

/**
 * Light/dark switch for the header: flips between light and dark and remembers the choice.
 * The system default (no manual choice) is managed from Settings.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setChoice(getThemeChoice());
    setDark(
      document.documentElement.dataset.theme === "dark" ||
        (document.documentElement.dataset.theme !== "light" &&
          window.matchMedia?.("(prefers-color-scheme: dark)").matches),
    );
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const listener = () => setDark(document.documentElement.dataset.theme !== "light" && !!media?.matches);
    media?.addEventListener("change", listener);
    return () => media?.removeEventListener("change", listener);
  }, []);

  function toggle() {
    const next: ThemeChoice = dark ? "light" : "dark";
    setThemeChoice(next);
    applyThemeChoice(next);
    setChoice(next);
    setDark(next === "dark");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className={`k-focus grid size-11 place-items-center rounded-full text-ink hover:bg-surface-alt ${className ?? ""}`}
    >
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}
