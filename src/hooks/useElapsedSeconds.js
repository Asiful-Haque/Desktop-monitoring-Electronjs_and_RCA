import { useRef, useState } from "react";

export default function useElapsedSeconds() {
  const [elapsedSeconds, _setElapsedSeconds] = useState(0);
  const elapsedSecondsRef = useRef(0);

  const setElapsedSeconds = (next) => {
    const val =
      typeof next === "function" ? next(elapsedSecondsRef.current) : next;
    const safe = Math.max(0, Math.floor(val || 0));
    elapsedSecondsRef.current = safe;
    _setElapsedSeconds(safe);
  };

  return { elapsedSeconds, setElapsedSeconds, elapsedSecondsRef };
}
