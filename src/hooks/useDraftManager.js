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
  setSelectedProjectId, // (kept)
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

  // ✅ NEW: refs (RAW)
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
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const networkPollRef = useRef(null);
  const autoSaveRef = useRef(null);
  const loginAutoSaveInFlightRef = useRef(false);

  const disableDraftWritesRef = useRef(false);

  // ✅ safe fallbacks (backward compatible)
  const rawSegmentsRefSafe = rawSegmentsRef || segmentsRef;
  const rawStartAtRefSafe = rawStartAtRef || startAtRef;

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    pendingAutoSubmitRef.current = false;
    restoredDraftRef.current = null;
  };

  const formatDateYMD = (date) => {
    const dt = date instanceof Date ? date : new Date(date);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  const toIsoNoMs = (d) =>
    (d instanceof Date ? d : new Date(d))
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

  const getUserTz = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const getUserOffsetMinutes = () => new Date().getTimezoneOffset();

  // ✅ Save draft to localStorage (ACTIVE + RAW)
  const persistDraft = (forcePending = true, meta = {}) => {
    if (disableDraftWritesRef.current) return;

    try {
      const stateToSave = {
        selectedTaskId,
        selectedTaskName,
        elapsedSeconds: elapsedSecondsRef.current,

        // ACTIVE segments (idle deductions applied)
        segments: (segmentsRef.current || []).map((s) => ({
          startAt: (s?.startAt instanceof Date ? s.startAt : new Date(s.startAt)).toISOString(),
          endAt: (s?.endAt instanceof Date ? s.endAt : new Date(s.endAt)).toISOString(),
        })),

        // RAW segments (never adjusted)
        rawSegments: (rawSegmentsRefSafe.current || []).map((s) => ({
          startAt: (s?.startAt instanceof Date ? s.startAt : new Date(s.startAt)).toISOString(),
          endAt: (s?.endAt instanceof Date ? s.endAt : new Date(s.endAt)).toISOString(),
        })),

        openStartAt: startAtRef.current
          ? (startAtRef.current instanceof Date
              ? startAtRef.current.toISOString()
              : new Date(startAtRef.current).toISOString())
          : null,

        openRawStartAt: rawStartAtRefSafe.current
          ? (rawStartAtRefSafe.current instanceof Date
              ? rawStartAtRefSafe.current.toISOString()
              : new Date(rawStartAtRefSafe.current).toISOString())
          : null,

        isCapturing,
        isPaused,
        pendingAutoSubmit: forcePending ? true : false,
        savedAt: new Date().toISOString(),
        ...meta,
      };

      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error("persistDraft failed:", e);
    }
  };

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
      if (isCapturingRef.current && rawStartAtRefSafe.current) {
        rawSegmentsRefSafe.current.push({
          startAt: new Date(rawStartAtRefSafe.current),
          endAt: end,
        });
        rawStartAtRefSafe.current = null;
      }

      if (selectedTaskId && (rawSegmentsRefSafe.current || []).length > 0) {
        persistDraft(true, { reason });
      }
    } catch (e) {
      console.error("finalizeAndPersistOnClose failed:", e);
    }
  };

  const handleNetworkLoss = (reason = "offline") => {
    try {
      const end = new Date();

      // close ACTIVE
      if (startAtRef.current) {
        segmentsRef.current.push({
          startAt: new Date(startAtRef.current),
          endAt: end,
        });
        startAtRef.current = null;
      }

      // close RAW
      if (rawStartAtRefSafe.current) {
        rawSegmentsRefSafe.current.push({
          startAt: new Date(rawStartAtRefSafe.current),
          endAt: end,
        });
        rawStartAtRefSafe.current = null;
      }

      if (isCapturingRef.current) {
        setIsCapturing(false);
        setIsPaused(false);
        stopTimer();
        stopSampling();
        stopScreenshotCycle();
      }

      if (selectedTaskId && (rawSegmentsRefSafe.current || []).length > 0) {
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
      const parsedData = JSON.parse(cachedData);
      if (!parsedData?.selectedTaskId) return;

      setSelectedTaskId(parsedData.selectedTaskId || "");
      setSelectedTaskName(parsedData.selectedTaskName || "");
      setElapsedSeconds(parsedData.elapsedSeconds || 0);

      // ACTIVE segments
      const restoredActive = (parsedData.segments || []).map((s) => ({
        startAt: new Date(s.startAt),
        endAt: new Date(s.endAt),
      }));

      // RAW segments (fallback to ACTIVE for old drafts)
      const restoredRaw = (parsedData.rawSegments || parsedData.segments || []).map((s) => ({
        startAt: new Date(s.startAt),
        endAt: new Date(s.endAt),
      }));

      // If capturing when saved, close open segment using savedAt
      if (parsedData.savedAt && parsedData.isCapturing && !parsedData.isPaused) {
        if (parsedData.openStartAt) {
          restoredActive.push({
            startAt: new Date(parsedData.openStartAt),
            endAt: new Date(parsedData.savedAt),
          });
        }
        if (parsedData.openRawStartAt) {
          restoredRaw.push({
            startAt: new Date(parsedData.openRawStartAt),
            endAt: new Date(parsedData.savedAt),
          });
        } else if (parsedData.openStartAt) {
          // older draft: treat openStartAt as raw too
          restoredRaw.push({
            startAt: new Date(parsedData.openStartAt),
            endAt: new Date(parsedData.savedAt),
          });
        }
      }

      segmentsRef.current = restoredActive;
      rawSegmentsRefSafe.current = restoredRaw;

      pendingAutoSubmitRef.current = !!parsedData.pendingAutoSubmit;

      restoredDraftRef.current = {
        selectedTaskId: parsedData.selectedTaskId,
        selectedTaskName: parsedData.selectedTaskName || "",
        elapsedSeconds: Number(parsedData.elapsedSeconds || 0),
        savedAt: parsedData.savedAt || null,
      };

      setIsCapturing(false);
      setIsPaused(false);
    } catch (e) {
      console.error("Failed to parse cachedData:", e);
    }
  }, []);

  // Auto-save while capturing
  useEffect(() => {
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current);
      autoSaveRef.current = null;
    }

    if (isCapturing) {
      autoSaveRef.current = setInterval(() => {
        if (!selectedTaskId) return;
        persistDraft(true, { reason: "autosave" });
      }, 10000);
    }

    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
        autoSaveRef.current = null;
      }
    };
  }, [isCapturing, selectedTaskId, selectedTaskName]);

  // beforeunload + visibilitychange
  useEffect(() => {
    const onBeforeUnload = () => finalizeAndPersistOnClose("beforeunload");

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") finalizeAndPersistOnClose("hidden");
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [selectedTaskId]);

  // Offline event
  useEffect(() => {
    const onOffline = () => handleNetworkLoss("offline_event");
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [selectedTaskId]);

  // Offline polling
  useEffect(() => {
    if (networkPollRef.current) clearInterval(networkPollRef.current);

    networkPollRef.current = setInterval(() => {
      const nowOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      if (lastOnlineRef.current && !nowOnline) {
        lastOnlineRef.current = nowOnline;
        handleNetworkLoss("poll_offline");
      } else {
        lastOnlineRef.current = nowOnline;
      }
    }, 3000);

    return () => {
      clearInterval(networkPollRef.current);
      networkPollRef.current = null;
    };
  }, [selectedTaskId]);

  // Login auto-save once tasks load
  useEffect(() => {
    const runLoginAutoSave = async () => {
      if (autoSavedDraftOnceRef.current) return;
      if (loginAutoSaveInFlightRef.current) return;
      if (!taskData || taskData.length === 0) return;

      const draft = restoredDraftRef.current;
      if (!draft?.selectedTaskId) return;

      loginAutoSaveInFlightRef.current = true;
      autoSavedDraftOnceRef.current = true;

      const serverTask = taskData.find(
        (tt) => String(getTaskId(tt)) === String(draft.selectedTaskId)
      );

      if (!serverTask) {
        loginAutoSaveInFlightRef.current = false;
        autoSavedDraftOnceRef.current = false;
        return;
      }

      const draftSeconds = Number(draft.elapsedSeconds || 0);
      const serverSeconds = toSeconds(serverTask?.last_timing);

      const totalSeconds = Math.max(0, Math.floor(Math.max(draftSeconds, serverSeconds)));

      if (draft.selectedTaskName && !selectedTaskName) {
        setSelectedTaskName(draft.selectedTaskName);
      } else if (serverTask?.task_name && !selectedTaskName) {
        setSelectedTaskName(serverTask.task_name);
      }

      if (totalSeconds !== elapsedSecondsRef.current) setElapsedSeconds(totalSeconds);

      try {
        const developerId = Number(localStorage.getItem("user_id") || 0) || null;
        const tenantId = Number(localStorage.getItem("tenant_id") || 0) || null;

        // 1) update task timing (only if needed)
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
            }
          );

          if (!updateRes.ok) {
            const upd = await updateRes.json().catch(() => ({}));
            console.warn("Login auto-save task-update failed:", upd);
          }
        }

        // 2) time-tracking post:
        // RAW task_start/task_end + active_seconds (deducted)
        const rawSegs = rawSegmentsRefSafe.current || [];
        const actSegs = segmentsRef.current || [];

        const segmentsToSend = [];
        for (let i = 0; i < rawSegs.length; i++) {
          const raw = rawSegs[i];
          const act = actSegs[i];

          const rawSt = raw?.startAt ? new Date(raw.startAt).getTime() : 0;
          const rawEn = raw?.endAt ? new Date(raw.endAt).getTime() : 0;
          if (!rawSt || !rawEn || rawEn <= rawSt) continue;

          const window_seconds = Math.floor((rawEn - rawSt) / 1000);

          let active_seconds = window_seconds;
          const actSt = act?.startAt ? new Date(act.startAt).getTime() : 0;
          const actEn = act?.endAt ? new Date(act.endAt).getTime() : 0;
          if (actSt && actEn && actEn > actSt) {
            active_seconds = Math.floor((actEn - actSt) / 1000);
          }
          active_seconds = Math.max(0, Math.min(active_seconds, window_seconds));
          const idle_seconds = Math.max(0, window_seconds - active_seconds);

          segmentsToSend.push({
            task_id: Number(draft.selectedTaskId),
            project_id: Number(serverTask.project_id),
            developer_id: developerId,
            work_date: formatDateYMD(new Date(rawSt)),
            task_start: toIsoNoMs(new Date(rawSt)),
            task_end: toIsoNoMs(new Date(rawEn)),
            tenant_id: tenantId,
            user_tz: getUserTz(),
            user_offset_minutes: getUserOffsetMinutes(),

            window_seconds,
            active_seconds,
            idle_seconds,
            tracked_seconds: active_seconds,
          });
        }

        if (segmentsToSend.length > 0) {
          const bodyToSend =
            segmentsToSend.length === 1 ? segmentsToSend[0] : segmentsToSend;

          const timeTrackingRes = await fetch(`${API_BASE}/api/time-tracking`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(bodyToSend),
          });

          const ttData = await timeTrackingRes.json().catch(() => ({}));
          if (!timeTrackingRes.ok) {
            console.warn("Time-tracking sync failed:", ttData);
          }
        }

        // 3) flagger back to 0
        try {
          await updateTaskFlagger(draft.selectedTaskId, 0);
        } catch (e) {
          console.warn("updateTaskFlagger failed:", e);
        }

        if (!shownAutoSavedToastRef.current) {
          shownAutoSavedToastRef.current = true;
          showToast(
            t("toast.recoveredDraft", {
              defaultValue: "✅ Previous session time was saved automatically. Reloading…",
            })
          );
        }

        disableDraftWritesRef.current = true;

        if (autoSaveRef.current) {
          clearInterval(autoSaveRef.current);
          autoSaveRef.current = null;
        }

        startAtRef.current = null;
        rawStartAtRefSafe.current = null;

        segmentsRef.current = [];
        rawSegmentsRefSafe.current = [];

        pendingAutoSubmitRef.current = false;

        setSelectedTaskId("");
        setSelectedTaskName("");
        setElapsedSeconds(0);

        clearDraft();
        setTimeout(() => window.location.reload(), 600000);
      } catch (e) {
        console.error("Login auto-save error:", e);
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
