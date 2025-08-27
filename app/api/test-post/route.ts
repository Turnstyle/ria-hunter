import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({ method: 'GET', message: 'GET handler works' })
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ method: 'POST', message: 'POST handler works' })
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204 })
}
