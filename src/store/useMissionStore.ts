import { useEffect, useRef, useSyncExternalStore } from "react";
import { MissionStore } from "./missionStore";

export function useMissionStore(): MissionStore {
  const ref = useRef<MissionStore | null>(null);
  if (!ref.current) {
    ref.current = new MissionStore(undefined, import.meta.env.VITE_CONTROL_PLANE_MODE);
  }
  const store = ref.current;

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store;
}
