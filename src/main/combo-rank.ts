export const RANKS = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'] as const
export type Rank = typeof RANKS[number]

// TPM 기준 랭크 진입 임계값 (실측: 막 눌러도 ~200 TPM)
const RANK_ENTER_WPM: Record<Rank, number> = {
  D: 0, C: 20, B: 50, A: 90, S: 130, SS: 165, SSS: 195
}

// 랭크 하락 유예 시간 — DMC 콤보 유지 감각
const GRACE_MS = 1500

export class ComboRank {
  private rank: Rank = 'D'
  private dropTarget: Rank | null = null
  private dropTimer: ReturnType<typeof setTimeout> | null = null
  private onChange: (rank: Rank) => void

  constructor(onChange: (rank: Rank) => void) {
    this.onChange = onChange
  }

  get current(): Rank { return this.rank }

  update(wpm: number): void {
    let target: Rank = 'D'
    for (const r of RANKS) {
      if (wpm >= RANK_ENTER_WPM[r]) target = r
    }

    const targetIdx  = RANKS.indexOf(target)
    const currentIdx = RANKS.indexOf(this.rank)

    if (targetIdx > currentIdx) {
      this.cancelDrop()
      this.rank = target
      this.onChange(this.rank)
    } else if (targetIdx < currentIdx) {
      if (this.dropTarget !== target) {
        this.cancelDrop()
        this.dropTarget = target
        this.dropTimer = setTimeout(() => {
          this.rank      = target!
          this.dropTarget = null
          this.dropTimer  = null
          this.onChange(this.rank)
        }, GRACE_MS)
      }
    } else {
      this.cancelDrop()
    }
  }

  private cancelDrop(): void {
    if (this.dropTimer) { clearTimeout(this.dropTimer); this.dropTimer = null }
    this.dropTarget = null
  }
}
