import React, { useEffect, useRef, useState, useMemo } from "react";
import "../styles/screenshotapp.css";

/* Your components */
import Sidebar from "../components/Sidebar";
import AddTaskModal from "../components/AddTaskModal";

/* ---------- Minimal Confirm Dialog (kept inline) ---------- */
const ConfirmDialog = ({ open, title, subtitle, onCancel, onConfirm }) => {
  if (!open) return null;
  return (
    <div className="confirm-backdrop" role="dialog" aria-modal="true">
      <div className="confirm-card">
        <h3 className="confirm-title">{title}</h3>
        {subtitle ? <p className="confirm-subtitle">{subtitle}</p> : null}
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button className="btn success" onClick={onConfirm}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
/* --------------------------------------------------------- */

const ScreenshotApp = () => {
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const samplingRef = useRef(null);
  const captureIntervalRef = useRef(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // DATA
  const [taskData, setTaskData] = useState([]);
  const [projects, setProjects] = useState([]);

  // SELECTIONS
  const [selectedProjectId, setSelectedProjectId] = useState(""); // "" = All projects
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTaskName, setSelectedTaskName] = useState("");

  const [token, setToken] = useState(null);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Modal + data for modal
  const [currUser, setCurrUser] = useState(null);
  const [allUsers, setAllUsers] = useState({});
  const [activeSection, setActiveSection] = useState("dashboard");
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  // timing + segments
  const startAtRef = useRef(null);
  const segmentsRef = useRef([]);

  // idle + capture
  const idleSecondsThisCycleRef = useRef(0);
  const secondsSampledRef = useRef(0);
  const streamRef = useRef(null);

  const user_id = localStorage.getItem("user_id");
  const user_name = localStorage.getItem("user_name");
  const tenant_id = localStorage.getItem("tenant_id");
  const API_BASE = process.env.REACT_APP_API_BASE;

  // ---- helpers ----
  const getTaskId = (t) => t?.id ?? t?.task_id ?? t?._id;
  const pad = (n) => String(n).padStart(2, "0");
  const formatTime = (total) => {
    const s = Math.max(0, Math.floor(total || 0));
    const hh = pad(Math.floor(s / 3600));
    const mm = pad(Math.floor((s % 3600) / 60));
    const ss = pad(s % 60);
    return `${hh}:${mm}:${ss}`;
  };
  const toSeconds = (val) => {
    if (val === null || val === undefined) return 0;
    const n = parseInt(String(val).trim(), 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const formatDateYMD = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  const formatDateTime = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return `${formatDateYMD(dt)} ${pad(dt.getHours())}:${pad(
      dt.getMinutes()
    )}:${pad(dt.getSeconds())}`;
  };

  // ========= FREELANCER APPROVAL STATE =========
  const [approvalStatus, setApprovalStatus] = useState(null); // 0,1,2
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");

  const approvalApiBase = `${API_BASE}/api/users`;

  // Role detection (robust)
  const getRoleLower = () => {
    const fromUser = (
      currUser?.role ||
      currUser?.user_role ||
      currUser?.role_name ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    if (fromUser) return fromUser;

    const fromLocal = (localStorage.getItem("user_role") || "")
      .toString()
      .trim()
      .toLowerCase();
    return fromLocal;
  };

  const isFreelancer = getRoleLower() === "freelancer";

  async function fetchApprovalStatus(uid) {
    try {
      console.log("[Approval] Fetching via POST … user_id:", uid);
      setApprovalLoading(true);
      setApprovalError("");

      const res = await fetch(
        `${approvalApiBase}/Time-sheet-approval/getLatestValue`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ user_id: Number(uid) }),
        }
      );

      const json = await res.json();
      console.log("[Approval] Response:", json);

      if (!res.ok) {
        throw new Error(json?.message || "Failed to fetch approval status");
      }

      const val = Number(json?.time_sheet_approval);
      const normalized = Number.isFinite(val) ? val : 0;
      // 0 = not sent, 1 = sent, 2 = rejected (example mapping)
      setApprovalStatus(normalized === 1 ? 1 : normalized === 2 ? 2 : 0);

      // previous behavior: return true if status === 0 (can send)
      return normalized === 0;
    } catch (e) {
      console.error("getLatestValue error:", e);
      setApprovalError(e?.message || "Failed to fetch approval status");
      return false; // be conservative on error
    } finally {
      setApprovalLoading(false);
    }
  }

  const blockSelections =
    isFreelancer && approvalStatus === 1 && !approvalLoading;

  const showToast = (message) => {
    const toast = document.createElement("div");
    toast.className = "custom-toast";
    toast.innerText = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.parentNode?.removeChild(toast), 300);
    }, 2500);
  };

  // ---------- helper to update task flagger ----------
  const updateTaskFlagger = async (taskId, flagValue) => {
    if (!taskId && taskId !== 0 && taskId !== "0") return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks/task-flagger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          user_id: Number(user_id),
          edit_task_id: Number(taskId),
          flagger: Number(flagValue),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Flagger API failed:", data);
        return;
      }
      console.log("Flagger API success:", data);
    } catch (err) {
      console.error("Flagger API error:", err);
    }
  };
  // --------------------------------------------------------

  // When user changes task (including selecting "none"/default option)
  const handleTaskChange = async (e) => {
    if (blockSelections) {
      showToast("Let Admin approve previous Payments before");
      return;
    }

    const newId = e.target.value;         // "" (none) or task id
    const prevId = selectedTaskId;        // old selection

    // 1) If there was a previous task selected, reset its flagger to 0
    if (prevId) {
      updateTaskFlagger(prevId, 0);
    }

    // 2) If user selected the "none / Select Task" option
    if (!newId) {
      setSelectedTaskId("");
      setSelectedTaskName("");
      setElapsedSeconds(0);
      localStorage.removeItem("selectedTaskId");
      return; // don't set any new flagger
    }

    // 3) Normal flow for a real task selection
    setSelectedTaskId(newId);
    const task = taskData.find((t) => String(getTaskId(t)) === String(newId));
    setSelectedTaskName(task?.task_name ?? "");
    const baseSeconds = toSeconds(task?.last_timing);
    setElapsedSeconds(baseSeconds);

    // Remember this in localStorage for refresh cleanup
    localStorage.setItem("selectedTaskId", newId);

    // Flag this new task as 1
    updateTaskFlagger(newId, 1);
  };

  // token (optional) + initial loads
  useEffect(() => {
    const roleLS = (localStorage.getItem("user_role") || "").toString();
    console.log("[Approval] Early check. {roleLS, user_id}", {
      roleLS,
      user_id,
    });

    window.electronAPI
      .getTokenCookie()
      .then((fetchedToken) => {
        if (fetchedToken) setToken(fetchedToken);
        fetchTasks();
        fetchProjects();
        fetchUsers();
      })
      .catch(() => {
        fetchTasks();
        fetchProjects();
        fetchUsers();
      });
  }, []); // mount only

  // 🔁 On refresh / new mount: if we had a previous selected task stored,
  // reset its flagger to 0 and clear the stored key.
  useEffect(() => {
    const lastTaskId = localStorage.getItem("selectedTaskId");
    if (lastTaskId) {
      console.log("[Flagger] Resetting last selected task on mount:", lastTaskId);
      updateTaskFlagger(lastTaskId, 0);
      localStorage.removeItem("selectedTaskId");
    }
  }, []); // run once on mount

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/tasks/${user_id}`, {
        method: "GET",
        credentials: "include",
      });
      if (response.status === 401) return;
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      const filteredTasks = Array.isArray(data?.tasks)
        ? data.tasks.filter((task) => task.status !== "completed")
        : [];
      setTaskData(filteredTasks);
    } catch (error) {
      console.error("Fetch tasks error:", error);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${user_id}`, {
        method: "GET",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const raw = Array.isArray(data?.projects)
          ? data.projects
          : Array.isArray(data?.allprojects)
          ? data.allprojects
          : [];

        const simplified = raw.map((p) => ({
          project_id: p.project_id,
          project_name: p.project_name,
        }));

        setProjects(simplified);
      }
    } catch (e) {
      console.error("Fetch projects error:", e);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: "GET",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data?.users || []);

        const uid = localStorage.getItem("user_id");
        if (uid && Array.isArray(data?.users)) {
          const me =
            data.users.find((u) => String(u.user_id) === String(uid)) || null;
          console.log("[Users] Current user loaded:", me);
          console.log("Dats users ", data?.users);
          setCurrUser(me);

          const resolvedRole =
            (me?.role || me?.user_role || me?.role_name || "")
              .toString()
              .trim();
          if (resolvedRole) {
            localStorage.setItem("user_role", resolvedRole);
          }
        }
      }
    } catch (e) {
      console.error("Fetch users error:", e);
    }
  };

  // Fetch approval status when we know current user & they are freelancer
  useEffect(() => {
    if (!currUser?.user_id) {
      console.log("[Approval] currUser not ready yet; waiting…");
      return;
    }
    const roleLower = getRoleLower();
    if (roleLower === "freelancer") {
      console.log(
        "[Approval] Checking via currUser. user_id:",
        currUser.user_id,
        "role:",
        roleLower
      );
      // initial load check
      fetchApprovalStatus(currUser.user_id);
    } else {
      console.log("[Approval] Not a freelancer:", roleLower);
      setApprovalStatus(null);
      setApprovalError("");
    }
  }, [currUser?.user_id, currUser?.role, currUser?.user_role, currUser?.role_name]);

  // video stream + periodic refresh
  useEffect(() => {
    const setupVideoStream = async () => {
      try {
        const sources = await window.electronAPI.getSources();
        if (!sources.length) return;

        const selectedSource = sources[0];

        try {
          await videoRef.current?.pause?.();
        } catch {}

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: selectedSource.id,
            },
          },
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("❌ Error setting up video stream:", err);
      }
    };

    setupVideoStream();
    const interval = setInterval(fetchTasks, 30000);

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearInterval(timerRef.current);
      if (samplingRef.current) clearInterval(samplingRef.current);
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []); // mount only

  // timers/sampling/capture
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  };
  const stopTimer = () => clearInterval(timerRef.current);

  const startSampling = () => {
    samplingRef.current = setInterval(async () => {
      const idle = await window.electronAPI.getIdleTime();
      if (idle >= 1) idleSecondsThisCycleRef.current++;
      secondsSampledRef.current++;
    }, 1000);
  };
  const stopSampling = () => {
    clearInterval(samplingRef.current);
    idleSecondsThisCycleRef.current = 0;
    secondsSampledRef.current = 0;
  };

  const startScreenshotCycle = () => {
    captureIntervalRef.current = setInterval(() => {
      evaluateAndCapture();
    }, 30 * 1000);
  };
  const stopScreenshotCycle = () => clearInterval(captureIntervalRef.current);

  // === LIVE CHECK on Start ===
  const handleStart = async () => {
    // If freelancer, do a fresh approval check right now
    if (isFreelancer && currUser?.user_id) {
      const allowed = await fetchApprovalStatus(currUser.user_id);
      if (!allowed) {
        showToast("Let Admin approve previous Payments before");
        return;
      }
    }

    if (!selectedTaskId) {
      showToast("⚠ Please select a task before starting!");
      return;
    }
    startAtRef.current = new Date();

    if (!isCapturing) {
      setIsCapturing(true);
      setIsPaused(false);
      startTimer();
      startSampling();
      startScreenshotCycle();
    }
  };

  // PAUSE (disabled when approval is 1; also guarded)
  const handlePause = () => {
    if (isFreelancer && approvalStatus === 1) {
      showToast("Let Admin approve previous Payments before");
      return;
    }

    if (startAtRef.current) {
      segmentsRef.current.push({
        startAt: new Date(startAtRef.current),
        endAt: new Date(),
      });
      startAtRef.current = null;
    }

    setIsCapturing(false);
    setIsPaused(true);
    stopTimer();
    stopSampling();
    stopScreenshotCycle();
  };

  // RESUME (also re-check live)
  const handleResume = async () => {
    if (isFreelancer && currUser?.user_id) {
      const allowed = await fetchApprovalStatus(currUser.user_id);
      if (!allowed) {
        showToast("Let Admin approve previous Payments before");
        return;
      }
    }
    startAtRef.current = new Date();
    setIsCapturing(true);
    setIsPaused(false);
    startTimer();
    startSampling();
    startScreenshotCycle();
  };

  // SUBMIT
  const handleFinish = async () => {
    if (startAtRef.current) {
      segmentsRef.current.push({
        startAt: new Date(startAtRef.current),
        endAt: new Date(),
      });
      startAtRef.current = null;
    }

    if (segmentsRef.current.length === 0) {
      showToast("No time captured. Please Start first.");
      return;
    }

    setIsCapturing(false);
    setIsPaused(true);
    stopTimer();
    stopSampling();
    stopScreenshotCycle();

    const theTask = taskData.find(
      (t) => String(getTaskId(t)) === String(selectedTaskId)
    );
    if (!theTask) {
      showToast("Selected task not found.");
      return;
    }

    const developerId = Number(localStorage.getItem("user_id") || 0);
    const tenant_id = Number(localStorage.getItem("tenant_id") || 0);

    const rows = segmentsRef.current
      .filter((s) => s.startAt && s.endAt && s.endAt > s.startAt)
      .map((seg) => ({
        task_id: Number(getTaskId(theTask)),
        project_id: Number(theTask.project_id),
        developer_id: developerId || null,
        work_date: formatDateYMD(seg.startAt),
        task_start: formatDateTime(seg.startAt),
        task_end: formatDateTime(seg.endAt),
        tenant_id: tenant_id || null,
      }));

    if (rows.length === 0) {
      showToast("Nothing to submit.");
      return;
    }

    const bodyToSend = rows.length === 1 ? rows[0] : rows;

    try {
      const ttRes = await fetch(`${API_BASE}/api/time-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyToSend),
      });
      const ttData = await ttRes.json();
      if (!ttRes.ok) {
        showToast(ttData?.error || "Failed to submit time tracking.");
        setShowFinishConfirm(true);
        return;
      }

      const [hh, mm, ss] = formatTime(elapsedSeconds).split(":").map(Number);
      const totalSeconds = hh * 3600 + mm * 60 + ss;

      const updateRes = await fetch(
        `${API_BASE}/api/tasks/task-update/${selectedTaskId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            taskId: selectedTaskId,
            last_timing: totalSeconds,
          }),
        }
      );
      if (!updateRes.ok) {
        const upd = await updateRes.json().catch(() => ({}));
        console.warn("Task update (last_timing) failed:", upd);
      }

      // reset flagger for this task on successful submit
      await updateTaskFlagger(selectedTaskId, 0);
      localStorage.removeItem("selectedTaskId");

      showToast("Time tracking saved!");
      setTimeout(() => window.location.reload(), 1000);
      segmentsRef.current = [];
    } catch (err) {
      console.error("Error submitting time tracking:", err);
      showToast("Network error submitting time tracking.");
    }
  };

  const confirmFinish = () => {
    setShowFinishConfirm(false);
    window.location.reload();
  };
  const cancelFinish = () => setShowFinishConfirm(false);

  // Quit
  const handleQuit = () => setShowQuitConfirm(true);
  const confirmQuit = () => {
    if (isCapturing) handlePause();
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
    setShowQuitConfirm(false);
    window.history.back();
  };
  const cancelQuit = () => setShowQuitConfirm(false);

  // Logout (triggered from Sidebar)
  const handleRequestLogout = () => {
    if (isCapturing || isPaused) return;
    setShowLogoutConfirm(true);
  };
  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    if (isCapturing) handlePause();
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
    await handleLogout();
  };
  const cancelLogout = () => setShowLogoutConfirm(false);

  // capture sampling
  const evaluateAndCapture = async () => {
    const timestamp = new Date().toLocaleTimeString();
    const idle = idleSecondsThisCycleRef.current;
    const active = 30 - idle;

    if (active >= 15) {
      const ssResult = await takeScreenshot();
      if (ssResult?.success) {
        try {
          const dataToSend = {
            screenshotPath: ssResult.path,
            task_id: selectedTaskId,
            timestamp,
            idleSeconds: idle,
            activeSeconds: active,
          };
          await fetch(`${API_BASE}/api/screenshot-data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(dataToSend),
          });
        } catch (err) {
          console.error("❌ Error posting screenshot data:", err);
        }
      }
    }
    idleSecondsThisCycleRef.current = 0;
    secondsSampledRef.current = 0;
  };

  const takeScreenshot = async () => {
    try {
      const sources = await window.electronAPI.getSources();
      if (!sources.length) return;

      const selectedSource = sources[0];

      try {
        await videoRef.current?.pause?.();
      } catch {}

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: selectedSource.id,
          },
        },
      });

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const result = await window.electronAPI.saveImage(uint8Array);
      if (result.success) return { success: true, path: result.path };
    } catch (err) {
      console.error("❌ Error during screenshot process:", err);
    }
  };

  // logout request
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      localStorage.removeItem("user_id");
      localStorage.removeItem("auth_name");
      localStorage.removeItem("user_name");
      localStorage.removeItem("user_role");
      localStorage.removeItem("tenant_id");
      try {
        await window.electronAPI?.clearTokenCookie?.();
      } catch {}
      window.location.assign("/login");
    } catch {
      window.location.assign("/login");
    }
  };

  const sections = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      {
        key: "tasks",
        label: "Tasks",
        children: [
          { key: "create-task", label: "Create Task", action: "create-task" },
        ],
      },
      { key: "settings", label: "Settings" },
    ],
    []
  );

  /* ----------------- FILTERED TASKS (Project -> Tasks) ----------------- */
  const filteredTasks = useMemo(() => {
    if (!selectedProjectId) return taskData;
    return taskData.filter(
      (t) => String(t.project_id) === String(selectedProjectId)
    );
  }, [taskData, selectedProjectId]);

  // If current selectedTaskId doesn't exist in filteredTasks, clear it.
  useEffect(() => {
    if (
      selectedTaskId &&
      !filteredTasks.some(
        (t) => String(getTaskId(t)) === String(selectedTaskId)
      )
    ) {
      setSelectedTaskId("");
      setSelectedTaskName("");
      setElapsedSeconds(0);
    }
  }, [filteredTasks, selectedTaskId]);

  const handleProjectFilterChange = (e) => {
    if (blockSelections) {
      showToast("Let Admin approve previous Payments before");
      return;
    }
    setSelectedProjectId(e.target.value); // "" means ALL
  };

  return (
    <div className="app-shell">
      {/* Sidebar wrapper: 240px content + 48px rail when collapsed */}
      <div className={`sb-wrap ${sidebarCollapsed ? "collapsed" : "expanded"}`}>
        <div className="sb-content">
          {!sidebarCollapsed && (
            <Sidebar
              sections={sections}
              activeKey={activeSection}
              onSelect={(k) => setActiveSection(k)}
              onCreateTask={() => setAddTaskOpen(true)}
              onLogout={handleRequestLogout}
              logoutDisabled={isCapturing || isPaused}
            />
          )}
        </div>

        <div className="sb-rail">
          <button
            type="button"
            className="sb-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label="Toggle Sidebar"
            title={sidebarCollapsed ? "Expand" : "Collapse"}
          >
            {sidebarCollapsed ? "☰" : "«"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="app-main">
        {/* Finish Confirmation */}
        <ConfirmDialog
          open={showFinishConfirm}
          title="Task Finished"
          subtitle="Your task has been completed and saved."
          onCancel={() => setShowFinishConfirm(false)}
          onConfirm={() => {
            setShowFinishConfirm(false);
            window.location.reload();
          }}
        />

        {/* Quit Confirmation */}
        <ConfirmDialog
          open={showQuitConfirm}
          title="Quit session?"
          subtitle={
            isCapturing
              ? "Capture is currently running. We’ll stop it and discard the current cycle."
              : ""
          }
          onCancel={cancelQuit}
          onConfirm={confirmQuit}
        />

        {/* Logout Confirmation */}
        <ConfirmDialog
          open={showLogoutConfirm}
          title="Log out?"
          subtitle={
            isCapturing
              ? "Capture is currently running. We’ll stop it before logging out."
              : ""
          }
          onCancel={cancelLogout}
          onConfirm={confirmLogout}
        />

        {/* ---------------- Project + Task selectors ---------------- */}
        <div className="select-container">
          <div
            className="filter-row"
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "1fr 1fr",
              alignItems: "end",
            }}
          >
            <div className="filter-item">
              <label>Filter by Project:</label>
              <select
                value={selectedProjectId}
                onChange={handleProjectFilterChange}
                className="scrollable-select"
                disabled={
                  isCapturing ||
                  isPaused ||
                  blockSelections ||
                  approvalLoading
                }
              >
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.project_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-item">
              <label>Choose Your Task:</label>
              <select
                value={selectedTaskId}
                onChange={handleTaskChange}
                className="scrollable-select"
                disabled={
                  isCapturing ||
                  isPaused ||
                  blockSelections ||
                  approvalLoading
                }
              >
                {/* NOTE: now this is selectable (not disabled) and value="" means "none" */}
                <option value="">
                  {filteredTasks.length ? "Select Task" : "No tasks available"}
                </option>
                {filteredTasks.map((task) => {
                  const tid = getTaskId(task);
                  return (
                    <option key={tid} value={tid}>
                      {task.task_name}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Full-width warning BELOW both selects when blocked */}
          {isFreelancer && approvalStatus === 1 && (
            <p className="selection-warning" role="alert">
              Let Admin approve previous Payments before
            </p>
          )}
        </div>

        {/* ----------------------------------------------------------- */}

        <video id="video" ref={videoRef}></video>

        <div className="btn-row">
          {!isCapturing && !isPaused && (
            <button
              id="screenshotBtn"
              className="button is-success"
              onClick={handleStart}
              disabled={approvalLoading} // Start is live-checked on click; not hard-disabled by status
              title={
                isFreelancer && approvalStatus === 1
                  ? "We’ll re-check approval when you click Start"
                  : ""
              }
            >
              Start
            </button>
          )}
          <button
            id="stopBtn"
            className="button is-danger"
            onClick={isPaused ? handleResume : handlePause}
            disabled={
              (!isPaused && isFreelancer && approvalStatus === 1) || false
            }
            title={
              !isPaused && isFreelancer && approvalStatus === 1
                ? "Claim previous Payments before"
                : ""
            }
          >
            {isPaused ? "Pause" : "Pause"}
          </button>

          <button
            id="finishBtn"
            className="button is-danger"
            onClick={handleFinish}
          >
            Submit Task
          </button>
        </div>

        <div className="timer">
          <strong>Capture Duration:</strong>{" "}
          <span id="timer">{formatTime(elapsedSeconds)}</span>
        </div>
      </main>

      {/* Add Task-1 Modal */}
      <AddTaskModal
        open={addTaskOpen}
        onClose={(didSave) => {
          setAddTaskOpen(false);
          if (didSave) fetchTasks();
        }}
        projects={projects}
        curruser={currUser}
        allusers={allUsers}
      />
    </div>
  );
};

export default ScreenshotApp;
