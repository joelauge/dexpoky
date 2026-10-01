import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAddCardMedia, useDeleteCardMedia, requestUploadUrl,
  getGetCardQueryKey, getListCardsQueryKey,
  type Card, type CardMedia,
} from "@workspace/api-client-react";
import { Camera, ImagePlus, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CardPhotoCamera } from "@/components/card-photo-camera";

const MAX_ITEMS = 20;
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VID_TYPES = ["video/mp4", "video/webm"];
const MB = 1024 * 1024;

function aspectOk(w: number, h: number) {
  const r = w / h;
  return [9 / 16, 16 / 9].some((t) => Math.abs(r - t) / t <= 0.05);
}

function readImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this image.")); };
    img.src = url;
  });
}

function readVideo(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(v.error?.code === 4
        ? "This browser cannot decode this video. Try WebM or an MP4 your browser supports."
        : "Could not read this video. Choose a playable MP4 or WebM file."));
    };
    v.src = url;
  });
}

function putFile(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed.")));
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

type Item = { key: string; url: string; kind: "image" | "video" | "catalog"; width?: number; height?: number; mediaId?: string; label: string };

export function CardMediaGallery({ card, catalogPreview }: { card: Card; catalogPreview: ReactNode }) {
  const qc = useQueryClient();
  const addMedia = useAddCardMedia();
  const delMedia = useDeleteCardMedia();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const media: CardMedia[] = card.media ?? [];
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [{ key: "catalog", url: card.imageUrl ?? "", kind: "catalog", label: "Catalog art" }];
    if (card.originalScanUrl && !media.some((m) => m.url === card.originalScanUrl)) {
      list.push({ key: "legacy", url: card.originalScanUrl, kind: "image", label: "Original scan" });
    }
    media.forEach((m, i) => list.push({
      key: m.id, url: m.url, kind: m.kind, width: m.width, height: m.height, mediaId: m.id,
      label: `${m.kind === "video" ? "Video" : "Photo"} ${i + 1}`,
    }));
    return list;
  }, [card.imageUrl, card.originalScanUrl, media]);

  const active = items.find((i) => i.key === selected) ?? items[0];
  const userItems = items.length - 1;
  const full = media.length >= MAX_ITEMS;

  const upload = async (file: File) => {
    setError(null);
    const isImg = IMG_TYPES.includes(file.type);
    const isVid = VID_TYPES.includes(file.type);
    try {
      if (!isImg && !isVid) throw new Error("Use JPG, PNG or WebP photos, or MP4 / WebM video.");
      if (isImg && file.size > 10 * MB) throw new Error("Photos must be 10 MiB or smaller.");
      if (isVid && file.size > 100 * MB) throw new Error("Videos must be 100 MiB or smaller.");
      if (full) throw new Error(`A card can hold ${MAX_ITEMS} photos and videos.`);
      setBusy(true); setProgress(0);
      let width: number, height: number, duration: number | null = null;
      if (isImg) ({ width, height } = await readImage(file));
      else {
        const m = await readVideo(file);
        ({ width, height } = m);
        if (!isFinite(m.duration) || m.duration > 60) throw new Error("Videos must be 60 seconds or shorter.");
        duration = Math.round(m.duration * 10) / 10;
        if (!aspectOk(width, height)) throw new Error("Videos must be 9:16 portrait or 16:9 landscape.");
      }
      const up = await requestUploadUrl({ name: file.name, size: file.size, contentType: file.type });
      if (!up.uploadClaim) throw new Error("Upload could not be authorised.");
      await putFile(up.uploadURL, file, setProgress);
      const created = await addMedia.mutateAsync({
        id: card.id,
        data: {
          url: `/api/storage${up.objectPath}`, kind: isImg ? "image" : "video",
          width, height, durationSeconds: duration, uploadClaim: up.uploadClaim,
        },
      });
      const patch = (old: Card | undefined) =>
        old ? { ...old, media: [...(old.media ?? []).filter((m) => m.id !== created.id), created] } : old;
      qc.setQueryData<Card>(getGetCardQueryKey(card.id), patch);
      qc.setQueryData<Card>(["/api/cards", card.id], patch);
      setSelected(created.id);
      void qc.invalidateQueries({ queryKey: getGetCardQueryKey(card.id) });
      void qc.invalidateQueries({ queryKey: ["/api/cards", card.id] });
      void qc.invalidateQueries({ queryKey: getListCardsQueryKey() });
      toast.success(isImg ? "Photo added" : "Video added");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const remove = async (mediaId: string) => {
    setRemoving(mediaId);
    try {
      await delMedia.mutateAsync({ id: card.id, mediaId });
      const patch = (old: Card | undefined) =>
        old ? { ...old, media: (old.media ?? []).filter((m) => m.id !== mediaId) } : old;
      qc.setQueryData<Card>(getGetCardQueryKey(card.id), patch);
      qc.setQueryData<Card>(["/api/cards", card.id], patch);
      setSelected(null);
      void qc.invalidateQueries({ queryKey: getGetCardQueryKey(card.id) });
      void qc.invalidateQueries({ queryKey: ["/api/cards", card.id] });
      void qc.invalidateQueries({ queryKey: getListCardsQueryKey() });
      toast.success("Removed");
    } catch {
      toast.error("Couldn't remove this item. Please try again.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section aria-label="Card preview and your photos and videos">
      {camera && (
        <div className="mb-3">
          <CardPhotoCamera
            onCancel={() => setCamera(false)}
            onCapture={(f) => { setCamera(false); void upload(f); }}
          />
        </div>
      )}

      {busy && progress !== null && (
        <div role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}
          className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full origin-left bg-primary transition-transform" style={{ transform: `scaleX(${Math.max(progress, 0.03)})` }} />
        </div>
      )}
      {error && <p role="alert" className="mb-3 text-xs text-destructive">{error}</p>}

      {active.kind === "catalog" ? (
        <div>{catalogPreview}</div>
      ) : active.kind === "video" ? (
        <div className="flex max-h-[520px] min-h-40 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
          <video key={active.key} src={active.url} controls playsInline preload="metadata"
            aria-label={active.label} className="max-h-[520px] w-full object-contain"
            style={active.width && active.height ? { aspectRatio: `${active.width} / ${active.height}` } : undefined} />
        </div>
      ) : (
        <div className="flex max-h-[520px] min-h-40 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
          <img key={active.key} src={active.url} alt={`${active.label} of ${card.name}`}
            className="max-h-[520px] w-full object-contain" />
        </div>
      )}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose card preview">
        {items.map((it) => (
          <button key={it.key} type="button"
            aria-label={`Show ${it.label}`} aria-pressed={it.key === active.key}
            onClick={() => setSelected(it.key)}
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${it.key === active.key ? "ring-2 ring-primary" : ""}`}>
            {it.kind === "video" ? (
              <>
                <video src={it.url} muted preload="metadata" className="h-full w-full object-cover" aria-hidden="true" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="h-4 w-4 text-white" />
                </span>
              </>
            ) : it.url ? (
              <img src={it.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : null}
          </button>
        ))}
      </div>
      {active.mediaId && (
        <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">{active.label}</span>
          <Button type="button" size="sm" variant="ghost" className="text-destructive"
            disabled={removing === active.mediaId} onClick={() => remove(active.mediaId!)}>
            {removing === active.mediaId ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
            Remove
          </Button>
        </div>
      )}
      <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Photos & videos <span className="tabular-nums">({userItems})</span>
        </h2>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="outline" disabled={busy || full} onClick={() => setCamera(true)}>
            <Camera className="mr-1 h-4 w-4" /> Take photo
          </Button>
          <Button type="button" size="sm" disabled={busy || full} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}
            Add
          </Button>
        </div>
        <input
          ref={fileRef} type="file" className="sr-only" aria-label="Choose photos or videos"
          accept={[...IMG_TYPES, ...VID_TYPES].join(",")}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }}
        />
      </div>

    </section>
  );
}
