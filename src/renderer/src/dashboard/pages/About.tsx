import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { UpdateCard } from '../UpdateCard'

export function AboutPage(): JSX.Element {
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.beari.app.info().then((i) => setVersion(i.version))
  }, [])

  return (
    <div className="page">
      <div className="card about-card">
        <img className="about-art" src="./frames/poster.webp" alt="BEARi" />
        <div>
          <div className="about-title">
            BEAR<i>i</i>
          </div>
          <p className="muted" style={{ marginTop: 2 }}>
            Beloved Emotional Artificial Reasoning Intelligence
          </p>
        </div>
        <p>
          BEARi is a living desktop companion — she walks, breathes, dreams, remembers and learns, right on your
          desktop. She is not a chat window. <strong>She is the app.</strong>
        </p>
        <div className="about-chips">
          <span className="pill">v{version || '…'}</span>
          <span className="pill">Electron + React</span>
          <span className="pill">Hand-drawn animation</span>
          <span className="pill">Local-first memory</span>
        </div>
        <p className="about-quote">“I may be a tiny AI, but I care about you a lot!” 💜</p>
      </div>

      <UpdateCard />
    </div>
  )
}
