import { redirect } from 'next/navigation'

/** /home → / (canonical Home route) */
export default function HomePage() {
  redirect('/')
}
