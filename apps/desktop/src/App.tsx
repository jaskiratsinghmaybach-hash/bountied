import { useEffect } from "react";
import { useApp } from "./stores/app";
import { Pairing } from "./components/Pairing";
import { Workspace } from "./components/Workspace";
import { Splash } from "./components/Splash";

export default function App() {
  const phase = useApp((s) => s.phase);
  const boot = useApp((s) => s.boot);
  useEffect(() => { void boot(); }, [boot]);

  if (phase === "booting") return <Splash />;
  if (phase === "signed_in") return <Workspace />;
  return <Pairing />;
}
