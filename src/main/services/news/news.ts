import { getConfig } from '../../config/store'
import { logReliabilityEvent } from '../reliability/reliabilityLog'
import { createNewsService } from './newsService'

export const newsService = createNewsService({
  getTile: (id) => getConfig().tiles.find((tile) => tile.id === id),
  log: (op, detail) => {
    logReliabilityEvent({ op, ok: false, detail })
  }
})
