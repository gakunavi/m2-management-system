'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { EntityFormConfig, FormFieldDef } from '@/types/config';
import { useEntityForm } from '@/hooks/use-entity-form';
import { useDuplicateCheck } from '@/hooks/use-duplicate-check';
import { useFormLeaveWarning } from '@/hooks/use-form-leave-warning';
import { PageHeader } from '@/components/layout/page-header';
import { FormField } from '@/components/form/form-field';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Save, ArrowLeft } from 'lucide-react';

interface EntityFormTemplateProps {
  config: EntityFormConfig;
  id?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function EntityFormTemplate({ config, id, breadcrumbs }: EntityFormTemplateProps) {
  const router = useRouter();
  const {
    formData,
    setField,
    errors,
    submit,
    isSubmitting,
    mode,
    isLoading,
    isDirty,
  } = useEntityForm(config, id);

  // 未保存変更がある場合にタブ/ウィンドウ閉じ・リロードを警告
  useFormLeaveWarning(isDirty, config.warnOnLeave);

  if (isLoading) return <LoadingSpinner />;

  const title = mode === 'create' ? config.title.create : config.title.edit;
  const excludeId = mode === 'edit' && id ? Number(id) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              戻る
            </Button>
            <Button
              onClick={submit}
              disabled={isSubmitting || (mode === 'edit' && !isDirty)}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? '保存中...' : '保存'}
            </Button>
          </div>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-8"
      >
        {config.sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="rounded-lg border bg-card p-4 sm:p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 pb-3 border-b">{section.title}</h3>
            <div
              className={`grid gap-x-6 gap-y-4 ${
                section.columns === 3
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  : section.columns === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1'
              }`}
            >
              {section.fields
                .filter((f) => !f.visibleWhen || f.visibleWhen(formData))
                .map((field) => {
                  const effectiveField = field.disabledOnEdit && mode === 'edit'
                    ? { ...field, disabled: true }
                    : field;
                  return effectiveField.duplicateCheck ? (
                    <FormFieldWithDuplicateCheck
                      key={field.key}
                      field={effectiveField}
                      value={formData[field.key]}
                      onChange={(value) => setField(field.key, value)}
                      error={errors[field.key]}
                      excludeId={excludeId}
                      formData={formData}
                    />
                  ) : (
                    <FormField
                      key={field.key}
                      field={effectiveField}
                      value={formData[field.key]}
                      onChange={(value) => setField(field.key, value)}
                      error={errors[field.key]}
                      formData={formData}
                      onSetField={setField}
                    />
                  );
                })}
            </div>
          </div>
        ))}
      </form>
    </div>
  );
}

/**
 * duplicateCheck 付きフィールド用の内部コンポーネント。
 * React のフック規則（呼び出し回数固定）を守りつつ、フィールドごとに useDuplicateCheck を呼び出す。
 */
function FormFieldWithDuplicateCheck({
  field,
  value,
  onChange,
  error,
  excludeId,
  formData,
}: {
  field: FormFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  excludeId?: number;
  formData?: Record<string, unknown>;
}) {
  const comboValues = useMemo(() => {
    if (!field.duplicateCheck?.comboFields) return undefined;
    const result: Record<string, unknown> = {};
    for (const cf of field.duplicateCheck.comboFields) {
      result[cf.formKey] = formData?.[cf.formKey];
    }
    return result;
  }, [field.duplicateCheck?.comboFields, formData]);

  const duplicateWarning = useDuplicateCheck(value, field.duplicateCheck, excludeId, comboValues);

  return (
    <FormField
      field={field}
      value={value}
      onChange={onChange}
      error={error}
      duplicateWarning={duplicateWarning}
      formData={formData}
    />
  );
}
