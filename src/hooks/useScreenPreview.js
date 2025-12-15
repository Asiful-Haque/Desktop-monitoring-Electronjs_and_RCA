import { useEffect, useRef } from "react";

export default function useScreenPreview({ previewRef, videoRef, streamsRef }) {
  const setupOnceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const cleanupPreview = () => {
      try {
        (streamsRef.current || []).forEach((s) => {
          try {
            s.getTracks().forEach((t) => t.stop());
          } catch {}
        });
      } catch {}
      streamsRef.current = [];

      const el = previewRef.current;
      if (el) el.innerHTML = "";

      videoRef.current = [];
    };

    const setupVideoStream = async () => {
      try {
        const container = previewRef.current;
        if (!container) return;

        // strict-mode safe
        if (setupOnceRef.current) return;
        setupOnceRef.current = true;

        cleanupPreview();

        const sources = await window.electronAPI.getSources();
        if (!sources || sources.length < 2) return;

        const getStream = async (sourceId) => {
          return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: sourceId,
              },
            },
          });
        };

        const stream1 = await getStream(sources[0].id);
        const stream2 = await getStream(sources[1].id);

        if (cancelled) {
          stream1.getTracks().forEach((t) => t.stop());
          stream2.getTracks().forEach((t) => t.stop());
          return;
        }

        streamsRef.current = [stream1, stream2];

        const mkVideo = (stream) => {
          const v = document.createElement("video");
          v.srcObject = stream;
          v.muted = true;
          v.playsInline = true;
          v.autoplay = true;
          v.style.width = "48%";
          v.style.height = "auto";
          v.style.objectFit = "contain";
          return v;
        };

        const video1 = mkVideo(stream1);
        const video2 = mkVideo(stream2);

        container.appendChild(video1);
        container.appendChild(video2);

        videoRef.current = [video1, video2];

        await Promise.allSettled([video1.play(), video2.play()]);
      } catch (err) {
        console.error("❌ Error setting up video stream:", err);
        setupOnceRef.current = false;
        cleanupPreview();
      }
    };

    setupVideoStream();

    return () => {
      cancelled = true;
      cleanupPreview();
      setupOnceRef.current = false;
    };
  }, [previewRef, videoRef, streamsRef]);
}
