import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { AppSettings, OutfitColors, OutfitPreset, OutfitStyle, RenderMode } from '@shared/types'
import { DEFAULT_OUTFIT } from '@shared/types'
import { Beari } from '../../character/Beari'
import { restPose } from '../../character/engine/pose'
import { outfitFromColor } from '../../lib/color'
import { Icon } from '../Icon'

const PRESETS: OutfitPreset[] = [
  { id: 'classic', name: 'Classic Lavender', colors: DEFAULT_OUTFIT },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    colors: { ...DEFAULT_OUTFIT, dress: '#7EA8E8', dressTrim: '#5E86C8', scarf: '#F4F8FF', hairAccessory: '#5E86C8' }
  },
  {
    id: 'rose',
    name: 'Rose Petal',
    colors: { ...DEFAULT_OUTFIT, dress: '#F2A9C4', dressTrim: '#E087AB', scarf: '#FFF6FA', hairAccessory: '#E087AB' }
  },
  {
    id: 'mint',
    name: 'Fresh Mint',
    colors: { ...DEFAULT_OUTFIT, dress: '#9FDCC5', dressTrim: '#78C4A8', scarf: '#F3FFF9', hairAccessory: '#78C4A8' }
  },
  {
    id: 'midnight',
    name: 'Midnight Dev',
    colors: { ...DEFAULT_OUTFIT, dress: '#4A3E63', dressTrim: '#372E4C', scarf: '#EFEAFB', hairAccessory: '#B08DF0' }
  },
  {
    id: 'sunshine',
    name: 'Festival Sunshine',
    colors: { ...DEFAULT_OUTFIT, dress: '#F5C15C', dressTrim: '#DFA032', scarf: '#FFFBEF', hairAccessory: '#DFA032' }
  }
]

const STYLES: { id: OutfitStyle; name: string; desc: string }[] = [
  { id: 'kurta', name: 'Kurta', desc: 'Her signature lavender kurta with the white dupatta — her painted original.' },
  { id: 'frock', name: 'Frock', desc: 'A sweet flared dress with a collar and a sash bow.' },
  { id: 'croptop', name: 'Crop top & jeans', desc: 'Casual crop top with high-waist jeans and sneakers.' },
  { id: 'hoodie', name: 'Hoodie', desc: 'Cozy oversized hoodie with a kangaroo pocket.' }
]

const PART_LABELS: Record<keyof OutfitColors, string> = {
  dress: 'Kurta',
  dressTrim: 'Kurta trim',
  scarf: 'Dupatta',
  leggings: 'Leggings',
  shoes: 'Sandals',
  glasses: 'Glasses',
  hairAccessory: 'Hair clip'
}

const MODES: { id: RenderMode; name: string; desc: string; thumb: string | null; badge?: string }[] = [
  {
    id: 'frames',
    name: 'BEARi — hand-drawn animation',
    desc: 'Every pose is a complete drawing of her, played as real animation: she walks with a proper side-on stride, sits down to read, sips her coffee, jumps to celebrate and curls up with her teddy. Nothing is cut into layers, so there are no seams, no gaps and no double outlines.',
    thumb: './frames/poster.webp',
    badge: 'Recommended'
  },
  {
    id: 'vector',
    name: 'BEARi — painted & animated',
    desc: 'Her painted artwork deformed by a real skeleton — arms, cloth and hair bend and flow instead of pivoting as pieces, so there are no seams. She waves, sits down to read, sips coffee, walks with real steps, blinks and talks.',
    thumb: null
  },
  {
    id: 'model3d',
    name: '3D BEARi',
    desc: 'A real 3D model of her — lit with a true shadow, turns in depth, same actions. Experimental.',
    thumb: './puppet/beari-front.png'
  },
  {
    id: 'sprite',
    name: 'Artwork sprite',
    desc: 'Pure painted frames from her reference sheets, cross-fading between poses.',
    thumb: './sprites/pose-reading.png'
  },
  {
    id: 'puppet',
    name: 'Layered art rig',
    desc: 'Her painted artwork cut into moving layers — experimental.',
    thumb: './puppet/beari-front.png'
  }
]

export function CharacterPage({
  settings,
  patch
}: {
  settings: AppSettings
  patch: (p: Partial<AppSettings>) => void
}): JSX.Element {
  const [quickColor, setQuickColor] = useState('')
  const previewPose = useMemo(() => {
    const p = restPose(100)
    p.emotion = 'happy'
    p.mouth = 'openSmile'
    return p
  }, [])

  const setOutfit = (outfit: OutfitColors): void => patch({ outfit })

  const applyQuickColor = (): void => {
    const next = outfitFromColor(quickColor, settings.outfit)
    if (next) {
      setOutfit(next)
      setQuickColor('')
    }
  }

  const previewArt =
    settings.renderMode === 'frames'
      ? './frames/poster.webp'
      : settings.renderMode === 'sprite'
        ? './sprites/pose-standing.png'
        : './puppet/beari-front.png'

  // Her animation frames were drawn in her kurta, so that is what she wears in
  // hand-drawn mode. The other outfits belong to the painted rig.
  const drawnMode = settings.renderMode === 'frames'

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Character</h1>
          <p className="sub">How BEARi looks and how big she is on your desktop.</p>
        </div>
      </div>

      <div className="split">
        <div className="card preview-card">
          <div className="preview-stage">
            {settings.renderMode === 'vector' ? (
              <div className="vector-wrap">
                <Beari pose={previewPose} outfit={settings.outfit} style={settings.outfitStyle} />
              </div>
            ) : (
              <img src={previewArt} alt="BEARi preview" />
            )}
          </div>
          <label className="field">
            <span>Size on desktop — {Math.round(settings.characterScale * 100)}%</span>
            <input
              type="range"
              min="0.6"
              max="1.6"
              step="0.05"
              value={settings.characterScale}
              onChange={(e) => patch({ characterScale: Number(e.target.value) })}
            />
          </label>
          <p className="tiny">
            She stands on your taskbar, walks the full width of the screen, and never blocks your clicks.
          </p>
        </div>

        <div className="stack">
          <div className="card">
            <h2>
              <Icon name="wand" size={16} />
              How she's drawn
            </h2>
            <div className="mode-list">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  className={`mode-card ${settings.renderMode === mode.id ? 'on' : ''}`}
                  onClick={() => patch({ renderMode: mode.id })}
                >
                  <span className="mode-thumb">
                    {mode.thumb ? (
                      <img src={mode.thumb} alt="" />
                    ) : (
                      <span style={{ width: 46, height: 56, display: 'block' }}>
                        <Beari pose={previewPose} outfit={settings.outfit} />
                      </span>
                    )}
                  </span>
                  <span className="mode-body">
                    <span className="mode-name">
                      {mode.name}
                      {mode.badge && <span className="pill">{mode.badge}</span>}
                    </span>
                    <span className="mode-desc">{mode.desc}</span>
                  </span>
                  <span className="mode-radio" />
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>
              <Icon name="palette" size={16} />
              Outfit studio
            </h2>
            <div className="stack" style={{ gap: 18 }}>
              <div className="field">
                <span>What she wears</span>
                <div className="style-grid">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      className={`style-card ${settings.outfitStyle === s.id ? 'on' : ''} ${
                        drawnMode && s.id !== 'kurta' ? 'muted' : ''
                      }`}
                      onClick={() => patch({ outfitStyle: s.id })}
                      title={s.desc}
                    >
                      <span className="style-thumb">
                        <Beari pose={previewPose} outfit={settings.outfit} style={s.id} />
                      </span>
                      <span className="style-name">{s.name}</span>
                    </button>
                  ))}
                </div>
                <p className="tiny">
                  {drawnMode
                    ? 'Her hand-drawn animation was drawn in her kurta, so that is what she wears on the desktop right now. Switch to “painted & animated” above to use the other three.'
                    : 'You can also just tell her — “wear your hoodie”, “put on a frock”.'}
                </p>
              </div>

              <div className="field">
                <span>Quick outfit — type any color: “blue”, “mint”, “#ff8800”…</span>
                <div className="row">
                  <input
                    className="input grow"
                    value={quickColor}
                    placeholder="e.g. sky blue"
                    onChange={(e) => setQuickColor(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyQuickColor()}
                  />
                  <button className="btn primary" onClick={applyQuickColor}>
                    Dress up
                  </button>
                </div>
              </div>

              <div className="field">
                <span>Presets</span>
                <div className="preset-grid">
                  {PRESETS.map((preset) => (
                    <button key={preset.id} className="preset" onClick={() => setOutfit(preset.colors)}>
                      <span className="preset-dot" style={{ background: preset.colors.dress }} />
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>Fine-tune each piece</span>
                <div className="swatch-grid">
                  {(Object.keys(PART_LABELS) as (keyof OutfitColors)[]).map((part) => (
                    <label key={part} className="swatch">
                      <input
                        type="color"
                        value={settings.outfit[part]}
                        onChange={(e) => setOutfit({ ...settings.outfit, [part]: e.target.value })}
                      />
                      <span>{PART_LABELS[part]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <p className="tiny">
                Outfit colours apply to her <strong>painted &amp; animated</strong> look and to chat commands like “wear
                something blue”. Her hand-drawn animation keeps the colours she was drawn in.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
