import ReactDOM from 'react-dom/client'
import type { JSX } from 'react'
import { DEFAULT_OUTFIT } from '@shared/types'
import { Beari } from '../character/Beari'
import { restPose } from '../character/engine/pose'
import type { Pose } from '../character/engine/pose'

/** Static character sheet for visual development — no animation loop. */

function posed(mutate: (p: Pose) => void): Pose {
  const p = restPose(100)
  mutate(p)
  return p
}

const VARIANTS: { label: string; pose: Pose }[] = [
  { label: 'Rest', pose: posed(() => {}) },
  {
    label: 'Happy',
    pose: posed((p) => {
      p.emotion = 'happy'
      p.mouth = 'openSmile'
      p.browRaise = 0.5
    })
  },
  {
    label: 'Thinking',
    pose: posed((p) => {
      p.emotion = 'thinking'
      p.mouth = 'flat'
      p.armR = -128
      p.lookX = 0.35
      p.lookY = -0.7
      p.headTilt = -5
    })
  },
  {
    label: 'Excited',
    pose: posed((p) => {
      p.emotion = 'excited'
      p.mouth = 'openSmile'
      p.browRaise = 1
      p.armL = 150
      p.armR = -150
    })
  },
  {
    label: 'Confused',
    pose: posed((p) => {
      p.emotion = 'confused'
      p.mouth = 'o'
      p.browRaise = 0.7
      p.headTilt = 8
    })
  },
  {
    label: 'Sad',
    pose: posed((p) => {
      p.emotion = 'sad'
      p.mouth = 'sad'
      p.browRaise = -0.8
      p.lookY = 0.5
    })
  },
  {
    label: 'Wave',
    pose: posed((p) => {
      p.emotion = 'happy'
      p.mouth = 'openSmile'
      p.armR = -160
    })
  },
  {
    label: 'Walk',
    pose: posed((p) => {
      p.legPhase = 1.2
      p.legSwing = 1
      p.lift = 4
      p.bodyTilt = 2
      p.armL = 14
      p.armR = 10
      p.hairSway = -8
      p.scarfSway = -10
    })
  },
  {
    label: 'Sleep',
    pose: posed((p) => {
      p.sitting = true
      p.eyeOpen = 0
      p.emotion = 'sleepy'
      p.mouth = 'sleepy'
      p.headTilt = 14
      p.bodyTilt = 4
    })
  },
  {
    label: 'Blink mid',
    pose: posed((p) => {
      p.eyeOpen = 0.4
    })
  },
  {
    label: 'Look left',
    pose: posed((p) => {
      p.lookX = -1
      p.lookY = 0.2
    })
  },
  {
    label: 'Facing left',
    pose: posed((p) => {
      p.facing = -1
    })
  }
]

const BLUE = { ...DEFAULT_OUTFIT, dress: '#7EA8E8', dressTrim: '#5E86C8', hairAccessory: '#5E86C8' }

function Sheet(): JSX.Element {
  return (
    <div style={{ fontFamily: 'Segoe UI', background: '#F3ECFB', minHeight: '100vh', padding: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {VARIANTS.map((v) => (
          <figure key={v.label} style={{ margin: 0, textAlign: 'center' }}>
            <div style={{ width: 150, height: 195, background: 'white', borderRadius: 10 }}>
              <Beari pose={v.pose} outfit={DEFAULT_OUTFIT} />
            </div>
            <figcaption style={{ fontSize: 12, color: '#5b4a78' }}>{v.label}</figcaption>
          </figure>
        ))}
        <figure style={{ margin: 0, textAlign: 'center' }}>
          <div style={{ width: 150, height: 195, background: 'white', borderRadius: 10 }}>
            <Beari pose={VARIANTS[1].pose} outfit={BLUE} />
          </div>
          <figcaption style={{ fontSize: 12, color: '#5b4a78' }}>Blue outfit</figcaption>
        </figure>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Sheet />)
