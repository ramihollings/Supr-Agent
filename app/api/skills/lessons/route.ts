import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import {
  readRecentLessons,
  pruneLessons,
} from '@/lib/skills/lessons';
import { loadAllSkills } from '@/lib/skills/catalog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  const skill = req.nextUrl.searchParams.get('skill');
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || '20'), 1), 200);
  if (skill) {
    const lessons = readRecentLessons(skill, limit);
    return NextResponse.json({ ok: true, skill, lessons });
  }
  // No skill specified — return a per-skill summary so the
  // operator can see which skills have lessons and how many.
  const skills = loadAllSkills();
  const summary: Array<{ skill: string; description: string; lessonCount: number }> = [];
  for (const s of skills) {
    const lessons = readRecentLessons(s.name, 200);
    if (lessons.length > 0) {
      summary.push({
        skill: s.name,
        description: s.description,
        lessonCount: lessons.length,
      });
    }
  }
  return NextResponse.json({ ok: true, summary });
}

export async function POST(req: NextRequest) {
  // Manual prune. Operator can ask the server to keep only
  // the most recent N lessons for a given skill.
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }
  const skill = String(body?.skill || '');
  const keep = Math.min(Math.max(Number(body?.keep || 20), 1), 100);
  if (!skill || !/^[a-zA-Z0-9._-]+$/.test(skill)) {
    return NextResponse.json({ ok: false, error: 'Invalid skill name.' }, { status: 400 });
  }
  const result = pruneLessons(skill, keep);
  return NextResponse.json({ ok: true, ...result });
}
