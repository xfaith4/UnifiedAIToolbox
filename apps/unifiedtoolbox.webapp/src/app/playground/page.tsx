import { redirect } from 'next/navigation'

/** /playground → /orchestrator (canonical Playground route) */
export default function PlaygroundPage() {
  redirect('/orchestrator')
}
