import { useRef } from "react";

export default function useScreenshotCycle({ isCapturingRef, evaluateAndCapture }) {
  // random screenshot scheduling
  const screenshotTimeoutsRef = useRef([]);
  const screenshotBlockIntervalRef = useRef(null);

  const stopScreenshotCycle = () => {
    if (screenshotBlockIntervalRef.current) {
      clearInterval(screenshotBlockIntervalRef.current);
      screenshotBlockIntervalRef.current = null;
    }
    screenshotTimeoutsRef.current.forEach((id) => clearTimeout(id));
    screenshotTimeoutsRef.current = [];
  };

  const scheduleRandomScreenshotsBlock = () => {
    const blockMs = 10 * 60 * 1000;
    const numShots = 5;
    const minGapMs = 30 * 1000;

    const offsets = [];

    for (let i = 0; i < numShots; i++) {
      let offset;
      let tries = 0;

      do {
        offset = Math.floor(Math.random() * blockMs);
        tries++;
      } while (
        offsets.some((o) => Math.abs(o - offset) < minGapMs) &&
        tries < 20
      );

      offsets.push(offset);
    }

    offsets.forEach((offset) => {
      const timeoutId = setTimeout(() => {
        if (!isCapturingRef.current) return;
        evaluateAndCapture();
      }, offset);
      screenshotTimeoutsRef.current.push(timeoutId);
    });
  };

  const startScreenshotCycle = () => {
    scheduleRandomScreenshotsBlock();
    screenshotBlockIntervalRef.current = setInterval(() => {
      if (!isCapturingRef.current) return;
      scheduleRandomScreenshotsBlock();
    }, 10 * 60 * 1000);
  };

  return {
    startScreenshotCycle,
    stopScreenshotCycle,
    screenshotTimeoutsRef,
    screenshotBlockIntervalRef,
  };
}
