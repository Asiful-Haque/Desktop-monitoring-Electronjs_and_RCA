import { useEffect, useRef, useState } from "react";

export default function useIdleSampling() {
  const samplingRef = useRef(null);

  // idle + capture sampling
  const idleSecondsThisCycleRef = useRef(0);
  const secondsSampledRef = useRef(0);

  // full-session idle/active tracking (OS-level sampling)
  const totalIdleSecondsRef = useRef(0);
  const totalActiveSecondsRef = useRef(0);

  // (kept for compatibility)
  const continuousIdleSecondsRef = useRef(0);

  // ✅ confirmed break seconds (what you actually deduct)
  const confirmedBreakSecondsRef = useRef(0);

  // idle warning popup
  const [idleWarningOpen, setIdleWarningOpen] = useState(false);
  const [idleWarningSeconds, setIdleWarningSeconds] = useState(0);

  // ✅ avoid stale state inside interval
  const idleWarningOpenRef = useRef(false);
  useEffect(() => {
    idleWarningOpenRef.current = idleWarningOpen;
  }, [idleWarningOpen]);

  const IDLE_THRESHOLD_SECONDS = 10;

  // ✅ phase 1: continuous idle until dialog opens (resets on activity)
  const preDialogContinuousIdleRef = useRef(0);

  // ✅ phase 2: accumulated idle while dialog is open (pauses on activity)
  const dialogIdleAccumRef = useRef(0);

  const stopSampling = () => {
    clearInterval(samplingRef.current);
    samplingRef.current = null;

    idleSecondsThisCycleRef.current = 0;
    secondsSampledRef.current = 0;

    totalIdleSecondsRef.current = 0;
    totalActiveSecondsRef.current = 0;

    continuousIdleSecondsRef.current = 0;

    preDialogContinuousIdleRef.current = 0;
    dialogIdleAccumRef.current = 0;

    confirmedBreakSecondsRef.current = 0;

    setIdleWarningSeconds(0);
    setIdleWarningOpen(false);
  };

  const startSampling = () => {
    if (samplingRef.current) return;

    samplingRef.current = setInterval(async () => {
      const idle = await window.electronAPI.getIdleTime(); // seconds since last OS input
      const isIdleNow = idle >= 1;

      secondsSampledRef.current++;

      // -----------------------------
      // If dialog is NOT open yet:
      // - continuous idle counter that resets on activity
      // - open dialog at threshold
      // -----------------------------
      if (!idleWarningOpenRef.current) {
        if (isIdleNow) {
          idleSecondsThisCycleRef.current++;
          totalIdleSecondsRef.current++;

          preDialogContinuousIdleRef.current += 1;
          continuousIdleSecondsRef.current = preDialogContinuousIdleRef.current;

          setIdleWarningSeconds(preDialogContinuousIdleRef.current);

          if (preDialogContinuousIdleRef.current >= IDLE_THRESHOLD_SECONDS) {
            // open dialog and start "dialog session" counter from the current value
            dialogIdleAccumRef.current = preDialogContinuousIdleRef.current;
            setIdleWarningOpen(true);
          }
        } else {
          totalActiveSecondsRef.current++;

          // reset before-dialog counter on activity
          preDialogContinuousIdleRef.current = 0;
          continuousIdleSecondsRef.current = 0;
          setIdleWarningSeconds(0);
        }
        return;
      }

      // -----------------------------
      // If dialog IS open:
      // - do NOT close automatically
      // - pause timer on activity
      // - resume timer on idle
      // -----------------------------
      if (isIdleNow) {
        totalIdleSecondsRef.current++;

        dialogIdleAccumRef.current += 1;
        setIdleWarningSeconds(dialogIdleAccumRef.current);
      } else {
        totalActiveSecondsRef.current++;
        // pause: keep idleWarningSeconds as-is
      }
    }, 1000);
  };

  const resetIdleCounters = () => {
    totalIdleSecondsRef.current = 0;
    totalActiveSecondsRef.current = 0;

    continuousIdleSecondsRef.current = 0;
    preDialogContinuousIdleRef.current = 0;
    dialogIdleAccumRef.current = 0;

    confirmedBreakSecondsRef.current = 0;

    setIdleWarningSeconds(0);
    setIdleWarningOpen(false);
  };

  // called when user clicks any button on the dialog (Working/Break)
  const confirmIdleDialog = () => {
    setIdleWarningOpen(false);
    setIdleWarningSeconds(0);

    continuousIdleSecondsRef.current = 0;
    preDialogContinuousIdleRef.current = 0;
    dialogIdleAccumRef.current = 0;
  };

  // ✅ optional helper (alias)
  const confirmIdleAsWorking = () => {
    confirmIdleDialog();
  };

  // ✅ Apply break deduction centrally (no duplicate logic in ScreenshotApp)
  // - shifts ACTIVE segment start forward
  // - reduces ACTIVE counter (elapsedSecondsRef)
  // - increments confirmedBreakSecondsRef
  // - closes idle dialog
  const applyBreakDeduction = ({ startAtRef, elapsedSecondsRef }) => {
    const deductionSeconds = Math.max(0, Number(dialogIdleAccumRef.current || 0));

    if (deductionSeconds > 0) {
      confirmedBreakSecondsRef.current += deductionSeconds;

      if (startAtRef?.current instanceof Date) {
        startAtRef.current = new Date(
          startAtRef.current.getTime() + deductionSeconds * 1000
        );
      }

      if (elapsedSecondsRef && typeof elapsedSecondsRef.current === "number") {
        elapsedSecondsRef.current = Math.max(
          0,
          elapsedSecondsRef.current - deductionSeconds
        );
      }
    }

    confirmIdleDialog();
    return deductionSeconds;
  };

  return {
    startSampling,
    stopSampling,
    resetIdleCounters,

    // dialog controls
    confirmIdleDialog,
    confirmIdleAsWorking,
    applyBreakDeduction,

    idleWarningOpen,
    idleWarningSeconds,

    // refs
    samplingRef,
    idleSecondsThisCycleRef,
    secondsSampledRef,
    totalIdleSecondsRef,
    totalActiveSecondsRef,
    continuousIdleSecondsRef,

    // ✅ new ref
    confirmedBreakSecondsRef,

    // kept
    setIdleWarningOpen,
    setIdleWarningSeconds,
  };
}
