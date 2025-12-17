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

  // Stop sampling (when required)
  const stopSampling = () => {
    clearInterval(samplingRef.current);
    samplingRef.current = null;
    idleSecondsThisCycleRef.current = 0;
    secondsSampledRef.current = 0;
    continuousIdleSecondsRef.current = 0;
  };

  // Start sampling idle time
  const startSampling = () => {
    if (samplingRef.current) return;

    samplingRef.current = setInterval(async () => {
      const idle = await window.electronAPI.getIdleTime(); // Get idle time
      const isIdle = idle >= 1; // Determine if user is idle

      secondsSampledRef.current++;

      // If idle, continue increasing the counter
      if (isIdle) {
        idleSecondsThisCycleRef.current++;
        totalIdleSecondsRef.current++;
        continuousIdleSecondsRef.current++;
        setIdleWarningSeconds(continuousIdleSecondsRef.current); // Update idle warning time
        if (!idleWarningOpen && continuousIdleSecondsRef.current >= 10) {
          setIdleWarningOpen(true); // Show warning if idle time reaches 10 seconds
        }
      } else {
        // Don't reset the continuous idle counter when user is active
        totalActiveSecondsRef.current++;
      }
    }, 1000); // Sampling every second
  };

  // Reset idle counters and warning
  const resetIdleCounters = () => {
    totalIdleSecondsRef.current = 0;
    totalActiveSecondsRef.current = 0;
    continuousIdleSecondsRef.current = 0;
    setIdleWarningSeconds(0);
    setIdleWarningOpen(false); // Close warning when reset
  };

  // Confirm idle dialog (when user clicks "OK")
  const confirmIdleDialog = () => {
    // When the user clicks "OK", reset only the warning and idle time shown
    setIdleWarningOpen(false); // Close the warning
    setIdleWarningSeconds(0); // Reset warning seconds
    continuousIdleSecondsRef.current = 0; // Reset continuous idle counter after confirmation
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
