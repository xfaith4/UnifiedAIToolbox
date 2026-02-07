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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material'
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
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

interface MCPCollection {
  id: string
  name: string
  description?: string
  server_ids: string[]
  tags: string[]
  created_at?: string
}

interface MCPInstallation {
  server_id: string
  name: string
  status: string
  installed_at?: string
  version?: string
  location?: string
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
  
  // Collections state
  const [collections, setCollections] = useState<MCPCollection[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [showCreateCollection, setShowCreateCollection] = useState(false)
  const [newCollection, setNewCollection] = useState({
    name: '',
    description: '',
    server_ids: [] as string[],
    tags: [] as string[],
  })
  
  // Installations state
  const [installations, setInstallations] = useState<MCPInstallation[]>([])
  const [installationsLoading, setInstallationsLoading] = useState(false)
  
  // Install dialog state
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [serverToInstall, setServerToInstall] = useState<MCPServer | null>(null)
  const [installNotes, setInstallNotes] = useState('')

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

  const loadCollections = async () => {
    setCollectionsLoading(true)
    try {
      const response = await fetch('http://localhost:8000/api/mcp/collections')
      if (!response.ok) throw new Error('Failed to load collections')
      const data = await response.json()
      setCollections(data.collections || [])
    } catch (err) {
      console.error('Error loading collections:', err)
      setError(err instanceof Error ? err.message : 'Failed to load collections')
    } finally {
      setCollectionsLoading(false)
    }
  }

  const loadInstallations = async () => {
    setInstallationsLoading(true)
    try {
      const response = await fetch('http://localhost:8000/api/mcp/installs')
      if (!response.ok) throw new Error('Failed to load installations')
      const data = await response.json()
      setInstallations(data.installs || [])
    } catch (err) {
      console.error('Error loading installations:', err)
      setError(err instanceof Error ? err.message : 'Failed to load installations')
    } finally {
      setInstallationsLoading(false)
    }
  }

  const handleCreateCollection = async () => {
    if (!newCollection.name) {
      setError('Collection name is required')
      return
    }
    
    try {
      const response = await fetch('http://localhost:8000/api/mcp/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCollection),
      })
      
      if (!response.ok) throw new Error('Failed to create collection')
      
      setShowCreateCollection(false)
      setNewCollection({ name: '', description: '', server_ids: [], tags: [] })
      loadCollections()
    } catch (err) {
      console.error('Error creating collection:', err)
      setError(err instanceof Error ? err.message : 'Failed to create collection')
    }
  }

  const handleDeleteCollection = async (collectionId: string) => {
    if (!confirm('Are you sure you want to delete this collection?')) return
    
    try {
      const response = await fetch(`http://localhost:8000/api/mcp/collections/${collectionId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) throw new Error('Failed to delete collection')
      loadCollections()
    } catch (err) {
      console.error('Error deleting collection:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete collection')
    }
  }

  const handleToggleInstall = async (installId: string, currentStatus: string) => {
    const action = currentStatus === 'enabled' ? 'disable' : 'enable'
    
    try {
      const response = await fetch(`http://localhost:8000/api/mcp/installs/${installId}/${action}`, {
        method: 'POST',
      })
      
      if (!response.ok) throw new Error(`Failed to ${action} installation`)
      loadInstallations()
    } catch (err) {
      console.error(`Error ${action}ing installation:`, err)
      setError(err instanceof Error ? err.message : `Failed to ${action} installation`)
    }
  }

  const handleInstallServer = async () => {
    if (!serverToInstall) return
    
    try {
      const response = await fetch('http://localhost:8000/api/mcp/installs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: serverToInstall.server_id,
          config: {},
          notes: installNotes || undefined,
        }),
      })
      
      if (!response.ok) throw new Error('Failed to install server')
      
      setShowInstallDialog(false)
      setServerToInstall(null)
      setInstallNotes('')
      
      // Refresh servers to update installation status
      await loadServers()
      
      // Show success message
      setError(null)
      alert(`Successfully installed ${serverToInstall.name}`)
    } catch (err) {
      console.error('Error installing server:', err)
      setError(err instanceof Error ? err.message : 'Failed to install server')
    }
  }

  const openInstallDialog = (server: MCPServer) => {
    setServerToInstall(server)
    setShowInstallDialog(true)
  }

  useEffect(() => {
    loadServers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeTab === 1) {
      loadCollections()
    } else if (activeTab === 2) {
      loadInstallations()
    }
  }, [activeTab])

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

  const getStatusColor = (installStatus: string): 'success' | 'default' => {
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
            color={getStatusColor(server.installation_status)}
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
            <Button 
              size="small" 
              color="primary"
              onClick={() => openInstallDialog(server)}
            >
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
        <>
          {/* Collections Tab */}
          <Box display="flex" justifyContent="space-between" mb={2}>
            <Typography variant="h6">Collections</Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setShowCreateCollection(true)}
            >
              Create Collection
            </Button>
          </Box>

          {collectionsLoading ? (
            <Box display="flex" justifyContent="center" py={8}>
              <CircularProgress />
            </Box>
          ) : collections.length === 0 ? (
            <Alert severity="info">
              No collections yet. Create a collection to group related MCP servers.
            </Alert>
          ) : (
            <Grid container spacing={3}>
              {collections.map((collection) => (
                <Grid item xs={12} md={6} key={collection.collection_id}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        {collection.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {collection.description || 'No description'}
                      </Typography>
                      <Box mt={2}>
                        <Typography variant="caption" color="text.secondary">
                          Servers: {collection.server_ids?.length || 0}
                        </Typography>
                      </Box>
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                        {collection.tags?.map((tag: string) => (
                          <Chip key={tag} label={tag} size="small" variant="outlined" />
                        ))}
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                        Created by: {collection.created_by}
                      </Typography>
                    </CardContent>
                    <CardActions>
                      <Button size="small" startIcon={<EditIcon />}>
                        Edit
                      </Button>
                      <Button 
                        size="small" 
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleDeleteCollection(collection.collection_id)}
                      >
                        Delete
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {/* Create Collection Dialog */}
          <Dialog 
            open={showCreateCollection} 
            onClose={() => setShowCreateCollection(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Create New Collection</DialogTitle>
            <DialogContent>
              <Box display="flex" flexDirection="column" gap={2} mt={1}>
                <TextField
                  label="Collection Name"
                  value={newCollection.name}
                  onChange={(e) => setNewCollection({ ...newCollection, name: e.target.value })}
                  fullWidth
                  required
                />
                <TextField
                  label="Description"
                  value={newCollection.description}
                  onChange={(e) => setNewCollection({ ...newCollection, description: e.target.value })}
                  fullWidth
                  multiline
                  rows={3}
                />
                <Autocomplete
                  multiple
                  options={servers.map(s => s.server_id)}
                  getOptionLabel={(option) => servers.find(s => s.server_id === option)?.name || option}
                  value={newCollection.server_ids}
                  onChange={(_, value) => setNewCollection({ ...newCollection, server_ids: value })}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Servers" placeholder="Add servers..." />
                  )}
                />
                <TextField
                  label="Tags (comma-separated)"
                  placeholder="e.g., data-analysis, web-automation"
                  onChange={(e) => setNewCollection({ 
                    ...newCollection, 
                    tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  fullWidth
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowCreateCollection(false)}>Cancel</Button>
              <Button onClick={handleCreateCollection} variant="contained">
                Create
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      {activeTab === 2 && (
        <>
          {/* Installations Tab */}
          <Typography variant="h6" mb={2}>Installed Servers</Typography>

          {installationsLoading ? (
            <Box display="flex" justifyContent="center" py={8}>
              <CircularProgress />
            </Box>
          ) : installations.length === 0 ? (
            <Alert severity="info">
              No installed servers yet. Install a server from the Browse tab to get started.
            </Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Server Name</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Installed By</TableCell>
                    <TableCell>Installed At</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {installations.map((install) => {
                    const server = servers.find(s => s.server_id === install.server_id)
                    return (
                      <TableRow key={install.install_id}>
                        <TableCell>
                          <Typography variant="body2">
                            {server?.name || install.server_id}
                          </Typography>
                          {install.notes && (
                            <Typography variant="caption" color="text.secondary">
                              {install.notes}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={install.status}
                            color={install.status === 'enabled' ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{install.installed_by}</TableCell>
                        <TableCell>
                          {new Date(install.installed_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={install.status === 'enabled'}
                                onChange={() => handleToggleInstall(install.install_id, install.status)}
                              />
                            }
                            label={install.status === 'enabled' ? 'Enabled' : 'Disabled'}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Install Server Dialog */}
      <Dialog 
        open={showInstallDialog} 
        onClose={() => setShowInstallDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Install MCP Server</DialogTitle>
        <DialogContent>
          {serverToInstall && (
            <Box display="flex" flexDirection="column" gap={2} mt={1}>
              <Typography variant="body1">
                <strong>{serverToInstall.name}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {serverToInstall.description}
              </Typography>
              <TextField
                label="Installation Notes (optional)"
                value={installNotes}
                onChange={(e) => setInstallNotes(e.target.value)}
                fullWidth
                multiline
                rows={3}
                placeholder="Add any notes about this installation..."
              />
              <Alert severity="info">
                This will create an installation record and enable the server for use.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowInstallDialog(false)}>Cancel</Button>
          <Button onClick={handleInstallServer} variant="contained" color="primary">
            Install
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
