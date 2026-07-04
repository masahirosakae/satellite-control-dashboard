import { useEffect, useRef, useSyncExternalStore } from "react";
import { MissionStore } from "./missionStore";

export function useMissionStore(): MissionStore {
  const ref = useRef<MissionStore | null>(null);
  if (!ref.current) {
    ref.current = new MissionStore();
  }
  const store = ref.current;

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store;
}
