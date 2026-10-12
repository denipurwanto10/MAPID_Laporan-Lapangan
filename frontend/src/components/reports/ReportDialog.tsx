import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { DESKRIPSI_MAX, NAMA_MAX } from "../../types/report";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (nama: string, deskripsi: string) => Promise<void>;
  onSuccess?: () => void;
  /** Bila diisi, dialog menjadi mode ubah dengan nilai awal ini. */
  initial?: { nama: string; deskripsi: string } | null;
  title?: string;
  submitLabel?: string;
  submittingLabel?: string;
}

export function ReportDialog({
  open,
  onOpenChange,
  onSubmit,
  onSuccess,
  initial = null,
  title = "Buat laporan",
  submitLabel = "Simpan laporan",
  submittingLabel = "Menyimpan...",
}: ReportDialogProps) {
  const [nama, setNama] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [errors, setErrors] = useState<{ nama?: string; deskripsi?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const namaLen = nama.trim().length;
  const deskripsiLen = deskripsi.trim().length;
  const unchanged =
    initial !== null &&
    nama.trim() === initial.nama &&
    deskripsi.trim() === initial.deskripsi;
  const invalid = submitting || namaLen === 0 || deskripsiLen === 0 || unchanged;

  // Isi form dengan nilai awal setiap dialog mode ubah dibuka.
  useEffect(() => {
    if (open && initial) {
      setNama(initial.nama);
      setDeskripsi(initial.deskripsi);
      setErrors({});
      setSubmitError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function validate(): boolean {
    const next: { nama?: string; deskripsi?: string } = {};
    if (nama.trim().length === 0) next.nama = "Nama laporan wajib diisi.";
    else if (nama.trim().length > NAMA_MAX) next.nama = `Nama maksimal ${NAMA_MAX} karakter.`;
    if (deskripsi.trim().length === 0) next.deskripsi = "Deskripsi laporan wajib diisi.";
    else if (deskripsi.trim().length > DESKRIPSI_MAX)
      next.deskripsi = `Deskripsi maksimal ${DESKRIPSI_MAX} karakter.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function reset(): void {
    setNama("");
    setDeskripsi("");
    setErrors({});
    setSubmitError(null);
  }

  /** Dialog tidak boleh ditutup saat sedang menyimpan; form direset setiap kali ditutup. */
  function handleOpenChange(next: boolean): void {
    if (submitting && !next) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(nama.trim(), deskripsi.trim());
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Laporan belum tersimpan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {initial ? "Ubah nama atau deskripsinya." : "Isi nama dan deskripsi singkat kejadiannya."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="report-nama">Nama laporan <span aria-hidden="true" className="text-destructive">*</span></Label>
              <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                {nama.trim().length}/{NAMA_MAX}
              </span>
            </div>
            <Input
              id="report-nama"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Jalan berlubang di Jl. Merdeka, Bandung"
              maxLength={NAMA_MAX + 20}
              autoComplete="off"
              aria-invalid={Boolean(errors.nama)}
              aria-describedby={errors.nama ? "report-nama-error" : undefined}
            />
            {errors.nama && (
              <p id="report-nama-error" role="alert" className="text-xs text-destructive">
                {errors.nama}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="report-deskripsi">Deskripsi <span aria-hidden="true" className="text-destructive">*</span></Label>
              <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                {deskripsi.trim().length}/{DESKRIPSI_MAX}
              </span>
            </div>
            <Textarea
              id="report-deskripsi"
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="Jelaskan kondisi di lapangan"
              rows={4}
              className="max-h-[40dvh] resize-none"
              maxLength={DESKRIPSI_MAX + 100}
              aria-invalid={Boolean(errors.deskripsi)}
              aria-describedby={errors.deskripsi ? "report-deskripsi-error" : undefined}
            />
            {errors.deskripsi && (
              <p id="report-deskripsi-error" role="alert" className="text-xs text-destructive">
                {errors.deskripsi}
              </p>
            )}
          </div>

          {submitError && (
            <p role="alert" className="rounded-xl border border-rejected-border bg-rejected px-3 py-2 text-xs text-rejected-foreground">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={invalid}>
              {submitting && <Loader2 aria-hidden="true" className="animate-spin" />}
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
