import { useRef, useState } from "react";
import { Camera, X, Loader2, Video, Film } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_VIDEO_SIZE_MB = 15;

interface MediaUploaderProps {
  photos: string[];
  video: string | null;
  onPhotosChange: (paths: string[]) => void;
  onVideoChange: (path: string | null) => void;
  maxPhotos?: number;
  className?: string;
  label?: string;
}

async function uploadFile(file: File): Promise<string> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await res.json();
  const put = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error("Upload failed");
  return objectPath as string;
}

export function ImageUploader({
  photos,
  video,
  onPhotosChange,
  onVideoChange,
  maxPhotos = 10,
  className,
  label,
}: MediaUploaderProps) {
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFiles = async (files: FileList) => {
    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, remaining);
    if (!toUpload.length) return;
    setUploadingPhotos(true);
    const newPaths: string[] = [];
    try {
      for (const file of toUpload) {
        newPaths.push(await uploadFile(file));
      }
      onPhotosChange([...photos, ...newPaths]);
    } catch {
      // silent — user can retry
    } finally {
      setUploadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleVideoFile = async (files: FileList) => {
    const file = Array.from(files).find((f) => f.type.startsWith("video/"));
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      alert(`Video must be ${MAX_VIDEO_SIZE_MB} MB or smaller.`);
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }
    setUploadingVideo(true);
    try {
      const path = await uploadFile(file);
      onVideoChange(path);
    } catch {
      // silent
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const removePhoto = (i: number) => onPhotosChange(photos.filter((_, j) => j !== i));

  return (
    <div className={cn("space-y-3", className)}>
      {label && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      )}

      {/* Photo grid */}
      <div>
        <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
          Photos — {photos.length}/{maxPhotos}
        </p>
        <div className="flex flex-wrap gap-2">
          {photos.map((path, i) => (
            <div
              key={i}
              className="relative w-20 h-24 rounded-xl overflow-hidden border bg-muted/30 shrink-0"
            >
              <img
                src={`/api/storage${path}`}
                alt=""
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}

          {photos.length < maxPhotos && (
            <label
              className={cn(
                "w-20 h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer shrink-0 transition-colors",
                uploadingPhotos
                  ? "border-muted-foreground/20 cursor-not-allowed"
                  : "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              {uploadingPhotos ? (
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              ) : (
                <>
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-medium">Add photo</span>
                </>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={uploadingPhotos}
                onChange={(e) => e.target.files && handlePhotoFiles(e.target.files)}
              />
            </label>
          )}
        </div>
      </div>

      {/* Video slot */}
      <div>
        <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
          Video — up to {MAX_VIDEO_SIZE_MB} MB (optional)
        </p>
        {video ? (
          <div className="relative rounded-xl overflow-hidden border bg-black w-full max-w-xs">
            <video
              src={`/api/storage${video}`}
              controls
              className="w-full max-h-40 object-contain"
            />
            <button
              type="button"
              onClick={() => onVideoChange(null)}
              className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center hover:bg-black/90 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        ) : (
          <label
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors w-full max-w-xs",
              uploadingVideo
                ? "border-muted-foreground/20 cursor-not-allowed"
                : "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5",
            )}
          >
            {uploadingVideo ? (
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin shrink-0" />
            ) : (
              <Film className="w-5 h-5 text-muted-foreground shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {uploadingVideo ? "Uploading…" : "Add a video"}
              </p>
              <p className="text-[10px] text-muted-foreground/70">MP4, MOV, WebM · max 15 MB</p>
            </div>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              hidden
              disabled={uploadingVideo}
              onChange={(e) => e.target.files && handleVideoFile(e.target.files)}
            />
          </label>
        )}
      </div>
    </div>
  );
}
