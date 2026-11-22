import { baghdadDay } from './reporting'

export type ReportingPeriod = 'today' | 'week' | 'month' | 'all'
export type RecordedVisit = {
  id: string
  outlet_id: string
  checked_in_at: string
  checked_out_at: string | null
}
type Submission = { id: string; outlet_id: string; created_at: string }
type Client = { id: string; retail_name: string; archived_at?: string | null }

export function reportingWindow(period: ReportingPeriod, at: Date) {
  const today = baghdadDay(at)
  const shift = (day: string, offset: number) =>
    new Date(Date.parse(day + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10)
  const start = period === 'today' ? today
    : period === 'week' ? shift(today, -6)
    : period === 'month' ? today.slice(0, 7) + '-01' : undefined
  return { start, end: shift(today, 1), today }
}

function stamp(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw Error('Invalid recorded timestamp. Refresh and review source records.')
  }
  return date
}

export function inReportingWindow(value: string, range: ReturnType<typeof reportingWindow>) {
  const day = baghdadDay(stamp(value))
  return (!range.start || day >= range.start) && day < range.end
}

function unique(rows: { id: string }[], kind: string) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) {
    throw Error(`Duplicate ${kind} records. Refresh before using these counts.`)
  }
}

/** Counts confirmed source rows, never drafts or inferred scheduled coverage. */
export function operationalReport(
  data: { clients: Client[]; visits?: RecordedVisit[]; runs: Submission[]; observations: Submission[] },
  period: ReportingPeriod,
  at: Date,
) {
  if (!data.visits) throw Error('Visit data unavailable. Refresh before using operational counts.')
  unique(data.clients, 'client')
  unique(data.visits, 'visit')
  unique(data.runs, 'survey')
  unique(data.observations, 'observation')
  const clients = new Set(data.clients.map(client => client.id))
  const range = reportingWindow(period, at)
  for (const row of [...data.visits, ...data.runs, ...data.observations]) {
    if (!clients.has(row.outlet_id)) {
      throw Error('Client and activity records changed during refresh. Retry to reconcile.')
    }
  }
  for (const visit of data.visits) {
    const start = stamp(visit.checked_in_at)
    if (visit.checked_out_at && stamp(visit.checked_out_at) < start) {
      throw Error('Visit completion precedes its recorded start. Review source timestamps.')
    }
  }
  const started = data.visits.filter(visit => inReportingWindow(visit.checked_in_at, range))
  const completed = data.visits.filter(visit => visit.checked_out_at && inReportingWindow(visit.checked_out_at, range))
  const runs = data.runs.filter(run => inReportingWindow(run.created_at, range))
  const observations = data.observations.filter(row => inReportingWindow(row.created_at, range))
  const activity = [
    ...completed.map(visit => ({ key: 'visit:' + visit.id, kind: 'Visit completed', at: visit.checked_out_at!, outlet_id: visit.outlet_id })),
    ...runs.map(run => ({ key: 'survey:' + run.id, kind: 'Survey form received', at: run.created_at, outlet_id: run.outlet_id })),
    ...observations.map(row => ({ key: 'observation:' + row.id, kind: 'Market observation received', at: row.created_at, outlet_id: row.outlet_id })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key))
  return {
    range,
    started: started.length,
    completed: completed.length,
    clientsVisited: new Set(completed.map(visit => visit.outlet_id)).size,
    open: data.visits.filter(visit => !visit.checked_out_at && baghdadDay(stamp(visit.checked_in_at)) <= range.today).length,
    forms: runs.length,
    observations: observations.length,
    activity: activity.slice(0, 10),
  }
}
