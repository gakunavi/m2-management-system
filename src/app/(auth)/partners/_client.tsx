'use client';

import { Suspense, useState, useMemo, useCallback } from 'react';
import { Link2 } from 'lucide-react';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { useBusinessColumns } from '@/hooks/use-business-columns';
import { usePartnerConfig } from '@/hooks/use-partner-config';
import { useBusiness } from '@/hooks/use-business';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { LinkPartnerToBusinessDialog } from '@/components/features/partner/link-partner-to-business-dialog';

function PartnersPageContent() {
  const { businesses, selectedBusinessId } = useBusiness();
  const { listConfig } = usePartnerConfig(selectedBusinessId);
  const { config } = useBusinessColumns(listConfig, 'partner');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedBusiness = useMemo(
    () => businesses.find((b) => b.id === selectedBusinessId),
    [businesses, selectedBusinessId],
  );

  const handleLinkComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // 事業選択時: createAction でモーダル起動ボタンに差し替え
  const finalConfig = useMemo(() => {
    if (!selectedBusinessId || !selectedBusiness) return config;

    return {
      ...config,
      createAction: {
        label: '事業に代理店を紐付け',
        render: () => (
          <Button onClick={() => setLinkDialogOpen(true)}>
            <Link2 className="mr-2 h-4 w-4" />
            事業に代理店を紐付け
          </Button>
        ),
      },
      // createPathを無効にして通常の新規作成ボタンを非表示に
      createPath: undefined,
    };
  }, [config, selectedBusinessId, selectedBusiness]);

  return (
    <>
      <EntityListTemplate key={refreshKey} config={finalConfig} />
      {selectedBusinessId && selectedBusiness && (
        <LinkPartnerToBusinessDialog
          businessId={selectedBusinessId}
          businessName={selectedBusiness.businessName}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          onComplete={handleLinkComplete}
        />
      )}
    </>
  );
}

export function PartnersClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PartnersPageContent />
    </Suspense>
  );
}
