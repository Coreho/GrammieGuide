import { DEFAULT_NEWS_SOURCES, type NewsSource } from '@shared/news/sources'
import { DEFAULT_NEWS_FEED, DEFAULT_NEWS_SITE } from '@shared/news/types'
import type { Tile } from '@shared/configSchema'

export function NewsSourcesEditor({
  draft,
  onChange
}: {
  draft: Tile
  onChange: (tile: Tile) => void
}) {
  function update(index: number, patch: Partial<NewsSource>): void {
    onChange({
      ...draft,
      newsSources: draft.newsSources!.map((source, i) =>
        i === index ? { ...source, ...patch } : source
      )
    })
  }
  return (
    <>
      <label>
        News layout{' '}
        <select
          value={draft.newsSources ? 'sites' : 'feed'}
          onChange={(event) =>
            onChange({
              ...draft,
              newsSources:
                event.target.value === 'sites'
                  ? DEFAULT_NEWS_SOURCES.map((source) => ({ ...source }))
                  : undefined,
              feedUrl:
                event.target.value === 'feed' ? draft.feedUrl || DEFAULT_NEWS_FEED : undefined,
              url: event.target.value === 'feed' ? draft.url || DEFAULT_NEWS_SITE : undefined
            })
          }
        >
          <option value="sites">Website choices</option>
          <option value="feed">Stories from a feed</option>
        </select>
      </label>
      {draft.newsSources ? (
        <fieldset>
          <legend>News website choices</legend>
          <p>Shown left to right. Each card opens the website directly.</p>
          {draft.newsSources.map((source, index) => (
            <div key={source.id} style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
              <label>
                Source {index + 1} name{' '}
                <input
                  required
                  maxLength={40}
                  value={source.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                />
              </label>
              <label>
                Source {index + 1} website{' '}
                <input
                  required
                  value={source.url}
                  onChange={(event) => update(index, { url: event.target.value })}
                />
              </label>
              <button
                type="button"
                disabled={draft.newsSources!.length === 1}
                aria-label={`Remove source ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...draft,
                    newsSources: draft.newsSources!.filter((_, i) => i !== index)
                  })
                }
              >
                Remove source
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={draft.newsSources.length >= 6}
            onClick={() =>
              onChange({
                ...draft,
                newsSources: [
                  ...draft.newsSources!,
                  { id: crypto.randomUUID(), label: '', url: '' }
                ]
              })
            }
          >
            Add news source
          </button>
        </fieldset>
      ) : (
        <>
          <label>
            Feed address{' '}
            <input
              required
              placeholder="https://..."
              value={draft.feedUrl ?? ''}
              onChange={(event) => onChange({ ...draft, feedUrl: event.target.value })}
            />
          </label>
          <label>
            News website{' '}
            <input
              placeholder="https://... (optional)"
              value={draft.url ?? ''}
              onChange={(event) => onChange({ ...draft, url: event.target.value })}
            />
          </label>
        </>
      )}
    </>
  )
}
