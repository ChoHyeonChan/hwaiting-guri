'use client';

import { useInbox } from '@/lib/store';
import { UploadPanel } from '@/components/UploadPanel';
import { InboxTable } from '@/components/InboxTable';
import { ItemDetail } from '@/components/ItemDetail';
import { ExportPanel } from '@/components/ExportPanel';
import { ManualEntryForm } from '@/components/ManualEntryForm';
import { PdfImportPanel } from '@/components/PdfImportPanel';

export default function Home() {
  const inbox = useInbox();

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-6">
      <header className="mb-4 border-b-2 border-navy pb-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-bold tracking-tight text-navy">
            ComfoziAI 구매 증빙 인박스
          </h1>
          <span className="rounded border border-gold bg-gold-soft px-1.5 py-0.5 text-[11px] text-navy">
            구매 자료 검토함
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          받은 증빙을 항목별로 정리하고, 확인이 필요한 건을 근거와 함께 표시합니다.
          합치거나 승인하는 판단은 사람이 합니다.
        </p>
      </header>

      <div className="space-y-3">
        <UploadPanel
          fileName={inbox.fileName}
          loadState={inbox.loadState}
          errorMessage={inbox.errorMessage}
          warnings={inbox.warnings}
          total={inbox.counts.total}
          exception={inbox.counts.exception}
          batchCount={inbox.batchCount}
          lastIntake={inbox.lastIntake}
          pendingFile={inbox.pendingFile}
          onLoad={inbox.load}
          onReset={inbox.reset}
          onConfirmPending={inbox.confirmPendingFile}
          onCancelPending={inbox.cancelPendingFile}
          onLoadSample={inbox.loadSample}
        />

        {/* 파일 없이도 넣을 수 있는 경로. 요건 ②의 "수기 등록" */}
        <ManualEntryForm onSubmit={inbox.addManual} />

        {/* 추가 요건: 원본 문서(PDF) 입력 */}
        <PdfImportPanel onRegister={inbox.addExtracted} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
          <InboxTable
            items={inbox.items}
            filtered={inbox.filtered}
            loadState={inbox.loadState}
            filters={inbox.filters}
            setFilters={inbox.setFilters}
            counts={inbox.counts}
            selectedId={inbox.selectedId}
            onSelect={inbox.setSelectedId}
            onLoadSample={inbox.loadSample}
          />
          <ItemDetail
            item={inbox.selected}
            onSelect={inbox.setSelectedId}
            actions={{
              editField: inbox.editField,
              approve: inbox.approve,
              reject: inbox.reject,
              reopen: inbox.reopen,
              toggleDuplicateDismissed: inbox.toggleDuplicateDismissed,
              setMemo: inbox.setMemo,
            }}
          />
        </div>

        {/* 검수를 마친 뒤에 오는 단계라 목록 아래에 둔다 */}
        {inbox.items.length > 0 && <ExportPanel items={inbox.items} />}
      </div>
    </main>
  );
}
