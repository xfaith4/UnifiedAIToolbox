'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  ArrowBack as ArrowBackIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import { useRouter } from 'next/navigation'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEvent {
  event_id: string
  event_type: string
  timestamp: string
  run_id?: string
  job_id?: string
  user_id?: string
  server_id?: string
  tool_name?: string
  decision: string
  reason?: string
  policy_name?: string
  request_payload?: Record<string, unknown>
  response_payload?: Record<string, unknown>
  duration_ms?: number
  success?: boolean
}

interface AuditSummary {
  total_events: number
  policy_decisions: number
  tools_allowed: number
  tools_denied: number
  tools_executed: number
  tools_failed: number
  unique_servers: number
  unique_users: number
  time_range_start: string
  time_range_end: string
}

interface AuditAnomaly {
  anomaly_id: string
  anomaly_type: string
  severity: string
  description: string
  affected_server_id?: string
  affected_user_id?: string
  event_count: number
  detected_at: string
}

interface ViolationGroup {
  group_key: string
  group_type: string
  denied_count: number
  last_denied_at?: string
  top_reasons: string[]
}

interface ViolationsSummary {
  window_start: string
  window_end: string
  total_denied: number
  by_server: ViolationGroup[]
  by_tool: ViolationGroup[]
  by_user: ViolationGroup[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTs(ts: string | undefined): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function DecisionChip({ decision }: { decision: string }) {
  if (decision === 'allow') {
    return (
      <Chip
        icon={<CheckCircleIcon />}
        label="Allowed"
        color="success"
        size="small"
      />
    )
  }
  if (decision === 'deny') {
    return (
      <Chip
        icon={<CancelIcon />}
        label="Denied"
        color="error"
        size="small"
      />
    )
  }
  return <Chip label={decision} size="small" />
}

function SeverityChip({ severity }: { severity: string }) {
  const colorMap: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'info',
  }
  return (
    <Chip
      label={severity}
      color={colorMap[severity.toLowerCase()] ?? 'default'}
      size="small"
    />
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MCPAuditLogPage() {
  const router = useRouter()

  // Summary stats
  const [summary, setSummary] = useState<AuditSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Events list
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterDecision, setFilterDecision] = useState('')
  const [filterServerId, setFilterServerId] = useState('')
  const [filterUserId, setFilterUserId] = useState('')
  const [filterRunId, setFilterRunId] = useState('')

  // Event detail dialog
  const [detailEvent, setDetailEvent] = useState<AuditEvent | null>(null)

  // Anomalies
  const [anomalies, setAnomalies] = useState<AuditAnomaly[]>([])
  const [anomaliesLoading, setAnomaliesLoading] = useState(false)

  // Violations
  const [violations, setViolations] = useState<ViolationsSummary | null>(null)
  const [violationsLoading, setViolationsLoading] = useState(false)

  // Active section tab: 'events' | 'anomalies' | 'violations'
  const [section, setSection] = useState<'events' | 'anomalies' | 'violations'>('events')

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/mcp/audit/summary`)
      if (!res.ok) throw new Error('Failed to load audit summary')
      setSummary(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { limit: 100, offset: 0 }
      if (filterDecision) body.decision = filterDecision
      if (filterServerId) body.server_id = filterServerId
      if (filterUserId) body.user_id = filterUserId
      if (filterRunId) body.run_id = filterRunId

      const res = await fetch(`${API_BASE}/api/mcp/audit/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to query audit events')
      const data: AuditEvent[] = await res.json()
      setEvents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events')
    } finally {
      setEventsLoading(false)
    }
  }, [filterDecision, filterServerId, filterUserId, filterRunId])

  const loadAnomalies = useCallback(async () => {
    setAnomaliesLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/mcp/audit/anomalies`)
      if (!res.ok) throw new Error('Failed to load anomalies')
      setAnomalies(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setAnomaliesLoading(false)
    }
  }, [])

  const loadViolations = useCallback(async () => {
    setViolationsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/mcp/violations`)
      if (!res.ok) throw new Error('Failed to load violations')
      setViolations(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setViolationsLoading(false)
    }
  }, [])

  // Initial data load
  useEffect(() => {
    loadSummary()
    loadEvents()
  }, [loadSummary, loadEvents])

  useEffect(() => {
    if (section === 'anomalies') loadAnomalies()
    if (section === 'violations') loadViolations()
  }, [section, loadAnomalies, loadViolations])

  const handleRefresh = () => {
    loadSummary()
    loadEvents()
    if (section === 'anomalies') loadAnomalies()
    if (section === 'violations') loadViolations()
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Tooltip title="Back to MCP Library">
          <IconButton onClick={() => router.push('/mcp-library')}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h4" fontWeight="bold">
          MCP Audit Log
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary cards */}
      {summaryLoading ? (
        <CircularProgress size={24} sx={{ mb: 2 }} />
      ) : summary ? (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total Events', value: summary.total_events, icon: <InfoIcon />, color: 'primary.main' },
            { label: 'Allowed', value: summary.tools_allowed, icon: <CheckCircleIcon />, color: 'success.main' },
            { label: 'Denied', value: summary.tools_denied, icon: <CancelIcon />, color: 'error.main' },
            { label: 'Unique Servers', value: summary.unique_servers, icon: <InfoIcon />, color: 'info.main' },
          ].map(({ label, value, icon, color }) => (
            <Grid item xs={6} md={3} key={label}>
              <Card variant="outlined">
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ color }}>{icon}</Box>
                  <Box>
                    <Typography variant="h5" fontWeight="bold">
                      {value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : null}

      {/* Section tabs */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {(['events', 'anomalies', 'violations'] as const).map((s) => (
          <Button
            key={s}
            variant={section === s ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setSection(s)}
            startIcon={s === 'anomalies' ? <WarningIcon /> : s === 'violations' ? <CancelIcon /> : <SearchIcon />}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Events section ──────────────────────────────────────────────── */}
      {section === 'events' && (
        <>
          {/* Filters */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Decision</InputLabel>
                  <Select
                    value={filterDecision}
                    label="Decision"
                    onChange={(e) => setFilterDecision(e.target.value)}
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="allow">Allowed</MenuItem>
                    <MenuItem value="deny">Denied</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Server ID"
                  value={filterServerId}
                  onChange={(e) => setFilterServerId(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="User ID"
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Run ID"
                  value={filterRunId}
                  onChange={(e) => setFilterRunId(e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<SearchIcon />}
                  onClick={loadEvents}
                >
                  Apply Filters
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {eventsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Decision</TableCell>
                    <TableCell>Server</TableCell>
                    <TableCell>Tool</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Run</TableCell>
                    <TableCell>Reason</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Typography color="text.secondary" variant="body2">
                          No audit events found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    events.map((ev) => (
                      <TableRow key={ev.event_id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTs(ev.timestamp)}</TableCell>
                        <TableCell><DecisionChip decision={ev.decision} /></TableCell>
                        <TableCell>{ev.server_id ?? '—'}</TableCell>
                        <TableCell>{ev.tool_name ?? '—'}</TableCell>
                        <TableCell>{ev.user_id ?? '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.run_id ?? '—'}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.reason ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => setDetailEvent(ev)}>
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ── Anomalies section ───────────────────────────────────────────── */}
      {section === 'anomalies' && (
        anomaliesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : anomalies.length === 0 ? (
          <Alert severity="success">No anomalies detected in the audit log.</Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Detected At</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Events</TableCell>
                  <TableCell>Server</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {anomalies.map((anomaly) => (
                  <TableRow key={anomaly.anomaly_id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTs(anomaly.detected_at)}</TableCell>
                    <TableCell>{anomaly.anomaly_type}</TableCell>
                    <TableCell><SeverityChip severity={anomaly.severity} /></TableCell>
                    <TableCell>{anomaly.event_count}</TableCell>
                    <TableCell>{anomaly.affected_server_id ?? '—'}</TableCell>
                    <TableCell>{anomaly.affected_user_id ?? '—'}</TableCell>
                    <TableCell>{anomaly.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}

      {/* ── Violations section ──────────────────────────────────────────── */}
      {section === 'violations' && (
        violationsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : !violations ? (
          <Alert severity="info">Violations data unavailable.</Alert>
        ) : (
          <Box>
            <Alert severity={violations.total_denied > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
              <strong>{violations.total_denied}</strong> denied tool call
              {violations.total_denied !== 1 ? 's' : ''} in window
              {' '}({formatTs(violations.window_start)} – {formatTs(violations.window_end)})
            </Alert>

            {(['by_server', 'by_tool', 'by_user'] as const).map((key) => {
              const groups = violations[key]
              if (groups.length === 0) return null
              const label = key === 'by_server' ? 'Top Denied Servers' : key === 'by_tool' ? 'Top Denied Tools' : 'Top Denying Users'
              return (
                <Box key={key} sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                    {label}
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Key</TableCell>
                          <TableCell align="right">Denied Count</TableCell>
                          <TableCell>Last Denied</TableCell>
                          <TableCell>Top Reasons</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {groups.map((g) => (
                          <TableRow key={g.group_key} hover>
                            <TableCell><strong>{g.group_key}</strong></TableCell>
                            <TableCell align="right">
                              <Chip label={g.denied_count} color="error" size="small" />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTs(g.last_denied_at)}</TableCell>
                            <TableCell>
                              {g.top_reasons.map((r) => (
                                <Typography key={r} variant="caption" display="block">
                                  • {r}
                                </Typography>
                              ))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )
            })}
          </Box>
        )
      )}

      {/* ── Event Detail Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!detailEvent} onClose={() => setDetailEvent(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Audit Event Detail
          {detailEvent && (
            <Typography variant="caption" display="block" color="text.secondary">
              {detailEvent.event_id}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {detailEvent && (
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Timestamp</Typography>
                <Typography>{formatTs(detailEvent.timestamp)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Decision</Typography>
                <Box><DecisionChip decision={detailEvent.decision} /></Box>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Server</Typography>
                <Typography>{detailEvent.server_id ?? '—'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Tool</Typography>
                <Typography>{detailEvent.tool_name ?? '—'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">User</Typography>
                <Typography>{detailEvent.user_id ?? '—'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Run ID</Typography>
                <Typography>{detailEvent.run_id ?? '—'}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Reason</Typography>
                <Typography>{detailEvent.reason ?? '—'}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Policy</Typography>
                <Typography>{detailEvent.policy_name ?? '—'}</Typography>
              </Grid>
              {detailEvent.duration_ms !== undefined && (
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Duration</Typography>
                  <Typography>{detailEvent.duration_ms.toFixed(1)} ms</Typography>
                </Grid>
              )}
              {detailEvent.request_payload && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Request Payload</Typography>
                  <Paper variant="outlined" sx={{ p: 1, mt: 0.5 }}>
                    <pre style={{ margin: 0, fontSize: 12, overflowX: 'auto' }}>
                      {JSON.stringify(detailEvent.request_payload, null, 2)}
                    </pre>
                  </Paper>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailEvent(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
