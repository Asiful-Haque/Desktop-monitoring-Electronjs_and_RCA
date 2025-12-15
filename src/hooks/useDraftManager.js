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

  // refs
  elapsedSecondsRef,
  setElapsedSeconds,
  segmentsRef,
  startAtRef,
  isCapturingRef,

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

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    pendingAutoSubmitRef.current = false;
    restoredDraftRef.current = null;
  };

  // ✅ Save draft to localStorage (always ISO strings)
  const persistDraft = (forcePending = true, meta = {}) => {
    try {
      const stateToSave = {
        selectedTaskId,
        selectedTaskName,
        elapsedSeconds: elapsedSecondsRef.current,
        segments: (segmentsRef.current || []).map((s) => ({
          startAt: (
            s?.startAt instanceof Date ? s.startAt : new Date(s.startAt)
          ).toISOString(),
          endAt: (
            s?.endAt instanceof Date ? s.endAt : new Date(s.endAt)
          ).toISOString(),
        })),
        openStartAt: startAtRef.current
          ? (
              startAtRef.current instanceof Date
                ? startAtRef.current.toISOString()
                : new Date(startAtRef.current).toISOString()
            )
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
    try {
      if (isCapturingRef.current && startAtRef.current) {
        const end = new Date();
        segmentsRef.current.push({
          startAt: new Date(startAtRef.current),
          endAt: end,
        });
        startAtRef.current = null;
      }

      if (selectedTaskId && (segmentsRef.current || []).length > 0) {
        persistDraft(true, { reason });
      }
    } catch (e) {
      console.error("finalizeAndPersistOnClose failed:", e);
    }
  };

  const handleNetworkLoss = (reason = "offline") => {
    try {
      if (startAtRef.current) {
        segmentsRef.current.push({
          startAt: new Date(startAtRef.current),
          endAt: new Date(),
        });
        startAtRef.current = null;
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
    console.log("🎥🟢 We found some data in localStorage:", cachedData);

    if (!cachedData) return;

    try {
      const parsedData = JSON.parse(cachedData);

      if (parsedData && parsedData.selectedTaskId) {
        setSelectedTaskId(parsedData.selectedTaskId || "");
        setSelectedTaskName(parsedData.selectedTaskName || "");
        setElapsedSeconds(parsedData.elapsedSeconds || 0);

        const restoredSegments = (parsedData.segments || []).map((s) => ({
          startAt: new Date(s.startAt),
          endAt: new Date(s.endAt),
        }));

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

        segmentsRef.current = restoredSegments;
        pendingAutoSubmitRef.current = !!parsedData.pendingAutoSubmit;

        restoredDraftRef.current = {
          selectedTaskId: parsedData.selectedTaskId,
          selectedTaskName: parsedData.selectedTaskName || "",
          elapsedSeconds: Number(parsedData.elapsedSeconds || 0),
          savedAt: parsedData.savedAt || null,
        };

        setIsCapturing(false);
        setIsPaused(false);
      }
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
      if (document.visibilityState === "hidden")
        finalizeAndPersistOnClose("hidden");
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
      const nowOnline =
        typeof navigator !== "undefined" ? navigator.onLine : true;
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
      if (!taskData || taskData.length === 0) return;

      const draft = restoredDraftRef.current;
      if (!draft?.selectedTaskId) return;

      const serverTask = taskData.find(
        (tt) => String(getTaskId(tt)) === String(draft.selectedTaskId)
      );

      const draftSeconds = Number(draft.elapsedSeconds || 0);
      const serverSeconds = toSeconds(serverTask?.last_timing);

      const totalSeconds = Math.max(
        0,
        Math.floor(Math.max(draftSeconds, serverSeconds))
      );

      if (draft.selectedTaskName && !selectedTaskName) {
        setSelectedTaskName(draft.selectedTaskName);
      } else if (serverTask?.task_name && !selectedTaskName) {
        setSelectedTaskName(serverTask.task_name);
      }
      if (totalSeconds !== elapsedSecondsRef.current)
        setElapsedSeconds(totalSeconds);

      try {
        if (serverTask && serverSeconds < totalSeconds) {
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

        autoSavedDraftOnceRef.current = true;

        if (!shownAutoSavedToastRef.current) {
          shownAutoSavedToastRef.current = true;
          showToast(
            t("toast.recoveredDraft", {
              defaultValue:
                "✅ Previous session time was saved automatically. Reloading…",
            })
          );
        }

        clearDraft();
        setTimeout(() => window.location.reload(), 3000);
      } catch (e) {
        console.error("Login auto-save error:", e);
        autoSavedDraftOnceRef.current = true;
      }
    };

    runLoginAutoSave();
    
  }, [taskData, selectedTaskName, API_BASE, t]);

  // expose helper for finish/pause
  return {
    persistDraft,
    clearDraft,
    pendingAutoSubmitRef,
    restoredDraftRef,
    finalizeAndPersistOnClose,
    handleNetworkLoss,
  };
}
