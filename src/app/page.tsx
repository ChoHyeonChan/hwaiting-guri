'use client';

import { useInbox } from '@/lib/store';
import { UploadPanel } from '@/components/UploadPanel';
import { InboxTable } from '@/components/InboxTable';
import { ItemDetail } from '@/components/ItemDetail';

export default function Home() {
  const inbox = useInbox();

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-6">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">구매 자료 검토함</h1>
        <p className="mt-0.5 text-sm text-slate-500">
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
          onLoad={inbox.load}
          onReset={inbox.reset}
        />

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
          />
          <ItemDetail item={inbox.selected} onSelect={inbox.setSelectedId} />
        </div>
      </div>
    </main>
  );
}
