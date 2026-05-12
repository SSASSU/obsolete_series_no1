// TPM 기반 상태 머신
// hysteresis: 진입 임계값과 복귀 임계값을 달리 설정해 경계 깜빡임 방지
// cooldown:   타이핑이 멈춰도 MIN_STATE_MS 동안 현재 상태 유지

export type PetState = 'idle' | 'normal' | 'fast' | 'fever'

interface StateSpec {
  enterAt:  number   // 이 TPM 이상이면 진입
  exitBelow: number  // 이 TPM 미만이면 하위 상태로 복귀
  baseSpeed: number
}

const SPECS: Record<PetState, StateSpec> = {
  idle:   { enterAt: 0,   exitBelow: 0,   baseSpeed: 0.0  },
  normal: { enterAt: 30,  exitBelow: 18,  baseSpeed: 3.0  },
  fast:   { enterAt: 95,  exitBelow: 70,  baseSpeed: 9.0  },
  fever:  { enterAt: 190, exitBelow: 150, baseSpeed: 27.0 },
}

const STATE_ORDER: PetState[] = ['idle', 'normal', 'fast', 'fever']

const MIN_STATE_MS = 800   // 상태 최소 유지 시간 (깜빡임 방지)

export class StateMachine {
  private current: PetState = 'idle'
  private enteredAt = 0
  private onChange: (state: PetState, speed: number) => void

  constructor(onChange: (state: PetState, speed: number) => void) {
    this.onChange = onChange
    this.enteredAt = Date.now()
  }

  get state(): PetState        { return this.current }
  get initialSpeed(): number   { return SPECS[this.current].baseSpeed }

  update(tpm: number): void {
    const now = Date.now()
    const minHeld = now - this.enteredAt >= MIN_STATE_MS

    const next = this.resolve(tpm, minHeld)
    if (next !== this.current) {
      this.current   = next
      this.enteredAt = now
      this.onChange(next, SPECS[next].baseSpeed)
    }
  }

  private resolve(tpm: number, canExit: boolean): PetState {
    // 상위 상태 진입 확인 (높은 순서부터)
    for (let i = STATE_ORDER.length - 1; i > 0; i--) {
      const s = STATE_ORDER[i]
      if (tpm >= SPECS[s].enterAt) return s
    }

    // 현재 상태보다 낮아지는 경우 — MIN_STATE_MS 후에만 허용
    if (!canExit) return this.current

    // 현재 상태 유지 조건 확인 (하위 상태 복귀)
    const idx = STATE_ORDER.indexOf(this.current)
    for (let i = idx; i > 0; i--) {
      const s = STATE_ORDER[i]
      if (tpm >= SPECS[s].exitBelow) return s
    }

    return 'idle'
  }
}
