import { z } from 'zod'

export const contactPersonSchema = z.object({
  id: z.enum(['preferred', 'fallback']),
  name: z.string().trim().min(1).max(12),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/),
  photoId: z.string().uuid().optional()
})
export const contactCredentialsSchema = z.object({
  accountSid: z
    .string()
    .trim()
    .regex(/^AC[0-9a-fA-F]{32}$/),
  apiKeySid: z
    .string()
    .trim()
    .regex(/^SK[0-9a-fA-F]{32}$/),
  apiKeySecret: z.string().trim().min(1).max(256),
  sender: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/),
  messagingServiceSid: z
    .string()
    .trim()
    .regex(/^MG[0-9a-fA-F]{32}$/)
    .optional()
})
export const contactSetupSchema = z
  .object({
    enabled: z.boolean(),
    preferred: contactPersonSchema.nullable(),
    fallback: contactPersonSchema.nullable(),
    expiryMinutes: z.number().int().min(2).max(60),
    fallbackAfterMinutes: z.number().int().min(1).max(30)
  })
  .refine(
    (value) =>
      (!value.enabled || value.preferred !== null) &&
      (!value.preferred || value.preferred.id === 'preferred') &&
      (!value.fallback ||
        (value.fallback.id === 'fallback' &&
          value.preferred !== null &&
          value.fallback.phone !== value.preferred.phone)) &&
      value.fallbackAfterMinutes < value.expiryMinutes,
    {
      message:
        'Choose a preferred contact, a different fallback number, and a wait shorter than expiry.'
    }
  )
export const contactConfigSchema = contactSetupSchema.and(
  z.object({
    credentials: contactCredentialsSchema.optional()
  })
)
export type ContactSetup = z.infer<typeof contactSetupSchema>
export type ContactConfig = z.infer<typeof contactConfigSchema>
export type ContactCredentials = z.infer<typeof contactCredentialsSchema>
export type ContactPerson = ContactSetup['preferred'] & {}
export type PublicContactPerson = Omit<ContactPerson, 'phone'>
export type PublicContacts = Omit<ContactSetup, 'preferred' | 'fallback'> & {
  preferred: PublicContactPerson | null
  fallback: PublicContactPerson | null
}
export type AdminContactSetup = ContactSetup & { hasCredentials: boolean }
export function defaultContactSetup(): ContactSetup {
  return {
    enabled: false,
    preferred: null,
    fallback: null,
    expiryMinutes: 10,
    fallbackAfterMinutes: 2
  }
}
export function publicContact(person: ContactPerson | null): PublicContactPerson | null {
  if (!person) return null
  const { phone: _phone, ...display } = person
  return display
}
export function publicContacts(config: ContactConfig): PublicContacts {
  return {
    enabled: config.enabled,
    preferred: publicContact(config.preferred),
    fallback: publicContact(config.fallback),
    expiryMinutes: config.expiryMinutes,
    fallbackAfterMinutes: config.fallbackAfterMinutes
  }
}
