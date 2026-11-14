import { z } from 'zod'

export const projectSchema = z.object({
  name: z.string().trim().min(3, 'Укажите наименование (не короче 3 символов)'),
  address: z.string().trim().min(3, 'Укажите адрес'),
  cadastralNumber: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}:\d{6,7}:\d{1,6}$/, 'Формат: 77:01:0004012:1234'),
  constructionType: z.enum(['new', 'reconstruction', 'overhaul', 'linear']),
  developer: z.string().trim().min(2, 'Укажите застройщика'),
  customer: z.string().trim(),
  designer: z.string().trim(),
  functionalPurpose: z.string().trim(),
  financingSource: z.string().trim(),
})
export type ProjectValues = z.infer<typeof projectSchema>
