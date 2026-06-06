/**
 * Concierge Handshake protocol.
 *
 * The Concierge mode decouples Chat State from Mission State. Supr
 * only writes to the `Missions` and `Glidepaths` tables when the
 * user has explicitly approved a plan via a "go" phrase. This
 * module is the canonical place that:
 *
 *   1. Defines the "go" phrase regex (what counts as user approval)
 *   2. Defines the JSON schema for the user-approved plan
 *   3. Validates an incoming plan against the schema
 *   4. Enforces the concierge mode flag on writes
 *
 * Both the chat UI (app/supr-chat/page.tsx) and the server action
 * (conciergeInitiateAction in app/actions/chat-workspace.ts) MUST
 * import from this module so there is one source of truth for the
 * handshake semantics.
 */

import { z } from 'zod';

export const CONCIERGE_MODE_SETTING = 'concierge_mode_enabled';

/**
 * Canonical "go" phrases the user can type to signal plan approval.
 *
 * Match is case-insensitive. Each pattern is a regex fragment, not
 * a full regex. We anchor with `\b...\b` so we don't match in the
 * middle of larger words.
 */
export const GO_PHRASE_PATTERNS: string[] = [
    "looks good(?:,)? let's do it",
    "looks good(?:,)? let'?s do it",
    'proceed',
    'ship it',
    "go(?: for it)?",
    "let'?s (?:go|do it|start|begin|ship it|launch)",
    'do it',
    'start (?:the )?mission',
    'begin (?:the )?mission',
    'approved',
    'approve (?:and )?(?:start|launch|begin)',
    'go ahead',
    'confirmed',
    'confirm(?:ed)?',
    "i'?m (?:good|ready|ok(?:ay)?)",
    'thumbs up',
    'yes,? (?:please|proceed|go(?: ahead)?|do it|start)',
];

/**
 * Patterns that explicitly REJECT the plan. If any of these are
 * present, we do NOT show the confirmation card even if a "go"
 * phrase is also present. (E.g. "looks good but cancel" should
 * not trigger.)
 */
export const REJECT_PHRASE_PATTERNS: string[] = [
    'cancel',
    'nevermind',
    'never ?mind',
    'wait',
    'hold on',
    'stop',
    'not yet',
    'reconsider',
    'rethink',
    'change (?:the )?plan',
    'redo (?:the )?plan',
    'replan',
    'no,? (?:thanks|please|don\'?t)',
];

/**
 * Phrases that ask for revision but don't reject outright. If a
 * user says "tweak step 2" the concierge should NOT show the
 * confirmation card -- it should keep iterating.
 */
export const REVISE_PHRASE_PATTERNS: string[] = [
    'tweak',
    'change',
    'update',
    'revise',
    'edit',
    'modify',
    'instead',
    'rather',
    'prefer',
    'swap',
    'reorder',
];

/**
 * The JSON plan shape Supr must produce in the chat thread for
 * the user to approve. This is the same shape that
 * Initiate_Mission accepts.
 */
export const InitiateMissionPlanSchema = z.object({
    name: z.string().min(2).max(160),
    objective: z.string().min(4).max(4000),
    phases: z
        .array(
            z.object({
                name: z.enum(['Intake', 'Research', 'Build', 'Verify', 'Deliver']),
                tasks: z
                    .array(
                        z.object({
                            title: z.string().min(2).max(200),
                            agentRole: z.string().min(2).max(80),
                            riskLevel: z.enum(['Low', 'Medium', 'High', 'Critical']),
                        }),
                    )
                    .min(1)
                    .max(20),
            }),
        )
        .min(1)
        .max(5),
});

export type InitiateMissionPlan = z.infer<typeof InitiateMissionPlanSchema>;

/**
 * Compile the GO_PHRASE_PATTERNS into a single anchored regex.
 * Sorted by length descending so longer matches win over shorter
 * substrings ("looks good, let's do it" should win over "go").
 */
let compiledGoPattern: RegExp | null = null;
let compiledRejectPattern: RegExp | null = null;
let compiledRevisePattern: RegExp | null = null;

function escapeForAlt(pattern: string): string {
    return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getGoPhraseRegex(): RegExp {
    if (compiledGoPattern) return compiledGoPattern;
    const sorted = [...GO_PHRASE_PATTERNS].sort((a, b) => b.length - a.length);
    const body = sorted.map(escapeForAlt).join('|');
    compiledGoPattern = new RegExp(`\\b(?:${body})\\b`, 'i');
    return compiledGoPattern;
}

export function getRejectPhraseRegex(): RegExp {
    if (compiledRejectPattern) return compiledRejectPattern;
    const body = REJECT_PHRASE_PATTERNS.map(escapeForAlt).join('|');
    compiledRejectPattern = new RegExp(`\\b(?:${body})\\b`, 'i');
    return compiledRejectPattern;
}

export function getRevisePhraseRegex(): RegExp {
    if (compiledRevisePattern) return compiledRevisePattern;
    const body = REVISE_PHRASE_PATTERNS.map(escapeForAlt).join('|');
    compiledRevisePattern = new RegExp(`\\b(?:${body})\\b`, 'i');
    return compiledRevisePattern;
}

export type HandshakeIntent =
    | { kind: 'go' }
    | { kind: 'reject' }
    | { kind: 'revise' }
    | { kind: 'none' };

/**
 * Inspect a user message and return the dominant intent. The
 * priority is reject > revise > go so an ambiguous message like
 * "okay, but revise step 2" is classified as revise.
 */
export function detectHandshakeIntent(message: string): HandshakeIntent {
    if (!message || typeof message !== 'string') return { kind: 'none' };
    if (getRejectPhraseRegex().test(message)) return { kind: 'reject' };
    if (getRevisePhraseRegex().test(message)) return { kind: 'revise' };
    if (getGoPhraseRegex().test(message)) return { kind: 'go' };
    return { kind: 'none' };
}

/**
 * Validate a plan payload. Returns `{ ok: true, plan }` on success
 * or `{ ok: false, error }` on failure.
 */
export function validatePlan(payload: unknown): { ok: true; plan: InitiateMissionPlan } | { ok: false; error: string } {
    const result = InitiateMissionPlanSchema.safeParse(payload);
    if (result.success) return { ok: true, plan: result.data };
    const first = result.error.issues[0];
    return {
        ok: false,
        error: first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'Invalid plan payload.',
    };
}

/**
 * Concierge mode is opt-in via the `concierge_mode_enabled` setting.
 * When disabled, the chat falls back to the legacy behaviour
 * (Supr can auto-create missions via the dashboard `createMission`).
 */
export function isConciergeEnabled(settingValue: string | null | undefined): boolean {
    // Default to ON. Returning false must be an explicit operator decision.
    if (settingValue === undefined || settingValue === null || settingValue === '') return true;
    return settingValue === 'true' || settingValue === '1';
}
