import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Download, Monitor, CheckCircle2 } from "lucide-react";
import { GradientButton } from "@/components/k";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PwaState = { installed: boolean; canInstall: boolean; busy: boolean; message: string; install: () => Promise<void> };
const PwaContext = createContext<PwaState>({ installed: false, canInstall: false, busy: false, message: "", install: async () => undefined });

export function PwaProvider({ children }: { children: ReactNode }) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const syncMode = () => setInstalled(mode.matches);
    const onPrompt = (next: Event) => { next.preventDefault(); setEvent(next as InstallEvent); setMessage(""); };
    const onInstalled = () => { setInstalled(true); setEvent(null); setMessage(""); };
    syncMode();
    mode.addEventListener("change", syncMode);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Avoid caching development builds or the live-reload client.
    if (import.meta.env.PROD && window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/kamino-sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
    return () => {
      mode.removeEventListener("change", syncMode);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = async () => {
    if (!event || busy) return;
    setBusy(true);
    setEvent(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(choice.outcome === "accepted" ? "Installation requested. Your browser will finish adding Kamino." : "You can install later from your browser menu.");
    } catch {
      setMessage("The install window could not open. Try your browser's install option.");
    } finally { setBusy(false); }
  };
  return <PwaContext.Provider value={{ installed, canInstall: Boolean(event), busy, message, install }}>{children}</PwaContext.Provider>;
}

export function DesktopInstallCard() {
  const pwa = useContext(PwaContext);
  return <section className="k-card hidden space-y-3 rounded-card p-3.5 md:block lg:p-5" aria-labelledby="desktop-install-title">
    <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-full bg-tint-violet text-violet"><Monitor className="size-[17px]" aria-hidden /></span><h2 id="desktop-install-title" className="text-[17px] font-extrabold text-ink">Kamino on your desktop</h2></div>
    <p className="text-[13.5px] text-muted">Open Kamino in its own window with an app icon on your computer. Communities, posts and chats need an internet connection.</p>
    {pwa.installed ? <p className="flex items-center gap-2 text-[13px] font-bold text-violet"><CheckCircle2 className="size-4" aria-hidden />Kamino is installed</p> : pwa.canInstall ? <GradientButton size="sm" disabled={pwa.busy} onClick={() => void pwa.install()}><Download className="size-4" aria-hidden />Install Kamino</GradientButton> : <p className="text-[12.5px] text-muted">In Chrome or Edge, use the install option in your browser menu to add Kamino.</p>}
    {pwa.message ? <p role="status" className="text-[12.5px] text-muted">{pwa.message}</p> : null}
  </section>;
}
