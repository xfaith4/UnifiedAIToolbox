import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-sm text-slate-400">
        This route doesn’t exist in the Unified AI Toolbox portal.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
      >
        Go to dashboard
      </Link>
    </div>
  )
}
