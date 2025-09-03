import React, { useEffect, useRef, useState } from "react";
import "../styles/screenshotapp.css";

/* ---------- Minimal Confirm Dialog (no libs) ---------- */
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
          <button className="btn danger" onClick={onConfirm}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
/* ------------------------------------------------------ */

const ScreenshotApp = () => {
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const samplingRef = useRef(null);
  const captureIntervalRef = useRef(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false); // Track if the task is paused
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [taskData, setTaskData] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTaskName, setSelectedTaskName] = useState("");
  const [token, setToken] = useState(null); // Store the token
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false); // State for finish confirmation
  const [taskFinished, setTaskFinished] = useState(false); // Track if the task is finished

  // Use ref for immediate mutable idle tracking
  const idleSecondsThisCycleRef = useRef(0);
  const secondsSampledRef = useRef(0);
  const streamRef = useRef(null);

  const getTaskId = (t) => t?.id ?? t?.task_id ?? t?._id;

  // Format seconds -> HH:MM:SS
  const formatTime = (total) => {
    const s = Math.max(0, Math.floor(total || 0));
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  // Parse "230" -> 230 (seconds)
  const toSeconds = (val) => {
    if (val === null || val === undefined) return 0;
    const n = parseInt(String(val).trim(), 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const handleChange = (e) => {
    const newId = e.target.value;
    setSelectedTaskId(newId);
    const task = taskData.find((t) => String(getTaskId(t)) === String(newId));
    setSelectedTaskName(task?.task_name ?? "");

    const baseSeconds = toSeconds(task?.last_timing);
    setElapsedSeconds(baseSeconds);
  };

  const user_id = localStorage.getItem("user_id");

  useEffect(() => {
    window.electronAPI
      .getTokenCookie()
      .then((fetchedToken) => {
        if (fetchedToken) {
          setToken(fetchedToken); // Store the token in the state
          fetchData(fetchedToken); // Use the token in the API requests
        } else {
          console.log("Token not found");
        }
      })
      .catch((err) => {
        console.error("Error retrieving token:", err);
      });
  }, []);

  const fetchData = async (token) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/tasks/${user_id}`,
        {
          method: "GET",
          credentials: "include", // Because we are calling another 5500's API
        }
      );
      if (response.status === 401) {
        console.log("Token expired or invalid, please log in again");
        return;
      }

      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      setTaskData(Array.isArray(data?.tasks) ? data.tasks : []);
    } catch (error) {
      console.error("Fetch error:", error);
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
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2500);
  };

  useEffect(() => {
    fetchData(token);

    const setupVideoStream = async () => {
      try {
        const sources = await window.electronAPI.getSources();
        if (!sources.length) return console.warn("⚠️ No sources found.");

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

    const interval = setInterval(() => fetchData(token), 30000);

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearInterval(timerRef.current);
      if (samplingRef.current) clearInterval(samplingRef.current);
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [token]);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current); // Stop the timer but keep elapsedSeconds
  };

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
    }, 1 * 30 * 1000);
  };

  const stopScreenshotCycle = () => {
    clearInterval(captureIntervalRef.current);
  };

  const handleStart = () => {
    if (!selectedTaskId) {
      showToast("⚠ Please select a task before starting!");
      return;
    }

    if (!isCapturing) {
      setIsCapturing(true); // Start capturing
      startTimer(); // Start the timer from the last known `elapsedSeconds`
      startSampling();
      startScreenshotCycle();
    }
  };

  const handlePause = () => {
    setIsCapturing(false); // Stop capturing
    setIsPaused(true); // Set paused state to true
    stopTimer(); // Stop the timer, but retain elapsedSeconds
    stopSampling();
    stopScreenshotCycle();
  };

  const handleResume = () => {
    setIsCapturing(true); // Resume capturing
    setIsPaused(false); // Set paused state to false
    startTimer(); // Restart the timer
    startSampling();
    startScreenshotCycle();
  };

  const handleFinish = async () => {
    console.log("Finishing session...");
    setTaskFinished(true); // Mark the task as finished
    setIsCapturing(false); // Stop capturing
    stopTimer(); // Stop the timer
    stopSampling(); // Stop sampling
    stopScreenshotCycle(); // Stop the screenshot cycle
    console.log("Elapsed seconds at finish:", elapsedSeconds);
    const [hh, mm, ss] = formatTime(elapsedSeconds).split(":").map(Number);
    const totalSeconds = hh * 3600 + mm * 60 + ss;

    const dataToSend = {
      taskId: selectedTaskId,
      last_timing: totalSeconds, // Send last_timing as seconds
    };
        try {
      const response = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/tasks/task-update/${selectedTaskId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(dataToSend),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update task status");
      }
      // showToast("Task successfully submitted!");
    } catch (error) {
      console.error("Error submitting task:", error);
      showToast("Error submitting task.");
    }

    setShowFinishConfirm(true); // Show the finish confirmation dialog
    setIsPaused(true);
  };

  const confirmFinish = () => {
    setShowFinishConfirm(false); // Close the finish confirmation
    window.location.reload(); // Refresh the page after finishing
  };

  const cancelFinish = () => {
    setShowFinishConfirm(false); // Close the finish confirmation if canceled
  };

  const handleQuit = () => {
    setShowQuitConfirm(true);
  };

  const confirmQuit = () => {
    if (isCapturing) handlePause();
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch (e) {
        console.warn("Stream stop error:", e);
      }
      streamRef.current = null;
    }
    setShowQuitConfirm(false);
    window.history.back();
  };

  const cancelQuit = () => setShowQuitConfirm(false);

  const evaluateAndCapture = async () => {
    const timestamp = new Date().toLocaleTimeString();

    const idle = idleSecondsThisCycleRef.current;
    const active = 30 - idle;

    console.log(`[${timestamp}] 🕒 Idle: ${idle}s, Active: ${active}s`);

    if (active < 15) {
      console.log("🚫 Skipping screenshot due to user inactivity");
    } else {
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
          const response = await fetch(
            `${process.env.REACT_APP_API_BASE}/api/screenshot-data`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: 'include',
              body: JSON.stringify(dataToSend),
            }
          );

          if (!response.ok) console.warn("⚠️ Failed to post screenshot data");
          else console.log("✅ Screenshot data posted successfully");
        } catch (err) {
          console.error("❌ Error in evaluateAndCapture POST:", err);
        }
      }
    }

    idleSecondsThisCycleRef.current = 0;
    secondsSampledRef.current = 0;
  };

  const takeScreenshot = async () => {
    try {
      const sources = await window.electronAPI.getSources();
      if (!sources.length) return console.warn("⚠️ No sources found.");

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
      if (result.success) {
        console.log(
          `✅ Screenshot saved under Task: ${selectedTaskName} [${selectedTaskId}], at: ${result.path}`
        );
        return { success: true, path: result.path };
      } else {
        console.warn("⚠️ Screenshot was not saved.");
      }
    } catch (err) {
      console.error("❌ Error during screenshot process:", err);
    }
  };

  return (
    <div className="content">
      {/* Quit + Refresh */}
      <button id="backBtn" onClick={handleQuit}
      disabled={isCapturing || isPaused}
      >
        {"< Quit"}
      </button>
      {/* <button id="refreshBtn" onClick={() => window.location.reload()}>
        🔄 Refresh
      </button> */}

      {/* Finish Confirmation Dialog */}
      <ConfirmDialog
        open={showFinishConfirm}
        title="Task Finished"
        subtitle="Your task has been completed and saved."
        onCancel={cancelFinish}
        onConfirm={confirmFinish}
      />

      {/* Confirm dialog for quitting */}
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

      <div className="select-container">
        <label>Choose Your Task:</label>
        <select
          value={selectedTaskId}
          onChange={handleChange}
          className="scrollable-select"
          disabled={isCapturing || isPaused} // Disable selection while capturing or paused
        >
          <option value="" disabled>
            Select Task
          </option>
          {taskData.map((task, index) => {
            const tid = getTaskId(task);
            return (
              <option key={tid ?? index} value={tid}>
                {task.task_name}
              </option>
            );
          })}
        </select>

        {isCapturing && (
          <p style={{ color: "red", marginTop: "10px" }}>
            You must finish the current task before selecting a new one.
          </p>
        )}
      </div>

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
          onClick={isPaused ? handleResume : handlePause} // Toggle the action based on pause state
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
    </div>
  );
};

export default ScreenshotApp;
