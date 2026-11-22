import { useEffect, useState } from 'react'
import { PHOTO_DATE_MAX, type Photo, type PhotoImportProgress } from '@shared/media/photoTypes'
import { MAIN_ALBUM_LABEL, PHOTO_ALBUM_MAX, photoAlbums } from '@shared/media/photoAlbums'

/** One list of album names for every album field, so typing offers the albums that exist. */
const ALBUM_LIST_ID = 'photo-album-names'
const ALL_ALBUMS = '\u0000all'
import './PhotosTab.css'
import { useConfigStore } from '../state/useConfigStore'
import { PhotoNarrationEditor } from './PhotoNarrationEditor'

function PhotoEditor({
  photo,
  disabled,
  onSaved,
  onRemoved,
  onRecording
}: {
  photo: Photo
  disabled: boolean
  onSaved: (photo: Photo) => void
  onRemoved: (id: string) => void
  onRecording: (active: boolean) => void
}) {
  const [caption, setCaption] = useState(photo.caption)
  const [date, setDate] = useState(photo.date)
  const [showToHer, setShowToHer] = useState(photo.showToHer)
  const [album, setAlbum] = useState(photo.album)
  const [order, setOrder] = useState(String(photo.order))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [recording, setRecording] = useState(false)
  const orderNumber = Number(order)
  const validOrder = order.trim() !== '' && Number.isSafeInteger(orderNumber) && orderNumber >= 0
  const dirty =
    caption !== photo.caption ||
    date !== photo.date ||
    showToHer !== photo.showToHer ||
    album.trim() !== photo.album ||
    orderNumber !== photo.order

  const save = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const updated = await window.admin.updatePhoto({
        id: photo.id,
        patch: { caption, date, showToHer, album, order: orderNumber }
      })
      // Main tidies the date's and album's spacing; show what was saved so the form isn't left "changed".
      setDate(updated.date)
      setAlbum(updated.album)
      onSaved(updated)
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
        <fieldset disabled={disabled || busy || recording}>
          <label>
            About this photo (optional)
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
          <label>
            When it was taken (optional)
            <input
              type="text"
              value={date}
              maxLength={PHOTO_DATE_MAX}
              placeholder="Summer 1962"
              onChange={(event) => {
                setDate(event.target.value)
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
            Album
            <input
              type="text"
              value={album}
              maxLength={PHOTO_ALBUM_MAX}
              list={ALBUM_LIST_ID}
              placeholder={`${MAIN_ALBUM_LABEL} (leave empty)`}
              onChange={(event) => {
                setAlbum(event.target.value)
                setSaved(false)
              }}
            />
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
      <PhotoNarrationEditor
        photo={photo}
        disabled={disabled || busy}
        onRecording={(active) => {
          setRecording(active)
          onRecording(active)
        }}
        onChanged={(narration) => onSaved({ ...photo, narration: narration ?? undefined })}
      />
      {saved && <p role="status">Saved.</p>}
      {error && <p role="alert">{error}</p>}
    </li>
  )
}

export function PhotosTab() {
  const config = useConfigStore((state) => state.config)
  const saveConfig = useConfigStore((state) => state.save)
  const [savingSlideshow, setSavingSlideshow] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<PhotoImportProgress | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [importAlbum, setImportAlbum] = useState('')
  const [showAlbum, setShowAlbum] = useState(ALL_ALBUMS)
  const albums = photoAlbums(photos)
  // Moving the last photo out of the album being shown ends that album: show them all
  // again rather than an empty list that hides the photo just saved.
  const filtered = albums.find((album) => album.name === showAlbum)
  const shownPhotos = filtered?.photos ?? photos

  const changeSlideshow = async (slideshowEnabled: boolean): Promise<void> => {
    setSavingSlideshow(true)
    setError('')
    try {
      await saveConfig({ photos: { slideshowEnabled } })
      setStatus('Slideshow setting saved.')
    } catch {
      setError('Could not save the slideshow setting. Try again.')
    } finally {
      setSavingSlideshow(false)
    }
  }

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
      const result = await window.admin.importPhotos(importAlbum)
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
        Add family photos, with a few words about each and when it was taken. She sees those when
        she taps the photo. Choose which photos to show her and the order they appear.
      </p>
      <p>JPG, PNG and WebP are supported. HEIC works when this Windows device can decode it.</p>
      <label className="photo-slideshow-setting">
        <input
          type="checkbox"
          checked={config?.photos.slideshowEnabled ?? false}
          disabled={!config || savingSlideshow}
          onChange={(event) => void changeSlideshow(event.target.checked)}
        />
        Gentle slideshow: advance photos every 30 seconds
      </label>
      <p>Off keeps each photo still until she taps Back or Next. She can pause the slideshow.</p>
      <datalist id={ALBUM_LIST_ID}>
        {albums
          .filter((album) => album.name)
          .map((album) => (
            <option key={album.name} value={album.name} />
          ))}
      </datalist>
      <p>
        Albums: when her photos are in more than one album, the Photos tile first asks which album
        to look at. Photos with no album are in “{MAIN_ALBUM_LABEL}”.
      </p>
      <label className="photo-import-album">
        Album for new photos
        <input
          type="text"
          value={importAlbum}
          maxLength={PHOTO_ALBUM_MAX}
          list={ALBUM_LIST_ID}
          placeholder={`${MAIN_ALBUM_LABEL} (leave empty)`}
          disabled={importing}
          onChange={(event) => setImportAlbum(event.target.value)}
        />
      </label>
      <div className="photo-actions">
        <button
          disabled={loading || importing || Boolean(recordingId)}
          onClick={() => void importPhotos()}
        >
          {importing ? 'Importing…' : 'Add photos…'}
        </button>
        <button disabled={loading || importing || Boolean(recordingId)} onClick={() => void load()}>
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
      {albums.length > 1 && (
        <label className="photo-album-filter">
          Show
          <select
            aria-label="Show album"
            value={filtered ? showAlbum : ALL_ALBUMS}
            onChange={(event) => setShowAlbum(event.target.value)}
          >
            <option value={ALL_ALBUMS}>All albums ({photos.length})</option>
            {albums.map((album) => (
              <option key={album.name} value={album.name}>
                {album.label} ({album.photos.length})
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="photo-grid" aria-busy={loading || importing}>
        {shownPhotos.map((photo) => (
          <PhotoEditor
            key={photo.id}
            photo={photo}
            disabled={loading || importing || Boolean(recordingId && recordingId !== photo.id)}
            onRecording={(active) => setRecordingId(active ? photo.id : null)}
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
