import { redirect } from 'next/navigation'

/** /overview → / (canonical Home route) */
export default function OverviewPage() {
  redirect('/')
}
