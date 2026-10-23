import { useEffect, useState } from 'react'
import type { Photo } from '@shared/media/photoTypes'

export function TilePhotoPicker({
  photoId,
  onChange,
  label = 'Tile photo'
}: {
  photoId?: string
  onChange: (id: string | undefined) => void
  label?: string
}) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [status, setStatus] = useState('Loading photos…')
  useEffect(() => {
    let live = true
    let request = 0
    const refresh = (): void => {
      const sequence = ++request
      window.admin.listPhotos().then(
        (result) => {
          if (!live || sequence !== request) return
          setPhotos(result)
          setStatus(result.length ? '' : 'Add photos in the Photos tab first.')
        },
        () => {
          if (!live || sequence !== request) return
          setPhotos([])
          setStatus('Could not load photos. Try opening this panel again.')
        }
      )
    }
    refresh()
    const off = window.admin.onPhotosChanged(refresh)
    return () => {
      live = false
      off()
    }
  }, [])

  return (
    <fieldset>
      <legend>{label}</legend>
      <p>Choose a family photo in place of the icon. The icon stays as a fallback.</p>
      {status && <p role="status">{status}</p>}
      {photoId && !status && !photos.some((photo) => photo.id === photoId) && (
        <p>This photo is no longer in the library. The icon will be shown instead.</p>
      )}
      <div
        role="group"
        aria-label="Choose a tile photo"
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          maxHeight: 300,
          overflowY: 'auto',
          padding: 4
        }}
      >
        {photos.map((photo, index) => (
          <PhotoChoice
            key={photo.id}
            photo={photo}
            name={photo.caption || `Photo ${index + 1}`}
            selected={photoId === photo.id}
            onSelect={() => onChange(photo.id)}
          />
        ))}
      </div>
      <button type="button" disabled={!photoId} onClick={() => onChange(undefined)}>
        Use icon instead
      </button>
    </fieldset>
  )
}

function PhotoChoice({
  photo,
  name,
  selected,
  onSelect
}: {
  photo: Photo
  name: string
  selected: boolean
  onSelect: () => void
}) {
  const [failed, setFailed] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Use photo: ${name}`}
      aria-pressed={selected}
      disabled={failed}
      onClick={onSelect}
      style={{ width: 120, padding: 8, outline: selected ? '3px solid #267457' : undefined }}
    >
      {failed ? (
        <span>Photo unavailable</span>
      ) : (
        <img
          src={photo.thumbnailUrl}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: 100, height: 80, objectFit: 'cover', borderRadius: 12 }}
        />
      )}
      <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{name}</span>
    </button>
  )
}
