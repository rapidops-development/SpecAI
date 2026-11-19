import { useEffect, useState } from 'react'
import { subscribeAnnouncements } from './SaveFeedback.tsx'

export function Announcer() {
  const [messages, setMessages] = useState<string[]>([])
  useEffect(() => subscribeAnnouncements(setMessages), [])
  useEffect(() => {
    if (messages.length === 0) return
    const timer = setTimeout(() => setMessages([]), 6000)
    return () => clearTimeout(timer)
  }, [messages])
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-20 max-w-sm space-y-2">
      {messages.map((m, i) => (
        <p key={i} className="border-rule bg-surface pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg">{m}</p>
      ))}
    </div>
  )
}
