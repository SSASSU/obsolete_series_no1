# obsolete_series_no1

타이핑 속도에 반응하는 밈 캐릭터 데스크탑 펫.

바탕화면 구석에 항상 떠있고, 타자를 칠수록 캐릭터가 빠르게 움직인다.

---

## 기능

- **타이핑 연동** — 전역 키보드 감지, TPM(분당 타수) 실시간 측정
- **속도 상태 머신** — idle / normal / fast / fever 4단계 자동 전환
- **Fever 이펙트** — 190 TPM 돌파 시 창 흔들림
- **ComboRank** — D~SSS 랭크 + 랭크별 색상 글로우 (A: 금, S: 흰, SS: 주황, SSS: 보라)
- **밈 선택** — Oiia Cat / Nyan Cat (설정창에서 전환)
- **트레이 상주** — ON/OFF 토글, 오늘 최고 TPM 툴팁
- **설정** — 위치(4코너) / 크기 / 투명도 / 시작 시 자동 실행

## 설치

[Releases](../../releases) 에서 MSI 설치 파일 또는 Portable 버전 다운로드.

- **MSI** — 설치형, 시작 프로그램 등록 가능
- **Portable** — 압축 해제 후 바로 실행

## 빌드

```bash
npm install
npm run build
```

## 캐릭터

| 캐릭터 | 설명 |
|--------|------|
| Oiia Cat | 60fps PNG 시퀀스 기반 빙글빙글 회전 |
| Nyan Cat | GIF 런타임 렌더링 + 레인보우 |

---

Made by [SSASSU](https://github.com/SSASSU)
