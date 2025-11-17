import React from 'react'
import { X } from 'lucide-react'

interface FilterChip {
  id: string
  label: string
  value: string
  type: 'category' | 'tag' | 'owner'
}

interface FilterChipsProps {
  filters: FilterChip[]
  onRemove: (filterId: string) => void
  className?: string
}

export default function FilterChips({
  filters,
  onRemove,
  className = '',
}: FilterChipsProps) {
  if (filters.length === 0) {
    return null
  }

  const getChipColor = (type: string) => {
    switch (type) {
      case 'category':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'tag':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'owner':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {filters.map((filter) => (
        <div
          key={filter.id}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getChipColor(
            filter.type
          )}`}
        >
          <span className="capitalize">{filter.type}:</span>
          <span>{filter.label}</span>
          <button
            onClick={() => onRemove(filter.id)}
            className="ml-1 hover:opacity-70 transition-opacity"
            aria-label={`Remove ${filter.type} filter: ${filter.label}`}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
