import type { BeariApi } from '../../preload/index'

declare global {
  interface Window {
    beari: BeariApi
  }
}

export {}
