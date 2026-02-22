import { redirect } from 'next/navigation'

/** /overview → /dashboard (canonical Home route) */
export default function OverviewPage() {
  redirect('/dashboard')
}
