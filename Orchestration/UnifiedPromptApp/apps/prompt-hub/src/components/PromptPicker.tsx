import { useEffect, useMemo, useState } from 'react'
import { Search, X, BookOpen, ChevronRight } from 'lucide-react'
import type { PromptItem } from '../types/prompts'
import { fetchPromptLibrary } from '../services/promptStore'

export interface PromptPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (prompt: PromptItem) => void
  selectedIds?: string[]
  title?: string
}

export function PromptPicker({
  isOpen,
  onClose,
  onSelect,
  selectedIds = [],
  title = 'Select Prompt from Library'
}: PromptPickerProps) {
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadPrompts()
    }
  }, [isOpen])

  async function loadPrompts() {
    setLoading(true)
    const data = await fetchPromptLibrary()
    setPrompts(data)
    setLoading(false)
  }

  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    prompts.forEach((p) => {
      if (p.category) cats.add(p.category)
    })
    return Array.from(cats).sort()
  }, [prompts])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return prompts.filter((p) => {
      const haystacks = [
        p.title,
        p.category,
        p.context,
        p.description,
        p.template,
      ].map((s) => (s ?? '').toLowerCase())
      const textHit = !q || haystacks.some((h) => h.includes(q))
      const categoryHit = !filterCategory || (p.category ?? '') === filterCategory
      return textHit && categoryHit
    })
  }, [prompts, query, filterCategory])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <BookOpen className="text-blue-600" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
              <p className="text-sm text-slate-500">{filtered.length} prompts available</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-6 border-b border-slate-200 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, category, or content..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All categories</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {(query || filterCategory) && (
              <button
                onClick={() => {
                  setQuery('')
                  setFilterCategory('')
                }}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Prompt List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-slate-500">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
              Loading prompts...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <BookOpen size={48} className="mx-auto mb-3 text-slate-300" />
              <p>No prompts found</p>
              <p className="text-sm mt-1">Try adjusting your search filters</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((prompt) => {
                const isSelected = selectedIds.includes(prompt.id)
                return (
                  <button
                    key={prompt.id}
                    onClick={() => onSelect(prompt)}
                    className={`group relative p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {prompt.title}
                          </h3>
                          {prompt.category && (
                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full whitespace-nowrap">
                              {prompt.category}
                            </span>
                          )}
                        </div>
                        {(prompt.context || prompt.description) && (
                          <p className="text-sm text-slate-600 line-clamp-2 mb-2">
                            {prompt.context || prompt.description}
                          </p>
                        )}
                        {prompt.tags && prompt.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {prompt.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-xs px-2 py-0.5 bg-slate-50 text-slate-500 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                            {prompt.tags.length > 3 && (
                              <span className="text-xs px-2 py-0.5 text-slate-400">
                                +{prompt.tags.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <ChevronRight
                        size={20}
                        className={`transition-colors ${
                          isSelected ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
