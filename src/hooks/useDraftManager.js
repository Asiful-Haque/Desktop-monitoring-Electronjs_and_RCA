import { useEffect, useRef } from "react";

export default function useDraftManager({
  DRAFT_KEY,
  API_BASE,
  t,
  showToast,

  // state + setters
  selectedTaskId,
  selectedTaskName,
  setSelectedTaskId,
  setSelectedTaskName,
  setSelectedProjectId,
  setIsCapturing,
  setIsPaused,
  isCapturing,
  isPaused,

  // refs (ACTIVE)
  elapsedSecondsRef,
  setElapsedSeconds,
  segmentsRef,
  startAtRef,
  isCapturingRef,

  // refs (RAW)
  rawSegmentsRef,
  rawStartAtRef,

  // data
  taskData,
  getTaskId,
  toSeconds,

  // stop helpers
  stopTimer,
  stopSampling,
  stopScreenshotCycle,

  // backend
  updateTaskFlagger,
}) {
  const pendingAutoSubmitRef = useRef(false);

  // restored draft cached in-memory for login autosave
  const restoredDraftRef = useRef(null);
  const autoSavedDraftOnceRef = useRef(false);
  const shownAutoSavedToastRef = useRef(false);

  // network loss detection
  const lastOnlineRef = useRef(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const networkPollRef = useRef(null);
  const offlineStreakRef = useRef(0);

  const loginAutoSaveInFlightRef = useRef(false);
  const disableDraftWritesRef = useRef(false);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    pendingAutoSubmitRef.current = false;
    restoredDraftRef.current = null;
  };

  const pad2 = (n) => String(n).padStart(2, "0");
  const formatClock = (d = new Date()) => {
    let h = d.getHours();
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}.${pad2(d.getMinutes())}.${pad2(d.getSeconds())}`;
  };

  const logClockAt = (label, atDate, extra = {}) => {
    const d = atDate instanceof Date ? atDate : new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const offsetMin = new Date().getTimezoneOffset();
    console.log(
      `⏱️ ${label} @ ${formatClock(d)} | iso=${d.toISOString()} | tz=${tz} | offsetMin=${offsetMin}`,
      extra,
    );
  };

  const formatDateYMD = (date) => {
    const dt = date instanceof Date ? date : new Date(date);
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  };

  const toIsoNoMs = (d) =>
    (d instanceof Date ? d : new Date(d))
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

  const getUserTz = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const getUserOffsetMinutes = () => new Date().getTimezoneOffset();

  const secondsBetween = (a, b) => {
    const st = a ? new Date(a).getTime() : 0;
    const en = b ? new Date(b).getTime() : 0;
    if (!st || !en || en <= st) return 0;
    return Math.floor((en - st) / 1000);
  };

  const buildSegmentBreakdown = (rawSegs = [], activeSegs = []) => {
    const count = Math.max(rawSegs.length, activeSegs.length);

    const perSegment = [];
    let rawTotal = 0;
    let activeTotal = 0;

    for (let i = 0; i < count; i++) {
      const r = rawSegs[i] || null;
      const a = activeSegs[i] || null;

      const rawStart = r?.startAt ? new Date(r.startAt) : null;
      const rawEnd = r?.endAt ? new Date(r.endAt) : null;

      const activeStart = a?.startAt ? new Date(a.startAt) : null;
      const activeEnd = a?.endAt ? new Date(a.endAt) : null;

      const rawSec = rawStart && rawEnd ? secondsBetween(rawStart, rawEnd) : 0;
      const activeSec =
        activeStart && activeEnd ? secondsBetween(activeStart, activeEnd) : 0;

      const idleSec = Math.max(0, rawSec - activeSec);

      rawTotal += rawSec;
      activeTotal += activeSec;

      perSegment.push({
        segment_index: i + 1,
        raw_task_start: rawStart ? rawStart.toISOString() : null,
        raw_task_end: rawEnd ? rawEnd.toISOString() : null,
        task_start: activeStart ? activeStart.toISOString() : null,
        task_end: activeEnd ? activeEnd.toISOString() : null,
        raw_seconds: rawSec,
        active_seconds: activeSec,
        idle_deducted_seconds: idleSec,
      });
    }

    return {
      perSegment,
      raw_session_seconds: rawTotal,
      active_session_seconds: activeTotal,
      idle_deducted_seconds: Math.max(0, rawTotal - activeTotal),
    };
  };

  const logSegmentBreakdown = (label, breakdown) => {
    console.log(`✅ ${label} -------------------`);
    console.log("raw_session_seconds:", breakdown.raw_session_seconds);
    console.log("active_session_seconds:", breakdown.active_session_seconds);
    console.log("idle_deducted_seconds:", breakdown.idle_deducted_seconds);

    console.table(
      (breakdown.perSegment || []).map((x) => ({
        segment_index: x.segment_index,
        raw_task_start: x.raw_task_start,
        raw_task_end: x.raw_task_end,
        active_task_start: x.task_start,
        active_task_end: x.task_end,
        raw_seconds: x.raw_seconds,
        active_seconds: x.active_seconds,
        idle_deducted_seconds: x.idle_deducted_seconds,
      })),
    );
    console.log("---------------------------------------");
  };

  // Requirement #1 & #2:
  // ONLY call this from:
  // - finalizeAndPersistOnClose (manual close/off app)
  // - handleNetworkLoss (internet cut)
  const persistDraft = (forcePending = true, meta = {}) => {
    if (disableDraftWritesRef.current) return;

    try {
      const stateToSave = {
        selectedTaskId,
        selectedTaskName,
        elapsedSeconds: elapsedSecondsRef.current,

        // ACTIVE segments
        segments: (segmentsRef.current || []).map((s) => ({
          startAt: (s?.startAt instanceof Date
            ? s.startAt
            : new Date(s.startAt)
          ).toISOString(),
          endAt: (s?.endAt instanceof Date ? s.endAt : new Date(s.endAt)).toISOString(),
        })),
        openStartAt: startAtRef.current
          ? startAtRef.current instanceof Date
            ? startAtRef.current.toISOString()
            : new Date(startAtRef.current).toISOString()
          : null,

        // RAW segments
        rawSegments: (rawSegmentsRef?.current || []).map((s) => ({
          startAt: (s?.startAt instanceof Date
            ? s.startAt
            : new Date(s.startAt)
          ).toISOString(),
          endAt: (s?.endAt instanceof Date ? s.endAt : new Date(s.endAt)).toISOString(),
        })),
        rawOpenStartAt: rawStartAtRef?.current
          ? rawStartAtRef.current instanceof Date
            ? rawStartAtRef.current.toISOString()
            : new Date(rawStartAtRef.current).toISOString()
          : null,

        isCapturing,
        isPaused,

        // IMPORTANT: only drafts saved on close/offline are "pending"
        pendingAutoSubmit: forcePending ? true : false,

        savedAt: new Date().toISOString(),
        ...meta,
      };

      console.log("[draft] saved to localStorage", {
        reason: stateToSave.reason,
        pending: stateToSave.pendingAutoSubmit,
        selectedTaskId: stateToSave.selectedTaskId,
      });

      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error("persistDraft failed:", e);
    }
  };

  // Requirement #1: manual close/off app
  const finalizeAndPersistOnClose = (reason = "close") => {
    if (disableDraftWritesRef.current) return;

    try {
      const end = new Date();

      // close ACTIVE open segment
      if (isCapturingRef.current && startAtRef.current) {
        segmentsRef.current.push({
          startAt: new Date(startAtRef.current),
          endAt: end,
        });
        startAtRef.current = null;
      }

      // close RAW open segment
      if (isCapturingRef.current && rawStartAtRef?.current) {
        rawSegmentsRef.current.push({
          startAt: new Date(rawStartAtRef.current),
          endAt: end,
        });
        rawStartAtRef.current = null;
      }

      // save only if we have something meaningful
      if (selectedTaskId && (segmentsRef.current || []).length > 0) {
        persistDraft(true, { reason });
      }
    } catch (e) {
      console.error("finalizeAndPersistOnClose failed:", e);
    }
  };

  // Requirement #2: internet cuts off
  const handleNetworkLoss = (reason = "offline") => {
    try {
      const end = new Date();

      if (startAtRef.current) {
        segmentsRef.current.push({
          startAt: new Date(startAtRef.current),
          endAt: end,
        });
        startAtRef.current = null;
      }

      if (rawStartAtRef?.current) {
        rawSegmentsRef.current.push({
          startAt: new Date(rawStartAtRef.current),
          endAt: end,
        });
        rawStartAtRef.current = null;
      }

      if (isCapturingRef.current) {
        setIsCapturing(false);
        setIsPaused(false);
        stopTimer();
        stopSampling();
        stopScreenshotCycle();
      }

      if (selectedTaskId && (segmentsRef.current || []).length > 0) {
        persistDraft(true, { reason });
      }
    } catch (e) {
      console.error("handleNetworkLoss failed:", e);
    }
  };

  // Restore from localStorage on mount
  useEffect(() => {
    const cachedData = localStorage.getItem(DRAFT_KEY);
    if (!cachedData) return;

    try {
      console.log(
        "Cached data found from localStorage (saved due to close/offline):",
        cachedData,
      );

      const parsedData = JSON.parse(cachedData);

      // We only care about drafts that were marked pending (close/offline)
      if (!parsedData?.selectedTaskId || !parsedData?.pendingAutoSubmit) return;

      setSelectedTaskId(parsedData.selectedTaskId || "");
      setSelectedTaskName(parsedData.selectedTaskName || "");
      setElapsedSeconds(parsedData.elapsedSeconds || 0);

      // ACTIVE restore
      const restoredSegments = (parsedData.segments || []).map((s) => ({
        startAt: new Date(s.startAt),
        endAt: new Date(s.endAt),
      }));

      // RAW restore (fallback to ACTIVE if not present)
      const restoredRawSegments = (
        parsedData.rawSegments ||
        parsedData.segments ||
        []
      ).map((s) => ({
        startAt: new Date(s.startAt),
        endAt: new Date(s.endAt),
      }));

      // if saved while capturing, close open segment to savedAt
      if (
        parsedData.openStartAt &&
        parsedData.isCapturing &&
        !parsedData.isPaused &&
        parsedData.savedAt
      ) {
        restoredSegments.push({
          startAt: new Date(parsedData.openStartAt),
          endAt: new Date(parsedData.savedAt),
        });
      }

      // RAW open segment close
      if (
        parsedData.rawOpenStartAt &&
        parsedData.isCapturing &&
        !parsedData.isPaused &&
        parsedData.savedAt
      ) {
        restoredRawSegments.push({
          startAt: new Date(parsedData.rawOpenStartAt),
          endAt: new Date(parsedData.savedAt),
        });
      } else if (
        !parsedData.rawOpenStartAt &&
        parsedData.openStartAt &&
        parsedData.isCapturing &&
        !parsedData.isPaused &&
        parsedData.savedAt
      ) {
        restoredRawSegments.push({
          startAt: new Date(parsedData.openStartAt),
          endAt: new Date(parsedData.savedAt),
        });
      }

      segmentsRef.current = restoredSegments;
      if (rawSegmentsRef) rawSegmentsRef.current = restoredRawSegments;

      pendingAutoSubmitRef.current = true;

      restoredDraftRef.current = {
        selectedTaskId: parsedData.selectedTaskId,
        selectedTaskName: parsedData.selectedTaskName || "",
        elapsedSeconds: Number(parsedData.elapsedSeconds || 0),
        savedAt: parsedData.savedAt || null,
        restoredActiveSegments: restoredSegments,
        restoredRawSegments: restoredRawSegments,
      };

      // stop any running UI capture
      setIsCapturing(false);
      setIsPaused(false);

      const preview = buildSegmentBreakdown(restoredRawSegments, restoredSegments);
      logSegmentBreakdown("DRAFT RESTORED (Segment-wise preview)", preview);
    } catch (e) {
      console.error("Failed to parse cachedData:", e);
    }
  }, []);

  // Requirement #1: ONLY manual close/off app triggers saving (no visibilitychange)
  useEffect(() => {
    const onBeforeUnload = () => finalizeAndPersistOnClose("beforeunload");

    // pagehide is more reliable in some browsers; still a close/navigation event
    const onPageHide = () => finalizeAndPersistOnClose("pagehide");

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [selectedTaskId]);

  // Requirement #2: internet cuts off
  useEffect(() => {
    const onOffline = () => handleNetworkLoss("offline_event");
    const onOnline = () => {
      lastOnlineRef.current = true;
      offlineStreakRef.current = 0;
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [selectedTaskId]);

  // Offline polling (kept) with a small debounce to reduce false triggers:
  // only treat offline if navigator.onLine is false for 2 consecutive polls
  useEffect(() => {
    if (networkPollRef.current) clearInterval(networkPollRef.current);

    networkPollRef.current = setInterval(() => {
      const nowOnline =
        typeof navigator !== "undefined" ? navigator.onLine : true;

      if (!nowOnline) {
        offlineStreakRef.current += 1;
      } else {
        offlineStreakRef.current = 0;
      }

      // transition online -> offline (debounced)
      if (lastOnlineRef.current && offlineStreakRef.current >= 2) {
        lastOnlineRef.current = false;
        handleNetworkLoss("poll_offline");
        return;
      }

      // transition offline -> online
      if (!lastOnlineRef.current && nowOnline) {
        lastOnlineRef.current = true;
        offlineStreakRef.current = 0;
      }
    }, 3000);

    return () => {
      clearInterval(networkPollRef.current);
      networkPollRef.current = null;
    };
  }, [selectedTaskId]);

  // Requirement #3 & #4:
  // After coming back, send to DB reliably
  // Only clear localStorage AFTER confirmed success
  useEffect(() => {
    const runLoginAutoSave = async () => {
      if (autoSavedDraftOnceRef.current) return;
      if (loginAutoSaveInFlightRef.current) return;
      if (!taskData || taskData.length === 0) return;

      // must have a pending recovery draft
      if (!pendingAutoSubmitRef.current) return;

      const draft = restoredDraftRef.current;
      if (!draft?.selectedTaskId) return;

      loginAutoSaveInFlightRef.current = true;

      try {
        const serverTask = taskData.find(
          (tt) => String(getTaskId(tt)) === String(draft.selectedTaskId),
        );

        if (!serverTask) {
          console.warn(
            "Draft task not available anymore. Clearing draft:",
            draft.selectedTaskId,
          );

          // permanently clear, no retry possible
          autoSavedDraftOnceRef.current = true;
          loginAutoSaveInFlightRef.current = false;
          pendingAutoSubmitRef.current = false;

          clearDraft();
          setSelectedTaskId("");
          setSelectedTaskName("");
          setElapsedSeconds(0);
          setSelectedProjectId("");
          return;
        }

        const draftSeconds = Number(draft.elapsedSeconds || 0);
        const serverSeconds = toSeconds(serverTask?.last_timing);

        const totalSeconds = Math.max(
          0,
          Math.floor(Math.max(draftSeconds, serverSeconds)),
        );

        if (draft.selectedTaskName && !selectedTaskName) {
          setSelectedTaskName(draft.selectedTaskName);
        } else if (serverTask?.task_name && !selectedTaskName) {
          setSelectedTaskName(serverTask.task_name);
        }

        if (totalSeconds !== elapsedSecondsRef.current) {
          setElapsedSeconds(totalSeconds);
        }

        const developerId = Number(localStorage.getItem("user_id") || 0) || null;
        const tenantId = Number(localStorage.getItem("tenant_id") || 0) || null;

        // build payload from restored snapshot
        const activeSegs =
          draft.restoredActiveSegments?.length ? draft.restoredActiveSegments : [];
        const rawSegs =
          draft.restoredRawSegments?.length ? draft.restoredRawSegments : activeSegs;

        const breakdown = buildSegmentBreakdown(rawSegs, activeSegs);
        logSegmentBreakdown("RECOVERY (Segment-wise)", breakdown);

        const segmentsToSend = (breakdown.perSegment || [])
          .filter((x) => x.task_start && x.task_end)
          .map((x) => ({
            task_id: Number(draft.selectedTaskId),
            project_id: Number(serverTask.project_id),
            developer_id: developerId,
            work_date: formatDateYMD(x.raw_task_start || x.task_start),

            task_start: toIsoNoMs(x.task_start),
            task_end: toIsoNoMs(x.task_end),

            raw_task_start: toIsoNoMs(x.raw_task_start || x.task_start),
            raw_task_end: toIsoNoMs(x.raw_task_end || x.task_end),

            raw_seconds: x.raw_seconds,
            active_seconds: x.active_seconds,
            idle_deducted_seconds: x.idle_deducted_seconds,
            segment_index: x.segment_index,

            tenant_id: tenantId,
            user_tz: getUserTz(),
            user_offset_minutes: getUserOffsetMinutes(),
          }));

        // 1) update task timing if needed (must succeed if attempted)
        if (serverSeconds < totalSeconds) {
          const updateRes = await fetch(
            `${API_BASE}/api/tasks/task-update/${draft.selectedTaskId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                taskId: String(draft.selectedTaskId),
                last_timing: totalSeconds,
              }),
            },
          );

          if (!updateRes.ok) {
            const upd = await updateRes.json().catch(() => ({}));
            console.warn("Recovery task-update failed. Keeping draft for retry.", upd);

            // allow retry later
            loginAutoSaveInFlightRef.current = false;
            autoSavedDraftOnceRef.current = false;
            return;
          }
        }

        // 2) post time-tracking segments (must succeed to clear localStorage)
        if (segmentsToSend.length > 0) {
          const bodyToSend =
            segmentsToSend.length === 1 ? segmentsToSend[0] : segmentsToSend;

          logClockAt("RECOVERY /time-tracking POST", new Date(), {
            selectedTaskId: draft.selectedTaskId,
            segments: segmentsToSend.length,
          });

          const timeTrackingRes = await fetch(`${API_BASE}/api/time-tracking`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(bodyToSend),
          });

          if (!timeTrackingRes.ok) {
            const ttData = await timeTrackingRes.json().catch(() => ({}));
            console.warn("Recovery time-tracking failed. Keeping draft for retry.", ttData);

            // allow retry later
            loginAutoSaveInFlightRef.current = false;
            autoSavedDraftOnceRef.current = false;
            return;
          }
        } else {
          console.warn("Recovery has no segmentsToSend. Keeping draft (safety).");

          // keep draft because clearing would risk data loss
          loginAutoSaveInFlightRef.current = false;
          autoSavedDraftOnceRef.current = false;
          return;
        }

        // 3) optional flagger
        try {
          await updateTaskFlagger(draft.selectedTaskId, 0);
        } catch (e) {
          console.warn("updateTaskFlagger failed (non-blocking):", e);
        }

        // SUCCESS: now we can clear localStorage
        autoSavedDraftOnceRef.current = true;
        pendingAutoSubmitRef.current = false;
        disableDraftWritesRef.current = true;

        if (!shownAutoSavedToastRef.current) {
          shownAutoSavedToastRef.current = true;
          showToast(
            t("toast.recoveredDraft", {
              defaultValue: "✅ Previous session time was saved automatically.",
            }),
          );
        }

        // reset in-memory state
        startAtRef.current = null;
        if (rawStartAtRef) rawStartAtRef.current = null;

        segmentsRef.current = [];
        if (rawSegmentsRef) rawSegmentsRef.current = [];

        setSelectedTaskId("");
        setSelectedTaskName("");
        setElapsedSeconds(0);
        setSelectedProjectId("");

        clearDraft();

        loginAutoSaveInFlightRef.current = false;
        setTimeout(() => window.location.reload(), 800);
      } catch (e) {
        console.error("Recovery error (keeping draft for retry):", e);

        // keep draft; allow retry
        loginAutoSaveInFlightRef.current = false;
        autoSavedDraftOnceRef.current = false;
      }
    };

    runLoginAutoSave();
  }, [taskData, selectedTaskName, API_BASE, t]);

  return {
    persistDraft,
    clearDraft,
    pendingAutoSubmitRef,
    restoredDraftRef,
    finalizeAndPersistOnClose,
    handleNetworkLoss,
  };
}
