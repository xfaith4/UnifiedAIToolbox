'use client'

import { useState, useEffect } from 'react'
import {
  Box,
  TextField,
  Chip,
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material'
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { useRouter } from 'next/navigation'

interface MCPServer {
  server_id: string
  name: string
  description?: string
  url: string
  tags: string[]
  capabilities: string[]
  status: string
  installation_status: string
  owner?: string
}

interface SearchFilters {
  query: string
  tags: string[]
  capabilities: string[]
  status: string
  installation_status: string
}

export default function MCPLibraryPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(0)
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    tags: [],
    capabilities: [],
    status: '',
    installation_status: '',
  })

  const loadServers = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('http://localhost:8000/api/mcp/servers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: filters.query || null,
          tags: filters.tags.length > 0 ? filters.tags : null,
          capabilities: filters.capabilities.length > 0 ? filters.capabilities : null,
          status: filters.status || null,
          installation_status: filters.installation_status || null,
          limit: 50,
          offset: 0,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to load servers')
      }

      const data = await response.json()
      setServers(data.results || [])
    } catch (err) {
      console.error('Error loading servers:', err)
      setError(err instanceof Error ? err.message : 'Failed to load servers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    loadServers()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckCircleIcon color="success" fontSize="small" />
      case 'experimental':
        return <WarningIcon color="warning" fontSize="small" />
      default:
        return <InfoIcon color="info" fontSize="small" />
    }
  }

  const getStatusColor = (installStatus: string) => {
    return installStatus === 'installed' ? 'success' : 'default'
  }

  const renderServerCard = (server: MCPServer) => (
    <Grid item xs={12} sm={6} md={4} key={server.server_id}>
      <Card 
        sx={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          '&:hover': { boxShadow: 6 }
        }}
      >
        <CardContent sx={{ flexGrow: 1 }}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            {getStatusIcon(server.status)}
            <Typography variant="h6" component="div" noWrap>
              {server.name}
            </Typography>
          </Box>

          <Chip 
            label={server.installation_status}
            color={getStatusColor(server.installation_status) as any}
            size="small"
            sx={{ mb: 1 }}
          />

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 60 }}>
            {server.description || 'No description available'}
          </Typography>

          <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
            {server.tags.slice(0, 3).map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
            {server.tags.length > 3 && (
              <Chip label={`+${server.tags.length - 3}`} size="small" variant="outlined" />
            )}
          </Box>

          <Typography variant="caption" color="text.secondary">
            Capabilities: {server.capabilities.join(', ') || 'None'}
          </Typography>
        </CardContent>

        <CardActions>
          <Button 
            size="small" 
            onClick={() => router.push(`/mcp-library/${server.server_id}`)}
          >
            View Details
          </Button>
          {server.installation_status === 'catalog' && (
            <Button size="small" color="primary">
              Install
            </Button>
          )}
        </CardActions>
      </Card>
    </Grid>
  )

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          MCP Library
        </Typography>
        <Tooltip title="Refresh registry">
          <IconButton onClick={loadServers}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="Browse Servers" />
        <Tab label="Collections" />
        <Tab label="Installations" />
      </Tabs>

      {activeTab === 0 && (
        <>
          {/* Search and Filters */}
          <Card sx={{ mb: 3, p: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  placeholder="Search servers..."
                  value={filters.query}
                  onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  InputProps={{
                    startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                />
              </Grid>

              <Grid item xs={12} md={2}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="available">Available</MenuItem>
                    <MenuItem value="experimental">Experimental</MenuItem>
                    <MenuItem value="deprecated">Deprecated</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={2}>
                <FormControl fullWidth>
                  <InputLabel>Installed</InputLabel>
                  <Select
                    value={filters.installation_status}
                    label="Installed"
                    onChange={(e) => setFilters({ ...filters, installation_status: e.target.value })}
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="installed">Installed</MenuItem>
                    <MenuItem value="catalog">Catalog Only</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={2}>
                <Button 
                  fullWidth 
                  variant="contained" 
                  onClick={handleSearch}
                  disabled={loading}
                >
                  Search
                </Button>
              </Grid>
            </Grid>
          </Card>

          {/* Server Grid */}
          {loading ? (
            <Box display="flex" justifyContent="center" py={8}>
              <CircularProgress />
            </Box>
          ) : (
            <Grid container spacing={3}>
              {servers.length === 0 ? (
                <Grid item xs={12}>
                  <Alert severity="info">
                    No servers found. Try adjusting your filters or refreshing the registry.
                  </Alert>
                </Grid>
              ) : (
                servers.map(renderServerCard)
              )}
            </Grid>
          )}
        </>
      )}

      {activeTab === 1 && (
        <Alert severity="info">
          Collections feature coming soon. Create curated collections of MCP servers for easier management.
        </Alert>
      )}

      {activeTab === 2 && (
        <Alert severity="info">
          Installations feature coming soon. Manage installed servers, enable/disable, and configure.
        </Alert>
      )}
    </Box>
  )
}
