interface API {
  getSettings: () => Promise<Record<string, unknown>>
  getMemes: () => Promise<{ id: string; name: string }[]>
  setSetting: (key: string, value: unknown) => void
  closeWindow: () => void
}
declare const window: Window & { electronAPI: API }

async function init(): Promise<void> {
  const [settings, memes] = await Promise.all([
    window.electronAPI.getSettings(),
    window.electronAPI.getMemes()
  ])

  // 밈 목록
  const memeSelect = document.getElementById('meme-select') as HTMLSelectElement
  memes.forEach((m) => {
    const opt = document.createElement('option')
    opt.value = m.id
    opt.textContent = m.name
    if (m.id === settings['memeId']) opt.selected = true
    memeSelect.appendChild(opt)
  })
  memeSelect.addEventListener('change', () =>
    window.electronAPI.setSetting('memeId', memeSelect.value)
  )

  // 토글
  const toggleEnabled = document.getElementById('toggle-enabled') as HTMLInputElement
  toggleEnabled.checked = settings['enabled'] as boolean
  toggleEnabled.addEventListener('change', () =>
    window.electronAPI.setSetting('enabled', toggleEnabled.checked)
  )

  const toggleAutostart = document.getElementById('toggle-autostart') as HTMLInputElement
  toggleAutostart.checked = settings['autoStart'] as boolean
  toggleAutostart.addEventListener('change', () =>
    window.electronAPI.setSetting('autoStart', toggleAutostart.checked)
  )

  // 위치 버튼
  const posBtns = document.querySelectorAll<HTMLButtonElement>('.pos-btn')
  posBtns.forEach((btn) => {
    if (btn.dataset['pos'] === settings['position']) btn.classList.add('active')
    btn.addEventListener('click', () => {
      posBtns.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      window.electronAPI.setSetting('position', btn.dataset['pos'])
    })
  })

  // 크기 슬라이더
  const sizeRange = document.getElementById('size-range') as HTMLInputElement
  const sizeVal = document.getElementById('size-val') as HTMLSpanElement
  sizeRange.value = String(settings['size'])
  sizeVal.textContent = String(settings['size'])
  sizeRange.addEventListener('input', () => {
    sizeVal.textContent = sizeRange.value
    window.electronAPI.setSetting('size', Number(sizeRange.value))
  })

  // 투명도 슬라이더
  const opacityRange = document.getElementById('opacity-range') as HTMLInputElement
  const opacityVal = document.getElementById('opacity-val') as HTMLSpanElement
  const pct = Math.round((settings['opacity'] as number) * 100)
  opacityRange.value = String(pct)
  opacityVal.textContent = String(pct)
  opacityRange.addEventListener('input', () => {
    opacityVal.textContent = opacityRange.value
    window.electronAPI.setSetting('opacity', Number(opacityRange.value) / 100)
  })

  // 닫기
  document.getElementById('close-btn')!.addEventListener('click', () => {
    window.electronAPI.closeWindow()
    window.close()
  })
}

init()
