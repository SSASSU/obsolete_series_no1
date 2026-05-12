import Store from 'electron-store'

interface Settings {
  memeId: string
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  size: number
  opacity: number
  autoStart: boolean
  enabled: boolean
  hotkey: string
}

export const store = new Store<Settings>({
  defaults: {
    memeId: 'nyan-cat',
    position: 'bottom-right',
    size: 96,
    opacity: 0.9,
    autoStart: false,
    enabled: true,
    hotkey: ''
  }
})
