import { NextResponse } from 'next/server';
import db from '@/lib/database/init';

export async function GET() {
  try {
    // 1. Check if password is set in environment variables
    if (process.env.APP_PASSWORD) {
      return NextResponse.json({ secured: true });
    }

    // 2. Check if password is set in SQLite Settings table
    const row = db.prepare("SELECT value FROM Settings WHERE key = ?").get("app_password") as { value: string } | undefined;
    if (row && row.value) {
      return NextResponse.json({ secured: true });
    }

    return NextResponse.json({ secured: false });
  } catch (error) {
    console.error("Failed to check auth status:", error);
    return NextResponse.json({ secured: false, error: String(error) }, { status: 500 });
  }
}
