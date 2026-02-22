import { redirect } from 'next/navigation'

/** /reports → /milestones (canonical Reports route) */
export default function ReportsPage() {
  redirect('/milestones')
}
