import { useEffect, useState } from 'react'
import type { Photo, PhotoImportProgress } from '@shared/media/photoTypes'
import './PhotosTab.css'

function PhotoEditor({
  photo,
  disabled,
  onSaved,
  onRemoved
}: {
  photo: Photo
  disabled: boolean
  onSaved: (photo: Photo) => void
  onRemoved: (id: string) => void
}) {
  const [caption, setCaption] = useState(photo.caption)
  const [showToHer, setShowToHer] = useState(photo.showToHer)
  const [order, setOrder] = useState(String(photo.order))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const orderNumber = Number(order)
  const validOrder = order.trim() !== '' && Number.isSafeInteger(orderNumber) && orderNumber >= 0
  const dirty =
    caption !== photo.caption || showToHer !== photo.showToHer || orderNumber !== photo.order

  const save = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      onSaved(
        await window.admin.updatePhoto({
          id: photo.id,
          patch: { caption, showToHer, order: orderNumber }
        })
      )
      setSaved(true)
    } catch {
      setError('Could not save this photo. Your changes are still here; try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm('Remove this photo from the library? The original file is kept.')) return
    setBusy(true)
    setError('')
    try {
      await window.admin.removePhoto(photo.id)
      onRemoved(photo.id)
    } catch {
      setError('Could not remove this photo. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="photo-editor">
      <img src={photo.thumbnailUrl} alt={photo.caption || 'Imported photo'} loading="lazy" />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (validOrder) void save()
        }}
      >
        <fieldset disabled={disabled || busy}>
          <label>
            Caption (optional)
            <textarea
              value={caption}
              maxLength={2000}
              rows={3}
              onChange={(event) => {
                setCaption(event.target.value)
                setSaved(false)
              }}
            />
          </label>
          <label className="photo-visibility">
            <input
              type="checkbox"
              role="switch"
              checked={showToHer}
              onChange={(event) => {
                setShowToHer(event.target.checked)
                setSaved(false)
              }}
            />
            Show to her
          </label>
          <label>
            Order
            <input
              type="number"
              min={0}
              step={1}
              required
              value={order}
              onChange={(event) => {
                setOrder(event.target.value)
                setSaved(false)
              }}
            />
          </label>
          <div className="photo-actions">
            <button type="submit" disabled={!dirty || !validOrder}>
              {busy ? 'Working…' : 'Save changes'}
            </button>
            <button type="button" onClick={() => void remove()}>
              Remove
            </button>
          </div>
        </fieldset>
      </form>
      {saved && <p role="status">Saved.</p>}
      {error && <p role="alert">{error}</p>}
    </li>
  )
}

export function PhotosTab() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<PhotoImportProgress | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setPhotos(await window.admin.listPhotos())
    } catch {
      setError('Could not load the photo library. Try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const importPhotos = async (): Promise<void> => {
    setImporting(true)
    setProgress(null)
    setStatus('')
    setError('')
    // Subscribe before opening the picker so even a one-photo import has progress.
    const unsubscribe = window.admin.onPhotoImportProgress(setProgress)
    try {
      const result = await window.admin.importPhotos()
      setStatus(
        `${result.imported} imported, ${result.failed} failed.${result.failed ? ' Failed photos could not be read or saved. HEIC support depends on this Windows device.' : ''}`
      )
      await load()
    } catch {
      setError(
        'Could not finish the import. Reload the library to see any photos already added, then try again.'
      )
    } finally {
      unsubscribe()
      setImporting(false)
    }
  }

  return (
    <section className="photos-tab" aria-labelledby="photos-title">
      <h2 id="photos-title">Photos</h2>
      <p>
        Add family photos and a caption for each. Choose which photos to show her and the order they
        appear.
      </p>
      <p>JPG, PNG and WebP are supported. HEIC works when this Windows device can decode it.</p>
      <div className="photo-actions">
        <button disabled={loading || importing} onClick={() => void importPhotos()}>
          {importing ? 'Importing…' : 'Add photos…'}
        </button>
        <button disabled={loading || importing} onClick={() => void load()}>
          Reload library
        </button>
      </div>
      <div role="status" aria-live="polite">
        {importing && progress && (
          <p>
            Processed {progress.completed} of {progress.total} — {progress.imported} imported,{' '}
            {progress.failed} failed.
          </p>
        )}
        {!importing && status && <p>{status}</p>}
        {loading && <p>Loading photos…</p>}
      </div>
      {error && <p role="alert">{error}</p>}
      {!loading && !error && photos.length === 0 && (
        <p>No photos yet. Use “Add photos…” to start your library.</p>
      )}
      {photos.length > 0 && (
        <p>
          Lower order numbers appear first. Photos with the same number keep their import order.
          Save changes on each photo.
        </p>
      )}
      <ul className="photo-grid" aria-busy={loading || importing}>
        {photos.map((photo) => (
          <PhotoEditor
            key={photo.id}
            photo={photo}
            disabled={loading || importing}
            onSaved={(updated) =>
              setPhotos((current) =>
                current
                  .map((entry) => (entry.id === updated.id ? updated : entry))
                  .sort((a, b) => a.order - b.order || a.importIndex - b.importIndex)
              )
            }
            onRemoved={(id) => setPhotos((current) => current.filter((entry) => entry.id !== id))}
          />
        ))}
      </ul>
    </section>
  )
}
