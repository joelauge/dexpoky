import { useRef, useState } from "react";
import { ImagePlus, X, Loader2, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface ListingImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  className?: string;
}

async function uploadImage(file: File): Promise<string> {
  const metaRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!metaRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await metaRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadURL);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });

  return `/api/storage${objectPath}`;
}

export function ListingImageUpload({ value, onChange, className }: ListingImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const canAdd = value.length < MAX_IMAGES;

  const handleFiles = async (files: File[]) => {
    const valid = files.filter((f) => {
      if (!f.type.startsWith("image/")) return false;
      if (f.size > MAX_FILE_SIZE) return false;
      return true;
    });

    const toAdd = valid.slice(0, MAX_IMAGES - value.length);
    if (toAdd.length === 0) return;

    setError(null);
    setUploading(true);
    setUploadingCount(toAdd.length);

    try {
      const urls = await Promise.all(toAdd.map(uploadImage));
      onChange([...value, ...urls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadingCount(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    handleFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const removeImage = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
    if (lightboxIndex !== null) {
      if (lightboxIndex >= value.length - 1) setLightboxIndex(Math.max(0, value.length - 2));
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading || !canAdd}
      />

      {/* Grid of uploaded images + add slot */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {value.map((url, idx) => (
          <div
            key={url}
            className="relative group aspect-square rounded-xl overflow-hidden border bg-muted/20 cursor-pointer"
            onClick={() => setLightboxIndex(idx)}
          >
            <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
              <ZoomIn className="h-4 w-4 text-white" />
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
              className="absolute top-1 right-1 bg-black/70 hover:bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
            {idx === 0 && (
              <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/70 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                Main
              </span>
            )}
          </div>
        ))}

        {/* Upload slot */}
        {canAdd && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors",
              uploading
                ? "border-primary/40 bg-primary/5 cursor-not-allowed"
                : "border-border hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-[10px] text-muted-foreground font-medium">
                  {uploadingCount > 1 ? `+${uploadingCount}` : "…"}
                </span>
              </>
            ) : (
              <>
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium text-center leading-tight px-1">
                  Add photo
                </span>
              </>
            )}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {value.length}/{MAX_IMAGES} photos · JPG, PNG, WebP · max 10 MB each. Drag &amp; drop supported.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Lightbox */}
      {lightboxIndex !== null && value.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          {value.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + value.length) % value.length); }}
                aria-label="Previous"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % value.length); }}
                aria-label="Next"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}

          <img
            src={value[lightboxIndex]}
            alt={`Photo ${lightboxIndex + 1}`}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {value.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {value.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    i === lightboxIndex ? "bg-white scale-125" : "bg-white/40 hover:bg-white/70"
                  )}
                  aria-label={`Go to photo ${i + 1}`}
                />
              ))}
            </div>
          )}

          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium">
            {lightboxIndex + 1} / {value.length}
          </div>
        </div>
      )}
    </div>
  );
}
