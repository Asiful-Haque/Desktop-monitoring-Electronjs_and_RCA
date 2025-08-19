import React, { useEffect, useRef, useState } from "react";
import "../styles/screenshotapp.css";

const ScreenshotApp = () => {
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const samplingRef = useRef(null);
  const captureIntervalRef = useRef(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [taskData, setTaskData] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTaskName, setSelectedTaskName] = useState("");

  // Use ref for immediate mutable idle tracking
  const idleSecondsThisCycleRef = useRef(0);
  const secondsSampledRef = useRef(0);
  const streamRef = useRef(null);

  const getTaskId = (t) => t?.id ?? t?.task_id ?? t?._id;

  const handleChange = (e) => {
    const newId = e.target.value;
    setSelectedTaskId(newId); // ✅ store id all the time

    // also keep the name for display/logging
    const task = taskData.find((t) => String(getTaskId(t)) === String(newId));
    setSelectedTaskName(task?.task_name ?? "");
    console.log("Selected task:", { id: newId, name: task?.task_name });
  };

  const user_id = localStorage.getItem("user_id");

  const fetchData = async () => {
    try {
      // console.log(`going to ${process.env.REACT_APP_API_BASE}/api/tasks/${user_id}`);
      const response = await fetch(`${process.env.REACT_APP_API_BASE}/api/tasks/${user_id}`);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      setTaskData(Array.isArray(data?.tasks) ? data.tasks : []);
    } catch (error) {
      console.error("Fetch error:", error);
    }
  };

  // Simple toast helper
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

  // Setup video stream on mount
  useEffect(() => {
    fetchData();

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

    const interval = setInterval(fetchData, 30000);

    // Cleanup on unmount
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

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
    setElapsedSeconds(0);
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
    }, 30000);
  };

  const stopScreenshotCycle = () => {
    clearInterval(captureIntervalRef.current);
  };

  const handleStart = () => {
    // ✅ Block if no task selected by id
    if (!selectedTaskId) {
      showToast("⚠ Please select a task before starting!");
      return;
    }
    setIsCapturing(true);
    startTimer();
    startSampling();
    startScreenshotCycle();
  };

  const handleStop = () => {
    setIsCapturing(false);
    stopTimer();
    stopSampling();
    stopScreenshotCycle();
  };

  const evaluateAndCapture = async () => {
    const timestamp = new Date().toLocaleTimeString();
    const idle = idleSecondsThisCycleRef.current;
    const active = 30 - idle;
    console.log(`[${timestamp}] 🕒 Idle: ${idle}s, Active: ${active}s`);

    if (idle > 20) {
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
          console.log("📤 Data to send:", dataToSend);

          const response = await fetch(`${process.env.REACT_APP_API_BASE}/api/screenshot-data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataToSend),
          });

          if (!response.ok) {
            console.warn("⚠️ Failed to post screenshot data");
          } else {
            console.log("✅ Screenshot data posted successfully");
          }
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

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const result = await window.electronAPI.saveImage(uint8Array);
      if (result.success) {
        console.log(`✅ Screenshot saved under Task: ${selectedTaskName} [${selectedTaskId}], at: ${result.path}`);
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
      <button id="backBtn" onClick={() => window.history.back()}>
        {"< Back"}
      </button>
      <button id="refreshBtn" onClick={() => window.location.reload()}>
        🔄 Refresh
      </button>

      <div className="select-container">
        <label>Choose Your Task:</label>
        <select
          value={selectedTaskId}          // ✅ value is the id
          onChange={handleChange}
          className="scrollable-select"
        >
          <option value="" disabled>
            Select Task
          </option>
          {taskData.map((task, index) => {
            const tid = getTaskId(task); // ✅ normalize id
            return (
              <option key={tid ?? index} value={tid}>
                {task.task_name}
              </option>
            );
          })}
        </select>
      </div>

      <video id="video" ref={videoRef}></video>

      <div className="btn-row">
        <button
          id="screenshotBtn"
          className="button is-success"
          onClick={handleStart}
          disabled={isCapturing}
        >
          {isCapturing ? "Capturing..." : "Take Screenshot"}
        </button>
        <button
          id="stopBtn"
          className="button is-danger"
          onClick={handleStop}
          disabled={!isCapturing}
        >
          Stop
        </button>
      </div>

      <div className="timer">
        <strong>Capture Duration:</strong>{" "}
        <span id="timer">{elapsedSeconds}</span> seconds
      </div>
    </div>
  );
};

export default ScreenshotApp;
