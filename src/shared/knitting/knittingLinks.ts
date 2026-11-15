import { z } from 'zod'
import { httpUrl } from '../news/httpUrl'

/** Eight fit on one screen of large buttons without scrolling. */
export const MAX_KNITTING_LINKS = 8
export const KNITTING_LINK_LABEL_MAX = 40

/** One video or website the caregiver saved for her Knitting shelf. */
export const knittingLinkSchema = z.object({
  id: z.string().uuid(),
  label: z
    .string()
    .trim()
    .min(1, 'Give the link a short name.')
    .max(KNITTING_LINK_LABEL_MAX, `Keep the name to ${KNITTING_LINK_LABEL_MAX} characters.`),
  url: z
    .string()
    .trim()
    .max(2048, 'That address is too long.')
    .refine((value) => {
      if (!httpUrl(value)) return false
      const url = new URL(value)
      return !url.username && !url.password
    }, 'Enter a complete http:// or https:// address without a username or password.')
    .transform((value) => new URL(value).href)
})
export type KnittingLink = z.infer<typeof knittingLinkSchema>

/**
 * Lenient on purpose, like approvedSites: an entry this build can't accept (a
 * rule tightened later, a hand-edited file) is dropped, never a reason to fail
 * her whole config at boot and reset Home. Admin checks each link with
 * knittingLinkSchema before saving, so nothing she was given disappears silently.
 */
export const knittingLinksSchema = z
  .array(z.unknown())
  .transform((entries) => {
    const seen = new Set<string>()
    return entries
      .flatMap((entry) => {
        const parsed = knittingLinkSchema.safeParse(entry)
        if (!parsed.success || seen.has(parsed.data.id)) return []
        seen.add(parsed.data.id)
        return [parsed.data]
      })
      .slice(0, MAX_KNITTING_LINKS)
  })
  .optional()
  .catch(undefined)
