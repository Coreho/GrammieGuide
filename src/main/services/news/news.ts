import { getConfig } from '../../config/store'
import { logReliabilityEvent } from '../reliability/reliabilityLog'
import { createNewsService } from './newsService'
import { createNewsPreviewService } from './newsPreviewService'
import { captureNewsPreview } from './captureNewsPreview'

export const newsPreviews = createNewsPreviewService({
  getTile: (id) => getConfig().tiles.find((tile) => tile.id === id),
  capture: captureNewsPreview
})

export const newsService = createNewsService({
  getTile: (id) => getConfig().tiles.find((tile) => tile.id === id),
  log: (op, detail) => {
    logReliabilityEvent({ op, ok: false, detail })
  }
})
