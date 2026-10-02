import { useState, type ReactNode } from "react";
import type { BinderPage, BinderStyle } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DEFAULTS, GRID_PRESETS, clamp, resizePreview } from "@/lib/binders/model";

export function ConfirmDialog({
  open, onOpenChange, title, children, confirmLabel, cancelLabel = "Cancel", destructive, onConfirm, onSecondary, secondaryLabel, testId,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string;
  destructive?: boolean; onConfirm: () => void; onSecondary?: () => void; secondaryLabel?: string; testId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`dialog-${testId}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild><div className="space-y-2 text-sm text-muted-foreground">{children}</div></DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid={`button-${testId}-cancel`}>{cancelLabel}</Button>
          {onSecondary && <Button variant="secondary" onClick={onSecondary} data-testid={`button-${testId}-secondary`}>{secondaryLabel}</Button>}
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} data-testid={`button-${testId}-confirm`}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ label, value, onChange, min, max, id, suffix }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; id: string; suffix?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}{suffix ? ` (${suffix})` : ""}</Label>
      <Input id={id} data-testid={id} type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={() => onChange(clamp(value, min, max))} />
    </div>
  );
}

export function GridFields({ prefix, v, set }: {
  prefix: string;
  v: { rows: number; columns: number; widthMm: number; heightMm: number };
  set: (p: Partial<{ rows: number; columns: number; widthMm: number; heightMm: number }>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Pocket grid preset</Label>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {GRID_PRESETS.map((p) => (
            <button type="button" key={p.count} data-testid={`${prefix}-preset-${p.count}`}
              onClick={() => set({ rows: p.rows, columns: p.columns })}
              className={cn("rounded-md border py-2 text-sm font-semibold transition-colors",
                v.rows === p.rows && v.columns === p.columns ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {p.count}
              <span className="block text-[10px] font-normal opacity-70">{p.rows} x {p.columns}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumField id={`${prefix}-rows`} label="Rows" min={1} max={5} value={v.rows} onChange={(n) => set({ rows: n })} />
        <NumField id={`${prefix}-columns`} label="Columns" min={1} max={5} value={v.columns} onChange={(n) => set({ columns: n })} />
        <NumField id={`${prefix}-width`} label="Width" suffix="mm" min={150} max={400} value={v.widthMm} onChange={(n) => set({ widthMm: n })} />
        <NumField id={`${prefix}-height`} label="Height" suffix="mm" min={180} max={500} value={v.heightMm} onChange={(n) => set({ heightMm: n })} />
      </div>
    </div>
  );
}

// Legacy field kept for API compatibility; never user-selectable.
const CANONICAL_STYLE: BinderStyle = "ring";

export type CreateValues = { name: string; style: BinderStyle; coverColor: string; rows: number; columns: number; widthMm: number; heightMm: number; pageCount: number };

export function CreateBinderDialog({ open, onOpenChange, pending, onCreate }: {
  open: boolean; onOpenChange: (o: boolean) => void; pending: boolean; onCreate: (v: CreateValues) => void;
}) {
  const [v, setV] = useState<CreateValues>({ name: "", style: CANONICAL_STYLE, coverColor: "#1d4ed8", ...DEFAULTS });
  const patch = (p: Partial<CreateValues>) => setV((o) => ({ ...o, ...p }));
  const valid = v.name.trim().length > 0 && v.name.length <= 80;
  const submit = () => onCreate({
    ...v, name: v.name.trim(),
    rows: clamp(v.rows, 1, 5), columns: clamp(v.columns, 1, 5),
    widthMm: clamp(v.widthMm, 150, 400), heightMm: clamp(v.heightMm, 180, 500), pageCount: clamp(v.pageCount, 1, 20),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="dialog-create-binder">
        <DialogHeader>
          <DialogTitle>New binder</DialogTitle>
          <DialogDescription>A virtual arrangement of cards you own. Your collection is never changed.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
          <div className="space-y-1">
            <Label htmlFor="input-create-name">Name</Label>
            <Input id="input-create-name" data-testid="input-create-name" maxLength={80} value={v.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Base Set holos" autoFocus />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="input-create-color" className="text-xs">Cover color</Label>
            <input id="input-create-color" data-testid="input-create-color" type="color" value={v.coverColor} onChange={(e) => patch({ coverColor: e.target.value })} className="h-9 w-14 cursor-pointer rounded border bg-transparent" />
            <span className="font-mono text-xs text-muted-foreground">{v.coverColor}</span>
          </div>
          <GridFields prefix="input-create" v={v} set={patch} />
          <NumField id="input-create-pages" label="Starting pages" min={1} max={20} value={v.pageCount} onChange={(n) => patch({ pageCount: n })} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || pending} data-testid="button-create-submit">{pending ? "Creating" : "Create binder"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PageSettingsDialog({ open, onOpenChange, page, index, onApply }: {
  open: boolean; onOpenChange: (o: boolean) => void; page: BinderPage; index: number;
  onApply: (d: { rows: number; columns: number; widthMm: number; heightMm: number }) => void;
}) {
  const [v, setV] = useState({ rows: page.rows, columns: page.columns, widthMm: page.widthMm, heightMm: page.heightMm });
  const [confirmed, setConfirmed] = useState(false);
  const rows = clamp(v.rows, 1, 5), columns = clamp(v.columns, 1, 5);
  const removed = resizePreview(page, rows, columns).length;
  const apply = () => onApply({ rows, columns, widthMm: clamp(v.widthMm, 150, 400), heightMm: clamp(v.heightMm, 180, 500) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-page-settings">
        <DialogHeader>
          <DialogTitle>Page {index + 1} holder</DialogTitle>
          <DialogDescription>Pocket grid and physical size for this page.</DialogDescription>
        </DialogHeader>
        <GridFields prefix="input-page" v={v} set={(p) => { setV((o) => ({ ...o, ...p })); setConfirmed(false); }} />
        {removed > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm" data-testid="warning-page-shrink">
            This grid has fewer pockets. {removed} placed card{removed === 1 ? "" : "s"} will come out of their pockets and return to the tray. Nothing is deleted from your collection.
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input type="checkbox" data-testid="checkbox-confirm-shrink" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              Return {removed} card{removed === 1 ? "" : "s"} to the tray
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={removed > 0 && !confirmed} onClick={apply} data-testid="button-page-apply">Apply to page</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
