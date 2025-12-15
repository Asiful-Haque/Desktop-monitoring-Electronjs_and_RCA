import { useRef, useState } from "react";

export default function useIdleSampling() {
  const samplingRef = useRef(null);

  // idle + capture sampling
  const idleSecondsThisCycleRef = useRef(0);
  const secondsSampledRef = useRef(0);

  // full-session idle/active + continuous idle tracking
  const totalIdleSecondsRef = useRef(0);
  const totalActiveSecondsRef = useRef(0);
  const continuousIdleSecondsRef = useRef(0);

  // idle warning popup
  const [idleWarningOpen, setIdleWarningOpen] = useState(false);
  const [idleWarningSeconds, setIdleWarningSeconds] = useState(0);

  const stopSampling = () => {
    clearInterval(samplingRef.current);
    samplingRef.current = null;
    idleSecondsThisCycleRef.current = 0;
    secondsSampledRef.current = 0;
    continuousIdleSecondsRef.current = 0;
  };

  const startSampling = () => {
    if (samplingRef.current) return;

    samplingRef.current = setInterval(async () => {
      const idle = await window.electronAPI.getIdleTime();
      const isIdle = idle >= 1;

      secondsSampledRef.current++;

      if (isIdle) {
        idleSecondsThisCycleRef.current++;
        totalIdleSecondsRef.current++;
        continuousIdleSecondsRef.current++;
        setIdleWarningSeconds(continuousIdleSecondsRef.current);
        if (!idleWarningOpen && continuousIdleSecondsRef.current >= 10) {
          setIdleWarningOpen(true);
        }
      } else {
        totalActiveSecondsRef.current++;
        continuousIdleSecondsRef.current = 0;
      }
    }, 1000);
  };

  const resetIdleCounters = () => {
    totalIdleSecondsRef.current = 0;
    totalActiveSecondsRef.current = 0;
    continuousIdleSecondsRef.current = 0;
    setIdleWarningSeconds(0);
    setIdleWarningOpen(false);
  };

  const confirmIdleDialog = () => {
    continuousIdleSecondsRef.current = 0;
    setIdleWarningSeconds(0);
    setIdleWarningOpen(false);
  };

  return {
    startSampling,
    stopSampling,
    resetIdleCounters,
    confirmIdleDialog,

    idleWarningOpen,
    idleWarningSeconds,

    samplingRef,
    idleSecondsThisCycleRef,
    secondsSampledRef,
    totalIdleSecondsRef,
    totalActiveSecondsRef,
    continuousIdleSecondsRef,
    setIdleWarningOpen,
    setIdleWarningSeconds,
  };
}
