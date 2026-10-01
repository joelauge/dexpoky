import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardPhotoCamera } from "@/components/card-photo-camera";
import { cn } from "@/lib/utils";

interface CardImageUploadProps {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  onFileSelected?: (file: File, imageData: string) => void | Promise<void>;
  allowCamera?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  className?: string;
}

export function CardImageUpload({ value, onChange, onFileSelected, allowCamera = false, onUploadingChange, className }: CardImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const uploadFile = async (file: File) => {
    if (inFlight.current) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10 MB.");
      return;
    }

    setError(null);
    inFlight.current = true;
    setUploading(true);
    onUploadingChange?.(true);
    setProgress(0);

    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image"));
        reader.onerror = () => reject(new Error("Could not read image"));
        reader.readAsDataURL(file);
      });
      if (!mounted.current) return;
      void onFileSelected?.(file, imageData);

      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!metaRes.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await metaRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (ev) => {
          if (mounted.current && ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      if (mounted.current) onChange(`/api/storage${objectPath}`);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setUploading(false);
        onUploadingChange?.(false);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  };

  const handleRemove = () => {
    onChange(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {cameraOpen ? (
        <CardPhotoCamera
          onCancel={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            void uploadFile(file);
          }}
        />
      ) : value ? (
        <div className="relative group w-full max-w-xs">
          <div className="rounded-xl overflow-hidden border bg-muted aspect-[2.5/3.5] w-40">
            <img
              src={value}
              alt="Card image"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs"
            >
              <Upload className="h-3 w-3 mr-1" /> Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleRemove}
              disabled={uploading}
              className="text-xs"
            >
              <X className="h-3 w-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "w-40 aspect-[2.5/3.5] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors",
            uploading
              ? "border-primary/40 bg-primary/5 cursor-not-allowed"
              : "border-border hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground font-medium">{progress}%</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium text-center px-2">
                Upload photo
              </span>
            </>
          )}
        </button>
      )}

      {allowCamera && !cameraOpen && (
        <Button type="button" size="sm" variant="outline" className="w-40" disabled={uploading} onClick={() => {
          setError(null);
          setCameraOpen(true);
        }}>
          <Camera className="mr-1.5 h-4 w-4" />
          {value ? "Retake photo" : "Take photo"}
        </Button>
      )}

      {uploading && value === null && (
        <div className="w-40">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <p className="text-xs text-muted-foreground">
        JPG, PNG, WebP · max 10 MB
      </p>
    </div>
  );
}
