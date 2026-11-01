import { z } from 'zod'

export const MAX_CONTACTS = 6
export const contactIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)

export const contactPersonSchema = z.object({
  id: contactIdSchema,
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
    people: z.array(contactPersonSchema).max(MAX_CONTACTS),
    expiryMinutes: z.number().int().min(2).max(60),
    fallbackAfterMinutes: z.number().int().min(1).max(30)
  })
  .refine(
    (value) =>
      (!value.enabled || value.people.length > 0) &&
      new Set(value.people.map((person) => person.id)).size === value.people.length &&
      new Set(value.people.map((person) => person.phone)).size === value.people.length &&
      value.fallbackAfterMinutes < value.expiryMinutes,
    {
      message: 'Add a contact, use unique numbers, and choose a wait shorter than expiry.'
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
export type ContactPerson = z.infer<typeof contactPersonSchema>
export type PublicContactPerson = Omit<ContactPerson, 'phone'>
export type PublicContacts = Omit<ContactSetup, 'people'> & {
  people: PublicContactPerson[]
  /** Derived from list order for the Home callback button. */
  preferred: PublicContactPerson | null
  fallback: PublicContactPerson | null
}
export type AdminContactSetup = ContactSetup & { hasCredentials: boolean }
export function defaultContactSetup(): ContactSetup {
  return {
    enabled: false,
    people: [],
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
    people: config.people.map((person) => publicContact(person)!),
    preferred: publicContact(config.people[0] ?? null),
    fallback: publicContact(config.people[1] ?? null),
    expiryMinutes: config.expiryMinutes,
    fallbackAfterMinutes: config.fallbackAfterMinutes
  }
}
