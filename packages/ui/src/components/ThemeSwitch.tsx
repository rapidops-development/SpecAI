import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const key = 'specai-theme'

function stored(): Theme {
  try {
    const value = localStorage.getItem(key)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Light, dark, or follow the system. The choice is remembered in this browser. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(stored)
  const choose = (next: Theme) => {
    setTheme(next)
    if (next === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = next
    try {
      if (next === 'system') localStorage.removeItem(key)
      else localStorage.setItem(key, next)
    } catch {
      // Storage can be unavailable, such as in a private window; the choice then lasts until reload.
    }
  }
  const options: [Theme, string, typeof Sun][] = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]]
  return (
    <fieldset className="border-rule inline-flex rounded-md border p-0.5 text-xs">
      <legend className="sr-only">Theme</legend>
      {options.map(([value, label, Icon]) => (
        <label
          key={value}
          className={`inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)] ${
            theme === value ? 'bg-accent-soft text-ink font-medium' : 'text-muted hover:text-ink'
          }`}
        >
          <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => choose(value)} className="sr-only" />
          <Icon size={13} strokeWidth={1.75} aria-hidden />
          {label}
        </label>
      ))}
    </fieldset>
  )
}
