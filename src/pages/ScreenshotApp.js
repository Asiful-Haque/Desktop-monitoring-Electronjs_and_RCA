import React, { useEffect, useRef, useState } from 'react';
import '../styles/screenshotapp.css';

const ScreenshotApp = () => {
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const samplingRef = useRef(null);
  const captureIntervalRef = useRef(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [idleSecondsThisCycle, setIdleSecondsThisCycle] = useState(0);
  const [secondsSampled, setSecondsSampled] = useState(0);

  const fetchData = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/tasks');
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      console.log('Fetched data:', data);
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
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
      if (idle >= 1) setIdleSecondsThisCycle((prev) => prev + 1);
      setSecondsSampled((prev) => prev + 1);
    }, 1000);
  };

  const stopSampling = () => {
    clearInterval(samplingRef.current);
    setIdleSecondsThisCycle(0);
    setSecondsSampled(0);
  };

  const startScreenshotCycle = () => {
    captureIntervalRef.current = setInterval(() => {
      evaluateAndCapture();
    }, 30000);
  };

  const stopScreenshotCycle = () => {
    clearInterval(captureIntervalRef.current);
  };

  const evaluateAndCapture = async () => {
    const timestamp = new Date().toLocaleTimeString();
    const idle = idleSecondsThisCycle;
    const active = 30 - idle;
    console.log(`[${timestamp}] 🕒 Idle: ${idle}s, Active: ${active}s`);

    if (idle > 20) {
      console.log('🚫 Skipping screenshot due to user inactivity');
    } else {
      await takeScreenshot();
    }

    setIdleSecondsThisCycle(0);
    setSecondsSampled(0);
  };

  const takeScreenshot = async () => {
    try {
      const sources = await window.electronAPI.getSources();
      console.log('🖼️ Sources:', sources);
      if (!sources.length) return console.warn('⚠️ No sources found.');

      const selectedSource = sources[0];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
          },
        },
      });

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      console.log('🖼️ Canvas created:', canvas);
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const result = await window.electronAPI.saveImage(uint8Array);
      if (result.success) {
        console.log(`✅ Screenshot saved at: ${result.path}`);
      } else {
        console.warn('⚠️ Screenshot was not saved.');
      }
    } catch (err) {
      console.error('❌ Error during screenshot process:', err);
    }
  };

  const handleStart = () => {
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

  return (
    <div className="content">
      <button id="backBtn" onClick={() => window.history.back()}>{'< Back'}</button>
      <button id="refreshBtn" onClick={() => window.location.reload()}>🔄 Refresh</button>

      <h1>Auto Screenshot Capture</h1>
      <video id="video" ref={videoRef}></video>

      <div className="btn-row">
        <button id="screenshotBtn" className="button is-success" onClick={handleStart} disabled={isCapturing}>
          {isCapturing ? 'Capturing...' : 'Take Screenshot'}
        </button>
        <button id="stopBtn" className="button is-danger" onClick={handleStop} disabled={!isCapturing}>
          Stop
        </button>
      </div>

      <div className="timer">
        <strong>Capture Duration:</strong> <span id="timer">{elapsedSeconds}</span> seconds
      </div>
    </div>
  );
};

export default ScreenshotApp;
