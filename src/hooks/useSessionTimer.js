import { useRef } from "react";

export default function useSessionTimer(setElapsedSeconds) {
  const timerRef = useRef(null);

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(
      () => setElapsedSeconds((prev) => prev + 1),
      1000
    );
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  return { startTimer, stopTimer, timerRef };
}
