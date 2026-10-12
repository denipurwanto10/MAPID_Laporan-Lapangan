import { useDeferredValue, useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { AppShell } from './components/layout/AppShell'
import { PageHeader } from './components/layout/PageHeader'
import { BulkBar } from './components/reports/BulkBar'
import { ConfirmDialog } from './components/reports/ConfirmDialog'
import { STATUS_LABEL } from './types/report'
import { Pagination } from './components/reports/Pagination'
import { PageSizeSelect } from './components/reports/PageSizeSelect'
import { ReportCards } from './components/reports/ReportCards'
import { ReportDetail } from './components/reports/ReportDetail'
import { ReportDialog } from './components/reports/ReportDialog'
import { ReportTable } from './components/reports/ReportTable'
import { EmptySearchState, EmptyState, ErrorState, StatsSkeleton, TableSkeleton } from './components/reports/States'
import { StatsStrip } from './components/reports/StatsStrip'
import { Toolbar } from './components/reports/Toolbar'
import { Login } from './components/auth/Login'
import { UserManager } from './components/users/UserManager'
import { Profile } from './components/profile/Profile'
import { useAuth } from './context/AuthContext'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useReports } from './hooks/useReports'
import { useTheme } from './hooks/useTheme'
import { ApiError } from './lib/api'
import { exportReports } from './lib/export'
import type { Report } from './types/report'

type Tab = 'laporan' | 'akun' | 'profil'

function App() {
  const { user, checking } = useAuth()
  const userId = user?.id ?? null
  // Tab disimpan berpasangan dengan userId supaya otomatis kembali ke "laporan"
  // setiap identitas pengguna berganti — login ulang akun yang sama, pindah akun,
  // maupun setelah logout. Reset terjadi saat render (pola resmi React), bukan di
  // useEffect: kalau lewat efek, halaman tab lama sempat tampil satu frame dulu.
  const [tabState, setTabState] = useState<{ userId: number | null; tab: Tab }>({
    userId,
    tab: 'laporan',
  })
  if (tabState.userId !== userId) setTabState({ userId, tab: 'laporan' })
  const tab = tabState.userId === userId ? tabState.tab : 'laporan'
  const setTab = (next: Tab) => setTabState({ userId, tab: next })
  const {
    reports,
    summary,
    meta,
    setPage,
    limit,
    filter,
    changeFilter,
    query,
    changeQuery,
    order,
    changeOrder,
    changeLimit,
    loading,
    error,
    action,
    reload,
    create,
    setStatus,
    setStatusBulk,
    selectedIds,
    toggleSelect,
    toggleSelectPage,
    clearSelection,
    edit,
    remove,
  } = useReports(user)
  const { theme, toggle: toggleTheme } = useTheme()
  // Render satu tata letak saja (tabel di md+, kartu di bawahnya) dan tunda highlight pencarian
  // agar mengetik tetap responsif walau daftar panjang.
  const isTabletUp = useMediaQuery('(min-width: 768px)')
  const listQuery = useDeferredValue(query)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Report | null>(null)
  // Satu state konfirmasi untuk semua aksi (setujui/tolak/hapus/bulk) — 4 dialog di bawah
  // diganti satu <ConfirmDialog> data-driven agar tidak repetitif.
  const [confirm, setConfirm] = useState<
    | { kind: 'approve' | 'reject' | 'delete'; report: Report }
    | { kind: 'bulk'; status: 'approved' | 'rejected' }
    | null
  >(null)
  const [exporting, setExporting] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const isAdmin = user?.role === 'admin'
  // Admin dan Approver boleh memutus; Pelapor tidak.
  const canDecide = isAdmin || user?.role === 'approver'
  const currentUserId = user?.id ?? -1

  // Tab "Kelola akun" hanya untuk Admin; "profil" boleh semua peran.
  const activeTab = isAdmin ? tab : tab === 'profil' ? 'profil' : 'laporan'

  // Pindah halaman lewat sidebar: mulai dari atas halaman.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [activeTab])

  // Panel detail selalu membaca data terbaru dari daftar (status berubah -> panel ikut berubah).
  const selected = selectedId === null ? null : (reports.find((r) => r.id === selectedId) ?? null)

  // Pintasan keyboard: "/" fokus ke pencarian, "n" membuat laporan baru.
  // Diabaikan saat mengetik, memakai tombol modifier, atau ada dialog/panel yang terbuka.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === '/') {
        const input = document.getElementById('report-search')
        if (input) {
          e.preventDefault()
          input.focus()
        }
      } else if ((e.key === 'n' || e.key === 'N') && (isAdmin || user?.role === 'pelapor')) {
        e.preventDefault()
        setDialogOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // dependensi peran: pintasan "n" hanya aktif untuk yang boleh membuat laporan.
  }, [isAdmin, user?.role])

  // Saat token sesi sedang diverifikasi (refresh halaman), tampilkan layar kosong —
  // JANGAN layar login, karena sesi yang masih valid akan langsung masuk.
  // Layar login hanya muncul setelah verifikasi selesai dan user tetap null.
  // Diletakkan setelah semua hook agar urutan hook tidak berubah antar render.
  if (checking) {
    return <div aria-busy="true" aria-label="Memuat sesi" className="min-h-dvh bg-background" />
  }
  if (!user) {
    return (
      <>
        <Login theme={theme} onToggleTheme={toggleTheme} />
        <Toaster
          theme={theme}
          position="top-center"
          richColors
          closeButton
          offset={{ top: 'max(1rem, env(safe-area-inset-top))' }}
          toastOptions={{ duration: 3500 }}
        />
      </>
    )
  }

  async function handleExport(): Promise<void> {
    if (exporting) return
    setExporting(true)
    try {
      const { truncated } = await exportReports({ status: filter, q: query, order })
      toast.success(
        truncated
          ? 'Laporan diunduh (XLSX). Sebagian data dipotong karena melebihi batas 5000 baris.'
          : 'Laporan diunduh (XLSX).',
      )
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Gagal mengunduh data. Coba lagi.')
    } finally {
      setExporting(false)
    }
  }

  async function handleCreate(nama: string, deskripsi: string): Promise<void> {
    try {
      await create(nama, deskripsi)
      toast.success('Laporan berhasil dibuat.')
    } catch (e) {
      throw new Error(
        e instanceof ApiError ? e.message : 'Laporan gagal disimpan. Coba lagi.',
      )
    }
  }

  async function handleEdit(nama: string, deskripsi: string): Promise<void> {
    if (!editTarget) return
    await edit(editTarget.id, nama, deskripsi)
    setEditTarget(null)
  }

  const busy = action !== null

  function requestApprove(id: number) {
    const target = reports.find((r) => r.id === id)
    if (target) setConfirm({ kind: 'approve', report: target })
  }

  function requestReject(id: number) {
    const target = reports.find((r) => r.id === id)
    if (target) setConfirm({ kind: 'reject', report: target })
  }

  function requestDelete(report: Report) {
    setConfirm({ kind: 'delete', report })
  }

  return (
    <AppShell
      theme={theme}
      onToggleTheme={toggleTheme}
      connection={loading ? 'checking' : error ? 'offline' : 'online'}
      pending={loading || error ? null : summary.pending}
      onAdd={() => setDialogOpen(true)}
      view={activeTab}
      onNavigate={setTab}
    >
      <main className="page-gutter mx-auto flex w-full max-w-[1400px] flex-col gap-5 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:gap-6 sm:py-8 sm:pb-8 lg:gap-6 lg:pt-3 lg:pb-8 2xl:max-w-[1560px]">
        {activeTab === 'akun' && isAdmin ? (
          <UserManager />
        ) : activeTab === 'profil' ? (
          <Profile />
        ) : (
        <>
        <section aria-label="Ringkasan" className="flex flex-col gap-5 rounded-[1.75rem] border border-border bg-card p-4 shadow-card sm:gap-6 sm:rounded-[2rem] sm:p-6 lg:p-8">
          <PageHeader
            onAdd={() => setDialogOpen(true)}
            pending={loading || error ? null : summary.pending}
            failed={!loading && Boolean(error)}
            onReviewPending={() => {
              changeFilter('pending')
              document.getElementById('daftar-laporan')?.scrollIntoView({ block: 'start' })
            }}
          />
          {loading ? <StatsSkeleton /> : !error && <StatsStrip summary={summary} />}
        </section>

        <section id="daftar-laporan" aria-label="Daftar laporan" className="flex scroll-mt-20 flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-card md:shadow-card">
          {loading ? (
            <TableSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void reload('initial')} />
          ) : (
            <>
              <Toolbar
                query={query}
                onQuery={changeQuery}
                filter={filter}
                onFilter={changeFilter}
                order={order}
                onOrder={changeOrder}
                onExport={() => void handleExport()}
                exporting={exporting}
                summary={summary}
              />
              {meta.total === 0 && !query.trim() && filter === 'all' ? (
                <EmptyState onAdd={() => setDialogOpen(true)} />
              ) : reports.length === 0 ? (
                <EmptySearchState
                  title={filter !== 'all' ? `Belum ada laporan ${STATUS_LABEL[filter]}` : undefined}
                  description={
                    filter !== 'all'
                      ? `Belum ada laporan berstatus ${STATUS_LABEL[filter]}. Ubah filter atau tambah laporan baru.`
                      : undefined
                  }
                  onClear={() => {
                    changeQuery('')
                    changeFilter('all')
                    changeOrder('newest')
                  }}
                />
              ) : (
                <>
                  {selectedIds.length > 0 && (
                    <div className="md:border-b md:border-border md:px-5 md:py-3.5">
                      <BulkBar
                        count={selectedIds.length}
                        busy={busy}
                        onApprove={() => setConfirm({ kind: 'bulk', status: 'approved' })}
                        onReject={() => setConfirm({ kind: 'bulk', status: 'rejected' })}
                        onClear={clearSelection}
                      />
                    </div>
                  )}
                  {isTabletUp ? (
                    <ReportTable
                      reports={reports}
                      total={summary.all}
                      page={meta.page}
                      limit={meta.limit}
                      action={action}
                      query={listQuery}
                      selectedIds={selectedIds}
                      canDecide={canDecide}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      onToggleSelect={toggleSelect}
                      onToggleSelectPage={toggleSelectPage}
                      onApprove={requestApprove}
                      onReject={requestReject}
                      onEdit={setEditTarget}
                      onDelete={requestDelete}
                      onOpen={(r) => setSelectedId(r.id)}
                    />
                  ) : (
                    <ReportCards
                      reports={reports}
                      total={summary.all}
                      page={meta.page}
                      limit={meta.limit}
                      action={action}
                      query={listQuery}
                      selectedIds={selectedIds}
                      canDecide={canDecide}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      onToggleSelect={toggleSelect}
                      onToggleSelectPage={toggleSelectPage}
                      onApprove={requestApprove}
                      onReject={requestReject}
                      onEdit={setEditTarget}
                      onDelete={requestDelete}
                      onOpen={(r) => setSelectedId(r.id)}
                    />
                  )}
                  <div className="flex flex-col gap-3 text-xs text-muted-foreground max-md:rounded-3xl max-md:border max-md:border-border max-md:bg-card max-md:p-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-4 md:gap-y-3 md:border-t md:border-border md:bg-muted/20 md:px-5 md:py-3.5">
                    <div className="flex items-center justify-between gap-3 max-md:px-1 md:contents">
                      <p className="tabular-nums md:order-1" aria-live="polite">
                        {reports.length} dari {meta.total} laporan
                      </p>
                      <div className="md:order-3">
                        <PageSizeSelect value={limit} onChange={changeLimit} />
                      </div>
                    </div>
                    <div className="md:order-2 md:flex-1 md:max-w-xl">
                      <Pagination meta={meta} onPage={setPage} />
                    </div>
                  </div>
                  </>
              )}
            </>
          )}
        </section>
        </>
        )}
      </main>

      <ReportDetail
        report={selected}
        onClose={() => setSelectedId(null)}
        busy={busy}
        canDelete={summary.all > 1}
        onApprove={(r) => {
          setSelectedId(null)
          setConfirm({ kind: 'approve', report: r })
        }}
        onReject={(r) => {
          setSelectedId(null)
          setConfirm({ kind: 'reject', report: r })
        }}
        onEdit={(r) => {
          setSelectedId(null)
          setEditTarget(r)
        }}
        onDelete={(r) => {
          setSelectedId(null)
          setConfirm({ kind: 'delete', report: r })
        }}
      />
      <ReportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
      <ReportDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onSubmit={handleEdit}
        initial={editTarget ? { nama: editTarget.nama, deskripsi: editTarget.deskripsi } : null}
        title="Ubah laporan"
        submitLabel="Simpan perubahan"
        submittingLabel="Menyimpan…"
      />
      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={() => !busy && setConfirm(null)}
          title={
            confirm.kind === 'bulk'
              ? `${confirm.status === 'approved' ? 'Setujui' : 'Tolak'} ${selectedIds.length} laporan?`
              : confirm.kind === 'approve'
                ? 'Setujui laporan ini?'
                : confirm.kind === 'reject'
                  ? 'Tolak laporan ini?'
                  : 'Hapus laporan ini?'
          }
          description={
            confirm.kind === 'bulk'
              ? `${selectedIds.length} laporan pending akan ditandai ${confirm.status === 'approved' ? 'Disetujui' : 'Ditolak'} sekaligus. Laporan yang sudah diputuskan dilewati otomatis.`
              : confirm.kind === 'approve'
                ? `“${confirm.report.nama}” akan ditandai Disetujui dan tidak bisa diubah lagi.`
                : confirm.kind === 'reject'
                  ? `“${confirm.report.nama}” akan ditandai Ditolak dan tidak bisa diubah lagi.`
                  : `“${confirm.report.nama}” akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`
          }
          confirmLabel={
            confirm.kind === 'bulk'
              ? confirm.status === 'approved'
                ? 'Setujui semua'
                : 'Tolak semua'
              : confirm.kind === 'approve'
                ? 'Setujui laporan'
                : confirm.kind === 'reject'
                  ? 'Tolak laporan'
                  : 'Hapus laporan'
          }
          tone={confirm.kind === 'approve' || confirm.kind === 'bulk' ? 'approve' : 'reject'}
          busy={busy}
          onConfirm={() => {
            if (busy || !confirm) return
            if (confirm.kind === 'approve') {
              const target = confirm.report
              setConfirm(null)
              void setStatus(target.id, 'approved')
            } else if (confirm.kind === 'reject') {
              const target = confirm.report
              setConfirm(null)
              void setStatus(target.id, 'rejected')
            } else if (confirm.kind === 'delete') {
              const target = confirm.report
              setConfirm(null)
              void remove(target.id).catch(() => undefined)
            } else if (confirm.kind === 'bulk') {
              const status = confirm.status
              setConfirm(null)
              void setStatusBulk([...selectedIds], status).catch(() => undefined)
            }
          }}
        />
      )}
      <Toaster
        theme={theme}
        position="top-center"
        richColors
        closeButton
        offset={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        toastOptions={{ duration: 3500 }}
      />
    </AppShell>
  )
}

export default App
