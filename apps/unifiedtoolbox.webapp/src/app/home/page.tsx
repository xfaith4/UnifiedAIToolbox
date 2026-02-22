import { redirect } from 'next/navigation'

/** /home → /dashboard (canonical Home route) */
export default function HomePage() {
  redirect('/dashboard')
}
