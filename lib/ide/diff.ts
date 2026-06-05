export type DiffLineKind = 'equal' | 'insert' | 'delete' | 'change' | 'spacer';

export type DiffLine = {
  kind: DiffLineKind;
  left: { line: number | null; text: string } | null;
  right: { line: number | null; text: string } | null;
};

export type DiffHunk = {
  leftStart: number;
  rightStart: number;
  lines: DiffLine[];
};

export type DiffResult = {
  hunks: DiffHunk[];
  added: number;
  removed: number;
  unchanged: number;
};

/**
 * Lightweight, line-based LCS diff that returns hunks containing only the
 * changed regions (and a small `context` window of unchanged lines on
 * either side). Designed for the IDE diff viewer, not for huge files.
 */
export function computeLineDiff(
  left: string,
  right: string,
  context = 3,
): DiffResult {
  const a = left.split('\n');
  const b = right.split('\n');
  const lcs = lcsTable(a, b);
  const ops = backtrack(a, b, lcs);

  // Group operations into runs of (insert|delete|change) with a sliding
  // context window of equals. A "change" is consecutive delete+insert on
  // the same row.
  type Op =
    | { kind: 'equal'; line: number; text: string }
    | { kind: 'delete'; line: number; text: string }
    | { kind: 'insert'; line: number; text: string };

  const flat: Op[] = [];
  for (const op of ops) {
    if (op.kind === 'equal') flat.push({ kind: 'equal', line: op.line, text: op.text });
    else if (op.kind === 'delete') flat.push({ kind: 'delete', line: op.line, text: op.text });
    else flat.push({ kind: 'insert', line: op.line, text: op.text });
  }

  const hunks: DiffHunk[] = [];
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  let i = 0;
  while (i < flat.length) {
    const op = flat[i];
    if (op.kind === 'equal') {
      i += 1;
      continue;
    }
    // Found the start of a change. Walk back up to `context` equal lines.
    const hunk: DiffLine[] = [];
    let back = 0;
    let j = i - 1;
    while (j >= 0 && flat[j].kind === 'equal' && back < context) {
      const eq = flat[j] as { kind: 'equal'; line: number; text: string };
      hunk.unshift({
        kind: 'equal',
        left: { line: eq.line + 1, text: eq.text },
        right: { line: eq.line + 1, text: eq.text },
      });
      unchanged += 1;
      j -= 1;
      back += 1;
    }
    // Optional spacer between hunks (indicates collapsed unchanged lines).
    if (j >= 0 && flat[j].kind === 'equal') {
      hunk.unshift({ kind: 'spacer', left: null, right: null });
    }

    // Walk forward through the change, pairing adjacent delete+insert as
    // a `change` row when possible.
    let leftLine = hunk.length > 0 && hunk[0].left?.line != null
      ? hunk[0].left.line
      : 0;
    let rightLine = leftLine;
    const changeStart = i;
    // First, scan to find the end of the changed region (consume any
    // run of inserts/deletes/equals up to the next gap of `context`
    // unchanged lines).
    let k = i;
    let pendingLeft: { line: number; text: string } | null = null;
    while (k < flat.length) {
      const cur = flat[k];
      if (cur.kind === 'equal') {
        // Look ahead to see if more changes follow within `context`.
        let look = k + 1;
        let nonEqualSeen = 0;
        while (look < flat.length && nonEqualSeen < context) {
          if (flat[look].kind !== 'equal') nonEqualSeen += 1;
          look += 1;
        }
        if (nonEqualSeen > 0) {
          // Trailing context — consume `context` equal lines.
          for (let t = 0; t < context && k < flat.length && flat[k].kind === 'equal'; t += 1) {
            const eq = flat[k] as { kind: 'equal'; line: number; text: string };
            hunk.push({
              kind: 'equal',
              left: { line: eq.line + 1, text: eq.text },
              right: { line: eq.line + 1, text: eq.text },
            });
            unchanged += 1;
            leftLine = eq.line + 1;
            rightLine = eq.line + 1;
            k += 1;
          }
          if (k < flat.length && flat[k].kind !== 'equal') {
            // More changes follow after the trailing context. Loop again.
            i = k;
            continue;
          }
        }
        // No more changes within context — close the hunk.
        if (k < flat.length && flat[k].kind === 'equal') {
          hunk.push({ kind: 'spacer', left: null, right: null });
        }
        k += 1;
        break;
      } else if (cur.kind === 'delete') {
        const del = cur as { kind: 'delete'; line: number; text: string };
        if (pendingLeft) {
          // Shouldn't happen (inserts and deletes are flushed alternately
          // below), but flush anyway.
          hunk.push({ kind: 'delete', left: { line: pendingLeft.line + 1, text: pendingLeft.text }, right: null });
          pendingLeft = null;
        }
        pendingLeft = { line: del.line, text: del.text };
        removed += 1;
        k += 1;
      } else {
        // insert
        const ins = cur as { kind: 'insert'; line: number; text: string };
        if (pendingLeft) {
          hunk.push({
            kind: 'change',
            left: { line: pendingLeft.line + 1, text: pendingLeft.text },
            right: { line: ins.line + 1, text: ins.text },
          });
          pendingLeft = null;
        } else {
          hunk.push({ kind: 'insert', left: null, right: { line: ins.line + 1, text: ins.text } });
        }
        added += 1;
        k += 1;
      }
    }
    if (pendingLeft) {
      hunk.push({ kind: 'delete', left: { line: pendingLeft.line + 1, text: pendingLeft.text }, right: null });
      pendingLeft = null;
    }
    if (hunk.length > 0) {
      hunks.push({
        leftStart: hunk[0]?.left?.line ?? 1,
        rightStart: hunk[0]?.right?.line ?? 1,
        lines: hunk,
      });
    }
    i = Math.max(k, changeStart + 1);
  }

  return { hunks, added, removed, unchanged };
}

type RawOp = { kind: 'equal' | 'insert' | 'delete'; line: number; text: string };

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        table[i][j] = table[i + 1][j + 1] + 1;
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
  }
  return table;
}

function backtrack(a: string[], b: string[], table: number[][]): RawOp[] {
  const ops: RawOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', line: i, text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: 'delete', line: i, text: a[i] });
      i += 1;
    } else {
      ops.push({ kind: 'insert', line: j, text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    ops.push({ kind: 'delete', line: i, text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    ops.push({ kind: 'insert', line: j, text: b[j] });
    j += 1;
  }
  return ops;
}
