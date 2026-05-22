# obsolete_series_no1

> A desktop meme pet that reacts to how fast you type.
> 타이핑하면 밈이 반응하는 데스크탑 펫.

[![Release](https://img.shields.io/github/v/release/SSASSU/obsolete_series_no1?style=flat-square)](https://github.com/SSASSU/obsolete_series_no1/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey?style=flat-square)](#download)

<!-- TODO: replace placeholder with a real demo gif at docs/demo.gif -->
<!-- <p align="center"><img src="docs/demo.gif" width="640" alt="demo"></p> -->

A tiny always-on-top meme (Nyan Cat, Oiia Cat, ...) sits in your screen corner and changes its animation based on your typing speed. The faster you type, the more it freaks out. A DMC-style rank meter (D → C → B → A → S → SS → **SSS**) climbs and falls as you go.

화면 구석에 작은 밈이 떠 있고, 타이핑 속도에 따라 애니메이션이 바뀐다. 빨리 칠수록 격렬해지고, DMC 식 랭크 (D → C → B → A → S → SS → **SSS**) 게이지가 같이 오르내린다.

---

## Features

- ⌨️ **Global typing tracker** — measures TPM (taps per minute) in real time
- 🐈 **Stateful animations** — idle / normal / fast / fever transitions per character
- 🏅 **DMC-style rank meter** — D → C → B → A → S → SS → SSS with a 1.5s grace period on drops
- 🎨 **Rank-colored glow** — A: gold · S: white · SS: orange · SSS: purple
- 💥 **Fever effect** — window shake on 190+ TPM
- 🪟 **Frameless overlay** — transparent, always-on-top, click-through-friendly
- 🍱 **Tray app** — toggle on/off, today's max TPM in tooltip
- ⚙️ **Configurable** — corner position, size, opacity, launch-on-startup
- 🖥️ **Native installer** — Windows MSI, macOS DMG (x64 + arm64)

## Download

Grab the latest installer from the [**Releases page**](https://github.com/SSASSU/obsolete_series_no1/releases/latest):

- **Windows** — `obsolete_series_no1 X.X.X.msi`
- **macOS** — `obsolete_series_no1-X.X.X.dmg`

> macOS builds are unsigned, so you may need to right-click → Open the first time.

## Characters

| Character | Notes |
|-----------|-------|
| Oiia Cat  | 60 fps PNG sequence, smooth spin |
| Nyan Cat  | Runtime GIF rendering with rainbow trail |

## How it works

1. A native keyboard hook ([`uiohook-napi`](https://github.com/SnosMe/uiohook-napi)) listens to keystrokes globally.
2. Recent keystrokes are converted to typing speed (TPM/WPM).
3. The current rank is recalculated each tick — jumps up are instant, drops have a 1.5s grace window so a brief pause won't kill your combo.
4. Each meme has per-state animations that swap as you cross thresholds.

WPM thresholds: D `0` · C `20` · B `50` · A `90` · S `140` · SS `180` · SSS `198`

## Build from source

```bash
git clone https://github.com/SSASSU/obsolete_series_no1.git
cd obsolete_series_no1
npm install        # rebuilds uiohook-napi for Electron
npm run dev        # run in dev mode
npm run dist:win   # build Windows MSI
npm run dist:mac   # build macOS DMG
```

Requires Node 20+.

## Tech stack

Electron · TypeScript · electron-vite · uiohook-napi · gifuct-js

## License

MIT © obsolete-series. See [LICENSE](LICENSE).

---

## 한국어 / Korean

### 이게 뭔가요

타이핑 속도에 반응하는 데스크탑 밈 펫이에요. 화면 구석에 떠 있는 작은 캐릭터(Nyan Cat, Oiia Cat 등)가 키보드 입력에 맞춰 애니메이션을 바꿔요. DMC 처럼 D부터 SSS까지 랭크가 오르내립니다.

### 기능

- **타이핑 연동** — 전역 키보드 감지, TPM(분당 타수) 실시간 측정
- **속도 상태 머신** — idle / normal / fast / fever 4단계 자동 전환
- **Fever 이펙트** — 190 TPM 돌파 시 창 흔들림
- **랭크 시스템** — D~SSS, 랭크별 색상 글로우 (A: 금, S: 흰, SS: 주황, SSS: 보라)
- **밈 선택** — Oiia Cat / Nyan Cat (설정창에서 전환)
- **트레이 상주** — ON/OFF 토글, 오늘 최고 TPM 툴팁
- **설정** — 위치(4코너) / 크기 / 투명도 / 시작 시 자동 실행

### 다운로드

[릴리즈 페이지](https://github.com/SSASSU/obsolete_series_no1/releases/latest)에서 OS에 맞는 설치 파일을 받으세요.

- **Windows**: MSI 인스톨러
- **macOS**: DMG (서명 안 되어 있으니 처음 실행 시 우클릭 → 열기)

### 개발

```bash
git clone https://github.com/SSASSU/obsolete_series_no1.git
cd obsolete_series_no1
npm install
npm run dev
```

### 기여

버그/아이디어 환영. [Issues](https://github.com/SSASSU/obsolete_series_no1/issues)에 자유롭게 올려주세요.

---

Made by [SSASSU](https://github.com/SSASSU)
