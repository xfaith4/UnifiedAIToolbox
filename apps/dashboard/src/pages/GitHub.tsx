import { useState, useEffect } from 'react'
import { Search, Filter, RefreshCw, ExternalLink, GitPullRequest, CheckCircle2, XCircle, Clock, AlertCircle, Eye } from 'lucide-react'
import { trackPageView, trackFilterChange, trackSortChange, trackSearch } from '../services/telemetry'

interface PullRequest {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  author: string
  created_at: string
  updated_at: string
  labels: string[]
  branch: string
  base_branch: string
  ci_status?: 'success' | 'failure' | 'pending' | 'unknown'
  url: string
  draft: boolean
  review_count: number
  comments_count: number
}

interface ArtifactLink {
  name: string
  url: string
  type: 'build' | 'report' | 'analysis'
}

export default function GitHubPage() {
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterState, setFilterState] = useState<'all' | 'open' | 'closed'>('open')
  const [filterLabel, setFilterLabel] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'created'>('updated')
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null)

  // Track page view on mount
  useEffect(() => {
    trackPageView('GitHubPRs', {
      initialFilter: filterState,
      initialSort: sortBy,
    })
  }, [])

  // Fetch PRs from GitHub API
  useEffect(() => {
    fetchPullRequests()
  }, [filterState])

  const fetchPullRequests = async () => {
    setLoading(true)
    try {
      // In production, this would call the actual GitHub API via your backend
      // For now, using mock data for demonstration
      const mockPRs: PullRequest[] = [
        {
          number: 123,
          title: 'Add comprehensive CI workflows and artifact management',
          state: 'open',
          author: 'copilot-agent',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          labels: ['enhancement', 'ci/cd'],
          branch: 'copilot/build-github-actions-workflow',
          base_branch: 'main',
          ci_status: 'pending',
          url: '#',
          draft: false,
          review_count: 0,
          comments_count: 2
        },
        // Add more mock PRs as needed
      ]
      
      setPullRequests(mockPRs)
    } catch (error) {
      console.error('Error fetching PRs:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter and sort PRs
  const filteredPRs = pullRequests
    .filter(pr => {
      if (filterState !== 'all' && pr.state !== filterState) return false
      if (filterLabel && !pr.labels.includes(filterLabel)) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          pr.title.toLowerCase().includes(query) ||
          pr.author.toLowerCase().includes(query) ||
          pr.number.toString().includes(query)
        )
      }
      return true
    })
    .sort((a, b) => {
      const dateA = new Date(sortBy === 'updated' ? a.updated_at : a.created_at)
      const dateB = new Date(sortBy === 'updated' ? b.updated_at : b.created_at)
      return dateB.getTime() - dateA.getTime()
    })

  const getCIStatusIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'failure':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />
    }
  }

  const getCIStatusText = (status?: string) => {
    switch (status) {
      case 'success':
        return 'Passing'
      case 'failure':
        return 'Failed'
      case 'pending':
        return 'In Progress'
      default:
        return 'Unknown'
    }
  }

  const getStateColor = (state: string) => {
    switch (state) {
      case 'open':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'closed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'merged':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    return `${diffDays} days ago`
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitPullRequest className="w-6 h-6" />
            Pull Request Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Review and manage pull requests with CI status and artifacts
          </p>
        </div>
        <button
          onClick={fetchPullRequests}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters and Search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search PRs by title, author, or number..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (e.target.value) {
                trackSearch(e.target.value)
              }
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* State Filter */}
        <select
          value={filterState}
          onChange={(e) => {
            const newValue = e.target.value as any
            setFilterState(newValue)
            trackFilterChange('state', newValue)
          }}
          className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All States</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>

        {/* Sort By */}
        <select
          value={sortBy}
          onChange={(e) => {
            const newValue = e.target.value as any
            setSortBy(newValue)
            trackSortChange(newValue)
          }}
          className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500"
        >
          <option value="updated">Recently Updated</option>
          <option value="created">Recently Created</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total PRs</div>
          <div className="text-2xl font-bold mt-1">{pullRequests.length}</div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Open</div>
          <div className="text-2xl font-bold mt-1 text-green-600">
            {pullRequests.filter(pr => pr.state === 'open').length}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">CI Passing</div>
          <div className="text-2xl font-bold mt-1 text-green-600">
            {pullRequests.filter(pr => pr.ci_status === 'success').length}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">CI Failing</div>
          <div className="text-2xl font-bold mt-1 text-red-600">
            {pullRequests.filter(pr => pr.ci_status === 'failure').length}
          </div>
        </div>
      </div>

      {/* PR List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
            <p className="mt-2 text-gray-500">Loading pull requests...</p>
          </div>
        ) : filteredPRs.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <GitPullRequest className="w-12 h-12 mx-auto text-gray-400" />
            <p className="mt-4 text-gray-500">No pull requests found</p>
          </div>
        ) : (
          filteredPRs.map(pr => (
            <div
              key={pr.number}
              className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-colors cursor-pointer"
              onClick={() => setSelectedPR(pr)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getStateColor(pr.state)}`}>
                      {pr.state.toUpperCase()}
                    </span>
                    {pr.draft && (
                      <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        DRAFT
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      {getCIStatusIcon(pr.ci_status)}
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {getCIStatusText(pr.ci_status)}
                      </span>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-semibold mb-1">
                    #{pr.number}: {pr.title}
                  </h3>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>by {pr.author}</span>
                    <span>•</span>
                    <span>{pr.branch} → {pr.base_branch}</span>
                    <span>•</span>
                    <span>Updated {formatDate(pr.updated_at)}</span>
                  </div>

                  {pr.labels.length > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      {pr.labels.map(label => (
                        <span
                          key={label}
                          className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 ml-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Reviews</div>
                    <div className="text-lg font-semibold">{pr.review_count}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Comments</div>
                    <div className="text-lg font-semibold">{pr.comments_count}</div>
                  </div>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* PR Detail Modal - Placeholder for future implementation */}
      {selectedPR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedPR(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">PR #{selectedPR.number} Details</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Detailed PR view with artifacts, analysis reports, and CI logs will be implemented here.
            </p>
            <button
              onClick={() => setSelectedPR(null)}
              className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
