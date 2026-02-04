'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  CircularProgress,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Security as SecurityIcon,
  Code as CodeIcon,
} from '@mui/icons-material'

interface ServerDetail {
  id: string
  name: string
  description?: string
  url: string
  transport?: string
  tags: string[]
  capabilities: string[]
  status: string
  owner?: string
  auth?: {
    type: string
    env_var?: string
  }
  metadata?: {
    repo_url?: string
    endpoint_hint?: string
  }
  installation_status?: string
  install_record?: any
}

export default function ServerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const serverId = params.serverId as string

  const [server, setServer] = useState<ServerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [installNotes, setInstallNotes] = useState('')

  useEffect(() => {
    const loadServer = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/mcp/servers/${serverId}`)
        
        if (!response.ok) {
          throw new Error('Server not found')
        }

        const data = await response.json()
        setServer(data)
      } catch (err) {
        console.error('Error loading server:', err)
        setError(err instanceof Error ? err.message : 'Failed to load server details')
      } finally {
        setLoading(false)
      }
    }

    if (serverId) {
      loadServer()
    }
  }, [serverId])

  const handleInstallServer = async () => {
    if (!server) return
    
    try {
      const response = await fetch('http://localhost:8000/api/mcp/installs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: server.id,
          config: {},
          notes: installNotes || undefined,
        }),
      })
      
      if (!response.ok) throw new Error('Failed to install server')
      
      setShowInstallDialog(false)
      setInstallNotes('')
      
      // Reload server to update installation status
      const reloadResponse = await fetch(`http://localhost:8000/api/mcp/servers/${serverId}`)
      if (reloadResponse.ok) {
        const data = await reloadResponse.json()
        setServer(data)
      }
      
      alert(`Successfully installed ${server.name}`)
    } catch (err) {
      console.error('Error installing server:', err)
      setError(err instanceof Error ? err.message : 'Failed to install server')
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  if (error || !server) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Server not found'}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/mcp-library')}>
          Back to Library
        </Button>
      </Box>
    )
  }

  const authTypeLabel = {
    none: 'No Authentication',
    token_env: 'Environment Variable Token',
    api_key: 'API Key',
    oauth: 'OAuth',
  }[server.auth?.type || 'none'] || server.auth?.type || 'Unknown'

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/mcp-library')}
          variant="outlined"
        >
          Back
        </Button>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
          {server.name}
        </Typography>
        {server.installation_status === 'installed' ? (
          <Chip label="Installed" color="success" icon={<CheckCircleIcon />} />
        ) : (
          <Button 
            variant="contained" 
            color="primary"
            onClick={() => setShowInstallDialog(true)}
          >
            Install Server
          </Button>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* Main Info */}
        <Grid item xs={12} md={8}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Description
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                {server.description || 'No description available'}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>
                Capabilities
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                {server.capabilities.map((cap) => (
                  <Chip key={cap} label={cap} icon={<CodeIcon />} />
                ))}
              </Box>

              <Typography variant="h6" gutterBottom>
                Tags
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {server.tags.map((tag) => (
                  <Chip key={tag} label={tag} variant="outlined" />
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* Security & Permissions */}
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <SecurityIcon color="primary" />
                <Typography variant="h6">
                  Security & Permissions
                </Typography>
              </Box>

              <Alert 
                severity={server.auth?.type === 'none' ? 'success' : 'warning'}
                sx={{ mb: 2 }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  Authentication Required: {authTypeLabel}
                </Typography>
                {server.auth?.env_var && (
                  <Typography variant="body2">
                    Environment Variable: <code>{server.auth.env_var}</code>
                  </Typography>
                )}
              </Alert>

              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Permission Footprint ("Blast Radius")
                </Typography>
                <List dense>
                  {server.capabilities.map((cap) => (
                    <ListItem key={cap}>
                      <ListItemText
                        primary={cap}
                        secondary="This server can access resources related to this capability"
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </CardContent>
          </Card>
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          {/* Status Card */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Status
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                {server.status === 'available' ? (
                  <CheckCircleIcon color="success" />
                ) : (
                  <WarningIcon color="warning" />
                )}
                <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
                  {server.status}
                </Typography>
              </Box>

              {server.status === 'experimental' && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  This server is experimental. Use with caution in production environments.
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Installation Info */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Installation
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Transport"
                    secondary={server.transport || 'Not specified'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Endpoint"
                    secondary={server.url}
                  />
                </ListItem>
                {server.owner && (
                  <ListItem>
                    <ListItemText
                      primary="Owner"
                      secondary={server.owner}
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>

          {/* Verification Status */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Verification
              </Typography>
              {server.owner === 'platform' ? (
                <Alert severity="success">
                  <Typography variant="body2">
                    ✓ Official Registry - Verified
                  </Typography>
                </Alert>
              ) : (
                <Alert severity="warning">
                  <Typography variant="body2">
                    ⚠ Community Source - Unverified
                  </Typography>
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    This server is from a community source. Review permissions carefully before installation.
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Links */}
          {server.metadata?.repo_url && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Resources
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  href={server.metadata.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Source Code
                </Button>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Install Server Dialog */}
      <Dialog 
        open={showInstallDialog} 
        onClose={() => setShowInstallDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Install {server.name}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <Typography variant="body2" color="text.secondary">
              {server.description}
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
