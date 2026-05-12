export type AnimationType = 'spin' | 'run'
export type WindowMode = 'corner' | 'fixed'  // fixed: meme.windowWidth/Height 사용, 화면 하단 중앙

export interface MemeConfig {
  id: string
  name: string
  animationType: AnimationType
  windowMode: WindowMode
  imageUrl: string
  videoUrl?: string   // MP4/WebM — 있으면 video 요소로 재생 (GIF보다 부드러움)
  windowWidth?: number
  windowHeight?: number
  localFile?: string  // assets/ 기준 상대 경로, 있으면 imageUrl 무시
  stateAnimations?: { idle?: string; normal?: string; fast?: string; fever?: string }
}

export const MEMES: MemeConfig[] = [
  {
    id: 'oiia-cat',
    name: 'Oiia Cat (oiia)',
    animationType: 'spin',
    windowMode: 'corner',
    imageUrl: 'https://media.tenor.com/ue7Q8JmP_0MAAAAd/oiia-oiiaoiia.gif',
    localFile: 'oiia-cat.gif',
    stateAnimations: {
      idle:   'idle.gif',
      normal: 'normal.gif',
      fast:   'fast.gif',
      fever:  'fever.gif',
    }
  },
  {
    id: 'nyan-cat',
    name: 'Nyan Cat (냥켓)',
    animationType: 'run',
    windowMode: 'corner',
    imageUrl: 'https://media.tenor.com/zBc1XhcbTSoAAAAd/nyan-cat-rainbow.gif',
    localFile: 'cat-space.gif'
  }
]
