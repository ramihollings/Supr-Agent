"use client";

import { useEffect, useState } from 'react';

interface Lesson {
  timestamp: string;
  observation: string;
  correctiveAction: string;
  tags: string[];
  pinned?: boolean;
}

interface SkillSummary {
  skill: string;
  description: string;
  lessonCount: number;
}

export function SkillsLessonsPanel() {
  const [summary, setSummary] = useState<SkillSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/skills/lessons')
      .then((r) => r.json())
      .then((data) => {
        setSummary(data.summary || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selected) {
      setLessons([]);
      return;
    }
    fetch(`/api/skills/lessons?skill=${encodeURIComponent(selected)}&limit=50`)
      .then((r) => r.json())
      .then((data) => setLessons(data.lessons || []))
      .catch((err) => setError(err.message));
  }, [selected]);

  const prune = async (skill: string, keep: number) => {
    if (!confirm(`Prune ${skill} to ${keep} most recent lessons?`)) return;
    await fetch('/api/skills/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill, keep }),
    });
    setSelected(null);
    setSelected(skill);
  };

  if (loading) return <p className="font-body text-sm">Loading skill lessons...</p>;
  if (error) return <p className="font-body text-sm text-error">Error: {error}</p>;
  if (summary.length === 0) {
    return <p className="font-body text-xs text-on-surface-variant">No skills have recorded lessons yet. Skills append a lesson after every invocation.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {summary.map((s) => (
          <button
            key={s.skill}
            onClick={() => setSelected(s.skill)}
            className={`text-left border-2 p-3 ${
              selected === s.skill ? 'border-tertiary bg-surface-dim' : 'border-primary bg-surface'
            }`}
          >
            <p className="font-headline font-bold text-sm">{s.skill}</p>
            <p className="font-body text-[10px] text-on-surface-variant">{s.description}</p>
            <p className="font-mono text-[10px] text-tertiary mt-1">{s.lessonCount} lesson(s)</p>
          </button>
        ))}
      </div>
      {selected && (
        <div className="border-2 border-primary p-3 bg-surface">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-headline font-bold text-sm">Lessons: {selected}</h4>
            <div className="flex gap-2">
              <button
                onClick={() => prune(selected, 5)}
                className="text-[10px] font-bold uppercase px-2 py-1 border-2 border-primary hover:bg-primary hover:text-on-primary"
              >
                Keep 5
              </button>
              <button
                onClick={() => prune(selected, 20)}
                className="text-[10px] font-bold uppercase px-2 py-1 border-2 border-primary hover:bg-primary hover:text-on-primary"
              >
                Keep 20
              </button>
            </div>
          </div>
          {lessons.length === 0 && <p className="font-body text-xs text-on-surface-variant">No lessons recorded yet.</p>}
          {lessons.map((l, i) => (
            <div key={i} className={`p-2 border-b-2 border-outline-variant last:border-b-0 ${l.pinned ? 'bg-tertiary/10' : ''}`}>
              <p className="font-mono text-[10px]">
                {l.timestamp} {l.tags.length > 0 && <span className="text-tertiary">[{l.tags.join(', ')}]</span>} {l.pinned && <span className="text-tertiary">[pin]</span>}
              </p>
              <p className="font-body text-xs mt-1"><strong>Observed:</strong> {l.observation}</p>
              <p className="font-body text-xs mt-1"><strong>Do differently:</strong> {l.correctiveAction}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
