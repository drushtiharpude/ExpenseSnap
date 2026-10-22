import { useState } from 'react'
import { syncThemePreferenceToCloud } from './themeCloud.js'
import { applyTheme, readTheme, saveTheme } from './themeStore.js'
import './ThemeSection.css'

function ThemeSection() {
  const [theme, setTheme] = useState(() => readTheme().theme)
  const [notice, setNotice] = useState(null)

  async function selectTheme(nextTheme) {
    setNotice(null)
    const saved = saveTheme(nextTheme)
    if (!saved.ok) {
      applyTheme(theme)
      setNotice(
        'Theme preference could not be saved. Your previous appearance was restored for this session.',
      )
      setTheme(readTheme().theme)
      return
    }
    setTheme(saved.theme)
    const cloud = await syncThemePreferenceToCloud(saved.theme)
    if (!cloud.ok) {
      setNotice(
        'Theme saved on this device. Cloud appearance preference could not be updated right now.',
      )
    }
  }

  return (
    <section className="theme-settings settings-panel" aria-labelledby="theme-settings-title">
      <header className="section-head section-head--in-panel">
        <h2 id="theme-settings-title" className="section-head__title">
          Appearance
        </h2>
        <p className="section-head__sub">
          Choose light or dark mode. This preference is saved separately from your transactions.
        </p>
      </header>

      <fieldset className="theme-choice">
        <legend className="theme-choice-legend">Color theme</legend>
        <div className="theme-choice-grid" role="radiogroup" aria-label="Color theme">
          <label className={`theme-choice-card${theme === 'light' ? ' theme-choice-card--selected' : ''}`}>
            <input
              type="radio"
              name="app-theme"
              value="light"
              checked={theme === 'light'}
              onChange={() => selectTheme('light')}
            />
            <span className="theme-choice-preview theme-choice-preview--light" aria-hidden="true">
              <span className="theme-choice-preview-bar" />
              <span className="theme-choice-preview-line" />
              <span className="theme-choice-preview-line theme-choice-preview-line--short" />
            </span>
            <span className="theme-choice-copy">
              <span className="theme-choice-name">Light</span>
              <span className="theme-choice-desc">Bright backgrounds for daytime use</span>
            </span>
          </label>
          <label className={`theme-choice-card${theme === 'dark' ? ' theme-choice-card--selected' : ''}`}>
            <input
              type="radio"
              name="app-theme"
              value="dark"
              checked={theme === 'dark'}
              onChange={() => selectTheme('dark')}
            />
            <span className="theme-choice-preview theme-choice-preview--dark" aria-hidden="true">
              <span className="theme-choice-preview-bar" />
              <span className="theme-choice-preview-line" />
              <span className="theme-choice-preview-line theme-choice-preview-line--short" />
            </span>
            <span className="theme-choice-copy">
              <span className="theme-choice-name">Dark</span>
              <span className="theme-choice-desc">Reduced glare for low-light environments</span>
            </span>
          </label>
        </div>
      </fieldset>

      {notice && (
        <div className="theme-notice alert--warning" role="status">
          <p>{notice}</p>
        </div>
      )}
    </section>
  )
}

export default ThemeSection
