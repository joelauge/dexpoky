import { useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  images: string[];
  onChange: (paths: string[]) => void;
  max?: number;
  className?: string;
  label?: string;
}

export function ImageUploader({ images, onChange, max = 5, className, label }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    const remaining = max - images.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    const newPaths: string[] = [];
    try {
      for (const file of toUpload) {
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
        newPaths.push(objectPath as string);
      }
      onChange([...images, ...newPaths]);
    } catch {
      // silent — user can retry
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (i: number) => onChange(images.filter((_, j) => j !== i));

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {images.map((path, i) => (
          <div key={i} className="relative w-20 h-24 rounded-xl overflow-hidden border bg-muted/30 shrink-0">
            <img
              src={`/api/storage${path}`}
              alt=""
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}

        {images.length < max && (
          <label
            className={cn(
              "w-20 h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer shrink-0 transition-colors",
              uploading
                ? "border-muted-foreground/20 cursor-not-allowed"
                : "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5",
            )}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            ) : (
              <>
                <Camera className="w-5 h-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium">Add photo</span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {images.length}/{max} photos · tap a thumbnail to remove
      </p>
    </div>
  );
}
