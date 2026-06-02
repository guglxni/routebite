import { useCallback, useEffect, useRef, useState } from "react";
import type { GPSPosition } from "@routebite/shared/types";

type UseLiveLocationOptions = {
  enabled: boolean;
  onUpdate?: (position: GPSPosition) => void;
  intervalMs?: number;
};

export function useLiveLocation({
  enabled,
  onUpdate,
  intervalMs = 15000,
}: UseLiveLocationOptions) {
  const [position, setPosition] = useState<GPSPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const stop = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    stop();
    setError(null);
    setWatching(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next: GPSPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setPosition(next);
        onUpdateRef.current?.(next);
      },
      (err) => {
        setError(err.message || "Could not access your location.");
        setWatching(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: intervalMs,
        timeout: 12000,
      },
    );
  }, [intervalMs, stop]);

  useEffect(() => {
    if (enabled) start();
    else stop();
    return stop;
  }, [enabled, start, stop]);

  return { position, error, watching, start, stop };
}
