import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      status: 'disabled',
      error: 'Swarming execution is disabled for this environment.',
    },
    { status: 410 },
  )
}
