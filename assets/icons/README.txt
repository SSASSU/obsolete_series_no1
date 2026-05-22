Meme Pet — Peeking 아이콘 셋

📁 app/         — 어플리케이션 아이콘 (배경 포함, 둥근 모서리)
   peeking-16.png  ~  peeking-1024.png

📁 tray/        — 트레이 아이콘 (투명 배경, 단색)
   tray-dark-*.png   — 라이트 트레이용 (어두운 색)
   tray-light-*.png  — 다크 트레이용 (흰색)

📁 source/      — 원본 SVG (필요시 편집/재익스포트)

플랫폼별 가이드
─────────────────
• macOS (.icns):     16, 32, 64, 128, 256, 512, 1024
• Windows (.ico):    16, 32, 48, 64, 128, 256
• Linux (PNG):       16, 24, 32, 48, 64, 128, 256, 512
• Windows Tray:      16, 20, 24, 32 (HiDPI 48)
• macOS MenuBar:     18, 36 (@2x), 54 (@3x) — tray-dark 사용

ICO/ICNS로 묶어야 한다면:
- Windows: 이 PNG들을 합쳐 icoconverter / png2ico 등으로 .ico 빌드
- macOS: iconutil 또는 image2icon 사용
