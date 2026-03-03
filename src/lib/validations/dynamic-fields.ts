import { z } from 'zod';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

/**
 * フィールド定義配列からZodスキーマを動的に生成する。
 */
export function buildDynamicFieldSchema(
  fields: ProjectFieldDefinition[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case 'text':
        schema = z.string().max(500);
        break;
      case 'textarea':
        schema = z.string().max(2000);
        break;
      case 'number':
        schema = z.number();
        break;
      case 'date':
        schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
        break;
      case 'month':
        schema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
        break;
      case 'select':
        schema = z.string();
        break;
      case 'checkbox':
        schema = z.boolean();
        break;
      case 'url':
        schema = z.string().url().max(2000).or(z.literal(''));
        break;
      default:
        schema = z.unknown();
    }

    if (!field.required) {
      schema = schema.optional().nullable();
    }

    shape[field.key] = schema;
  }

  return z.object(shape);
}
