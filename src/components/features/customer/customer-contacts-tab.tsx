'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ImagePreviewModal, type PreviewImage } from '@/components/ui/image-preview-modal';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/hooks/use-business';
import {
  CustomerContactFormModal,
  type ContactRecord,
  type ContactFormData,
} from './customer-contact-form-modal';

// ============================================
// Props
// ============================================

interface Props {
  entityId: number;
}

// ============================================
// コンポーネント
// ============================================

export function CustomerContactsTab({ entityId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { businesses } = useBusiness();

  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const openPreview = (contact: ContactRecord) => {
    const images: PreviewImage[] = [];
    if (contact.contactBusinessCardFrontUrl) {
      images.push({ url: contact.contactBusinessCardFrontUrl, label: '名刺（表）' });
    }
    if (contact.contactBusinessCardBackUrl) {
      images.push({ url: contact.contactBusinessCardBackUrl, label: '名刺（裏）' });
    }
    if (images.length > 0) {
      setPreviewImages(images);
      setPreviewOpen(true);
    }
  };

  // 担当者一覧取得
  const { data: contacts = [], isLoading } = useQuery<ContactRecord[]>({
    queryKey: ['customer-contacts', entityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/customers/${entityId}/contacts`);
      if (!res.ok) throw new Error('担当者の取得に失敗しました');
      const json = await res.json();
      return json.data;
    },
  });

  // 担当者追加
  const createMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const res = await fetch(`/api/v1/customers/${entityId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          contactDepartment: data.contactDepartment || null,
          contactPosition: data.contactPosition || null,
          contactPhone: data.contactPhone || null,
          contactFax: data.contactFax || null,
          contactEmail: data.contactEmail || null,
          contactBusinessCardFrontUrl: data.contactBusinessCardFrontUrl || null,
          contactBusinessCardBackUrl: data.contactBusinessCardBackUrl || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? '担当者の追加に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-contacts', entityId] });
      toast({ message: '担当者を追加しました', type: 'success' });
      setShowForm(false);
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
    },
  });

  // 担当者更新
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ContactFormData }) => {
      const res = await fetch(`/api/v1/customers/${entityId}/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          contactDepartment: data.contactDepartment || null,
          contactPosition: data.contactPosition || null,
          contactPhone: data.contactPhone || null,
          contactFax: data.contactFax || null,
          contactEmail: data.contactEmail || null,
          contactBusinessCardFrontUrl: data.contactBusinessCardFrontUrl || null,
          contactBusinessCardBackUrl: data.contactBusinessCardBackUrl || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? '担当者の更新に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-contacts', entityId] });
      toast({ message: '担当者を更新しました', type: 'success' });
      setEditingContact(null);
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
    },
  });

  // 担当者削除
  const deleteMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await fetch(`/api/v1/customers/${entityId}/contacts/${contactId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('担当者の削除に失敗しました');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-contacts', entityId] });
      toast({ message: '担当者を削除しました', type: 'success' });
      setDeletingContactId(null);
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
      setDeletingContactId(null);
    },
  });

  const handleFormSubmit = async (data: ContactFormData) => {
    if (editingContact) {
      await updateMutation.mutateAsync({ id: editingContact.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleEdit = (contact: ContactRecord) => {
    setEditingContact(contact);
    setShowForm(true);
  };

  const handleCloseForm = (open: boolean) => {
    if (!open) {
      setShowForm(false);
      setEditingContact(null);
    } else {
      setShowForm(true);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {contacts.length} 名の担当者
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditingContact(null);
            setShowForm(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          担当者を追加
        </Button>
      </div>

      {/* 担当者テーブル */}
      {contacts.length === 0 ? (
        <EmptyState
          title="担当者がいません"
          description="「担当者を追加」ボタンから担当者を登録してください。"
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>担当者名</TableHead>
                <TableHead>部署 / 役職</TableHead>
                <TableHead>電話番号</TableHead>
                <TableHead>メール</TableHead>
                <TableHead>担当事業</TableHead>
                <TableHead className="w-[64px] text-center">名刺</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{contact.contactName}</span>
                      {contact.contactIsRepresentative && (
                        <Badge variant="outline" className="text-xs">代表者</Badge>
                      )}
                      {contact.contactIsPrimary && (
                        <Badge className="text-xs">主担当</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {contact.contactDepartment && (
                        <div>{contact.contactDepartment}</div>
                      )}
                      {contact.contactPosition && (
                        <div className="text-muted-foreground">{contact.contactPosition}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{contact.contactPhone ?? '-'}</TableCell>
                  <TableCell className="text-sm">{contact.contactEmail ?? '-'}</TableCell>
                  <TableCell className="text-sm">
                    {contact.businesses.length > 0
                      ? contact.businesses.map((b) => b.businessName).join(', ')
                      : '-'}
                  </TableCell>
                  {/* 名刺サムネイル列 */}
                  <TableCell className="text-center">
                    {contact.contactBusinessCardFrontUrl || contact.contactBusinessCardBackUrl ? (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded hover:bg-muted p-1 transition-colors"
                        title="名刺を表示"
                        onClick={() => openPreview(contact)}
                      >
                        {contact.contactBusinessCardFrontUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={contact.contactBusinessCardFrontUrl}
                            alt="名刺（表）"
                            className="h-8 w-14 object-cover rounded border"
                          />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(contact)}
                        aria-label="編集"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeletingContactId(contact.id)}
                        aria-label="削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 担当者フォームモーダル */}
      <CustomerContactFormModal
        open={showForm}
        onOpenChange={handleCloseForm}
        contact={editingContact}
        availableBusinesses={businesses}
        onSubmit={handleFormSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* 削除確認モーダル */}
      <ConfirmModal
        open={deletingContactId !== null}
        onOpenChange={(open) => !open && setDeletingContactId(null)}
        title="担当者を削除しますか？"
        description="この操作は元に戻せません。担当者に紐づく事業リンクも削除されます。"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={() => {
          if (deletingContactId !== null) {
            deleteMutation.mutate(deletingContactId);
          }
        }}
        isLoading={deleteMutation.isPending}
      />

      {/* 名刺プレビューモーダル */}
      <ImagePreviewModal
        images={previewImages}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
