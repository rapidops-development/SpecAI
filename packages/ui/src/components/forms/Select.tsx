import { ChevronDown } from 'lucide-react'

/** A select with the same line chevron as the filter menus, inset from the right edge like the text. */
export function Select({ className = '', wrapperClassName = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <span className={`relative inline-flex ${wrapperClassName}`}>
      <select {...props} className={`${className} w-full cursor-pointer appearance-none pr-9`} />
      <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" />
    </span>
  )
}
