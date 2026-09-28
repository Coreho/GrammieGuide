/** Feed URLs stay in main; only bounded, plain-text previews cross IPC. */
export type Story = {
  id: string
  title: string
  url: string
  publishedAt: string | null
  summary: string
  imageUrl?: string
}

export type NewsStory = Omit<Story, 'imageUrl'> & { thumbnail?: string }
export type NewsResult =
  { ok: true; stories: NewsStory[]; stale: boolean; fetchedAt: number } | { ok: false }

export const DEFAULT_NEWS_FEED = 'https://feeds.npr.org/1001/rss.xml'
export const DEFAULT_NEWS_SITE = 'https://www.npr.org'
