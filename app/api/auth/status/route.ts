import { NextResponse } from 'next/server';
import { isAppSecured } from '@/lib/auth';

export async function GET() {
  try {
    return NextResponse.json({ secured: await isAppSecured() });
  } catch (error) {
    console.error("Failed to check auth status:", error);
    return NextResponse.json({ secured: false, error: String(error) }, { status: 500 });
  }
}
