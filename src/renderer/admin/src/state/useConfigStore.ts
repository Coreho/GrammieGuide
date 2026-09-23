import { create } from 'zustand'
import type { PublicConfig, Config } from '@shared/configSchema'
import type { AdminApi } from '../../../../preload/admin'

declare global {
  interface Window {
    admin: AdminApi
  }
}

interface ConfigStore {
  config: PublicConfig | null
  load: () => Promise<void>
  save: (patch: Partial<Config>) => Promise<void>
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  load: async () => {
    const config = await window.admin.getConfig()
    set({ config })
  },
  save: async (patch) => {
    const config = await window.admin.setConfig(patch)
    set({ config })
  }
}))
