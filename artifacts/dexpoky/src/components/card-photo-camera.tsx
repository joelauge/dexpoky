import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cardPhotoCrop } from "@/lib/card-photo-crop";

interface CardPhotoCameraProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

/** Mounted inside the portal so camera/frame refs exist before effects start. */
function CardPhotoCameraView({ onCapture, onCancel }: CardPhotoCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const mounted = useRef(false);
  const capturing = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const resize = () => setFrameWidth(Math.min(preview.clientWidth * 0.82, preview.clientHeight * 0.85 * 5 / 7));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

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
    const frame = frameRef.current;
    if (capturing.current || !video?.videoWidth || !video.videoHeight || !frame) return;
    capturing.current = true;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      const previewBounds = video.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      const crop = cardPhotoCrop(
        { width: video.videoWidth, height: video.videoHeight },
        previewBounds,
        { x: frameBounds.left - previewBounds.left, y: frameBounds.top - previewBounds.top,
          width: frameBounds.width, height: frameBounds.height },
      );
      const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height));
      canvas.width = Math.max(1, Math.round(crop.width * scale));
      canvas.height = Math.max(1, Math.round(crop.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not capture the photo.");
      context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!mounted.current) return;
        if (!blob) {
          capturing.current = false;
          setBusy(false);
          setError("Could not capture the photo. Please try again.");
          return;
        }
        onCapture(new File([blob], `card-photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      }, "image/jpeg", 0.88);
    } catch {
      capturing.current = false;
      setBusy(false);
      setError("Could not capture the photo. Please try again.");
    }
  };

  return (
    <>
          <div className="shrink-0 px-4 py-3">
            <DialogPrimitive.Title className="text-lg font-semibold">Take card photo</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-slate-300">
              Fit your card inside the frame. Only the area inside it will be saved.
            </DialogPrimitive.Description>
          </div>
      <div ref={previewRef} className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Live card photo preview"
          className="absolute inset-0 h-full w-full object-cover"
          onLoadedData={() => setReady(true)}
        />
        {frameWidth > 0 && <div ref={frameRef} aria-label="Card capture frame"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl outline outline-2 outline-white"
          style={{ width: frameWidth, aspectRatio: "5 / 7", boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }}>
          <span className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-xl border-l-4 border-t-4 border-primary" />
          <span className="absolute -right-0.5 -top-0.5 h-7 w-7 rounded-tr-xl border-r-4 border-t-4 border-primary" />
          <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-xl border-b-4 border-l-4 border-primary" />
          <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-xl border-b-4 border-r-4 border-primary" />
        </div>}
        {!ready && !error && <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white" aria-label="Starting camera" />
        </div>}
      </div>
      <div className="shrink-0 space-y-3 px-4 py-4">
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap justify-center gap-3">
      <Button type="button" size="lg" onClick={capture} disabled={!ready || busy || frameWidth <= 0}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
        Capture photo
      </Button>
      <Button type="button" size="lg" variant="outline" className="border-white/30 bg-slate-900 text-white hover:bg-slate-800 hover:text-white" onClick={onCancel}>
        Cancel camera
      </Button>
      </div>
      </div>
    </>
  );
}

/** Row-local capture: never transfers a photo or stream to another card. */
export function CardPhotoCamera(props: CardPhotoCameraProps) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) props.onCancel(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[300] bg-black/80" />
        <DialogPrimitive.Content
          className="fixed inset-2 z-[301] flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950 text-white shadow-2xl outline-none"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <CardPhotoCameraView {...props} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}