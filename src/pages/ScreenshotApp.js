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

  const handleTaskChange = async (e) => {
    ///----------------------------------------
    console.log("its clicked");
    console.log(e.target.value);
    const newId = e.target.value;
    setSelectedTaskId(newId);
    const task = taskData.find((t) => String(getTaskId(t)) === String(newId));
    setSelectedTaskName(task?.task_name ?? "");
    const baseSeconds = toSeconds(task?.last_timing);
    setElapsedSeconds(baseSeconds);

    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/tasks/task-flagger`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "include",
          body: JSON.stringify({
            user_id: Number(user_id),
            edit_task_id: Number(newId),
            flagger: 1,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        console.error("Flagger API failed:", data);
        // optional: roll back optimistic UI or show a toast
        // setSelectedTaskId(prevId);
        // setSelectedTaskName(prevName);
        // setElapsedSeconds(prevSeconds);
        return;
      }

      console.log("Flagger API success:", data); // { ok, message, cleared, updated }
      // optional: toast success
    } catch (err) {
      console.error("Flagger API error:", err);
    }
  };

  // token (optional) + initial loads
  useEffect(() => {
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
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/tasks/${user_id}`,
        { method: "GET", credentials: "include" }
      );
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
      const res = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/projects/${user_id}`,
        {
          method: "GET",
          credentials: "include",
        }
      );
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
      const res = await fetch(`${process.env.REACT_APP_API_BASE}/api/users`, {
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
          setCurrUser(me);
        }
      }
    } catch (e) {
      console.error("Fetch users error:", e);
    }
  };

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

  // video stream + periodic refresh
  useEffect(() => {
    const setupVideoStream = async () => {
      try {
        const sources = await window.electronAPI.getSources();
        if (!sources.length) return;

        const selectedSource = sources[0];
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
  }, []);

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

  // START
  const handleStart = () => {
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

  // PAUSE
  const handlePause = () => {
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

  // RESUME
  const handleResume = () => {
    startAtRef.current = new Date();
    setIsCapturing(true);
    setIsPaused(false);
    startTimer();
    startSampling();
    startScreenshotCycle();
  };

  // SUBMIT
  const handleFinish = async () => {
    ///----------------------------------------
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
    console.log("Task data,---", taskData);

    const developerId = Number(localStorage.getItem("user_id") || 0);

    const rows = segmentsRef.current
      .filter((s) => s.startAt && s.endAt && s.endAt > s.startAt)
      .map((seg) => ({
        task_id: Number(getTaskId(theTask)),
        project_id: Number(theTask.project_id),
        developer_id: developerId || null,
        work_date: formatDateYMD(seg.startAt),
        task_start: formatDateTime(seg.startAt),
        task_end: formatDateTime(seg.endAt),
      }));

    if (rows.length === 0) {
      showToast("Nothing to submit.");
      return;
    }

    const bodyToSend = rows.length === 1 ? rows[0] : rows;

    try {
      const ttRes = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/time-tracking`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(bodyToSend),
        }
      );
      const ttData = await ttRes.json();
      if (!ttRes.ok) {
        showToast(ttData?.error || "Failed to submit time tracking.");
        setShowFinishConfirm(true);
        return;
      }

      const [hh, mm, ss] = formatTime(elapsedSeconds).split(":").map(Number);
      const totalSeconds = hh * 3600 + mm * 60 + ss;

      const updateRes = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/tasks/task-update/${selectedTaskId}`,
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

      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_BASE}/api/tasks/task-flagger`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            credentials: "include",
            body: JSON.stringify({
              user_id: Number(user_id),
              edit_task_id: Number(selectedTaskId),
              flagger: 0,
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) {
          console.error("Flagger API failed:", data);
          return;
        }
        console.log("Flagger API success:", data);
      } catch (err) {
        console.error("Flagger API error:", err);
      }

      showToast("Time tracking saved!");
      setTimeout(() => window.location.reload(), 1000);
      // setShowFinishConfirm(true);
      segmentsRef.current = [];
    } catch (err) {
      console.error("Error submitting time tracking:", err);
      showToast("Network error submitting time tracking.");
      // setShowFinishConfirm(true);
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
          await fetch(`${process.env.REACT_APP_API_BASE}/api/screenshot-data`, {
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
      await fetch(`${process.env.REACT_APP_API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      localStorage.removeItem("user_id");
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
    setSelectedProjectId(e.target.value); // "" means ALL
  };
  /* -------------------------------------------------------------------- */

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
                disabled={isCapturing || isPaused}
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
                disabled={isCapturing || isPaused}
              >
                <option value="" disabled>
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

          {/* Full-width warning BELOW both selects */}
          {isCapturing && (
            <p className="selection-warning" role="alert">
              You must finish the current task before selecting a new one.
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
            >
              Start
            </button>
          )}
          <button
            id="stopBtn"
            className="button is-danger"
            onClick={isPaused ? handleResume : handlePause}
          >
            {isPaused ? "Resume" : "Pause"}
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

      {/* Add Task Modal */}
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
