import { useState } from 'react'
import { applyTheme, readTheme, saveTheme } from './themeStore.js'
import './ThemeSection.css'

function ThemeSection() {
  const [theme, setTheme] = useState(() => readTheme().theme)
  const [notice, setNotice] = useState(null)

  function selectTheme(nextTheme) {
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
  }

  return (
    <section className="theme-settings settings-panel" aria-labelledby="theme-settings-title">
      <h2 id="theme-settings-title">Appearance</h2>
      <p>Choose light or dark mode. This preference is saved separately from your transactions.</p>

      <fieldset className="type-toggle theme-type-toggle">
        <legend className="visually-hidden">Theme</legend>
        <label>
          <input
            type="radio"
            name="app-theme"
            value="light"
            checked={theme === 'light'}
            onChange={() => selectTheme('light')}
          />
          Light
        </label>
        <label>
          <input
            type="radio"
            name="app-theme"
            value="dark"
            checked={theme === 'dark'}
            onChange={() => selectTheme('dark')}
          />
          Dark
        </label>
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
