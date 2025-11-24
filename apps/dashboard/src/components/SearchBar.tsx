import React, { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  onSearch?: (value: string) => void
  debounceMs?: number
}

export default function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  onSearch,
  debounceMs = 300,
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue)
        if (onSearch) {
          onSearch(localValue)
        }
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [localValue, debounceMs, value, onChange, onSearch])

  const handleClear = () => {
    setLocalValue('')
    onChange('')
    if (onSearch) {
      onSearch('')
    }
  }

  return (
    <div className={`relative ${className}`}>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
        <Search size={18} />
      </div>
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 transition-colors"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          aria-label="Clear search"
        >
          <X size={18} />
        </button>
      )}
    </div>
  )
}
