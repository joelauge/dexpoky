import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CardPhotoCameraProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

/** Row-local capture: never transfers a photo or stream to another card. */
export function CardPhotoCamera({ onCapture, onCancel }: CardPhotoCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const capturing = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access is unavailable in this browser. You can still upload a photo.");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch (err) {
        stream?.getTracks().forEach((track) => track.stop());
        if (disposed) return;
        setReady(false);
        setError(err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access or use Upload photo."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "No camera was found. Use Upload photo instead."
            : "Could not start the camera. Close it and try again, or use Upload photo.");
      }
    };
    void start();
    return () => {
      disposed = true;
      mounted.current = false;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (capturing.current || !video?.videoWidth || !video.videoHeight) return;
    capturing.current = true;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not capture the photo.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!mounted.current) return;
        if (!blob) {
          capturing.current = false;
          setBusy(false);
          setError("Could not capture the photo. Please try again.");
          return;
        }
        onCapture(new File([blob], `card-photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      }, "image/jpeg", 0.9);
    } catch {
      capturing.current = false;
      setBusy(false);
      setError("Could not capture the photo. Please try again.");
    }
  };

  return (
    <div className="w-full max-w-40 space-y-2">
      <div className="relative aspect-[2.5/3.5] overflow-hidden rounded-xl border bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Live card photo preview"
          className="h-full w-full object-contain"
          onLoadedData={() => setReady(true)}
        />
        {!ready && !error && <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white" aria-label="Starting camera" />
        </div>}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" className="w-full" onClick={capture} disabled={!ready || busy}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
        Capture photo
      </Button>
      <Button type="button" size="sm" variant="outline" className="w-full" onClick={onCancel}>
        Cancel camera
      </Button>
    </div>
  );
}