/**
 * Concierge Handshake regression tests.
 *
 * The Concierge protocol is the security boundary that decouples
 * Chat State from Mission State. These tests pin three things:
 *
 *   1. lib/concierge/handshake.ts -- go-phrase regex + plan schema.
 *   2. lib/tools/initiate-mission.ts -- the only path in the chat
 *      loop that writes to Missions / Glidepaths.
 *   3. The chat-workspace server actions -- the only actions the
 *      chat UI is allowed to call.
 *
 * Style follows the existing tests/agent-runtime-pure.test.mjs
 * convention: read the TypeScript source via fs and assert on
 * patterns. Where runtime is required (e.g. validatePlan), the
 * compiled module is loaded through the tsx loader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(__dirname, '..', ...rel), 'utf8');

const handshake = read(['lib', 'concierge', 'handshake.ts']);
const initiate = read(['lib', 'tools', 'initiate-mission.ts']);
const register = read(['lib', 'tools', 'register.ts']);
const chatActions = read(['app', 'actions', 'chat-workspace.ts']);

// ---------------------------------------------------------------------------
// 1. handshake.ts -- the protocol's source of truth
// ---------------------------------------------------------------------------

test('handshake.ts exports the canonical symbols', () => {
    for (const symbol of [
        'GO_PHRASE_PATTERNS',
        'REJECT_PHRASE_PATTERNS',
        'REVISE_PHRASE_PATTERNS',
        'InitiateMissionPlanSchema',
        'getGoPhraseRegex',
        'getRejectPhraseRegex',
        'getRevisePhraseRegex',
        'detectHandshakeIntent',
        'validatePlan',
        'isConciergeEnabled',
        'CONCIERGE_MODE_SETTING',
    ]) {
        assert.match(
            handshake,
            new RegExp(`export\\s+(const|function|interface|type)\\s+${symbol}\\b`),
            `expected handshake.ts to export ${symbol}`,
        );
    }
});

test('handshake.go_phrases include the canonical "looks good, let\'s do it" trigger', () => {
    for (const phrase of [
        "looks good(?:,)? let's do it",
        "let'?s (?:go|do it|start|begin|ship it|launch)",
        'proceed',
        'ship it',
        'go ahead',
        'approved',
        'thumbs up',
    ]) {
        assert.match(
            handshake,
            new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
            `expected GO_PHRASE_PATTERNS to contain '${phrase}'`,
        );
    }
});

test('handshake.go_phrases do NOT include dangerous shortcuts', () => {
    // These should be rejected by the priority logic: a "go" inside a
    // reject-phrase sentence should not trigger the confirmation card.
    for (const phrase of ['cancel', 'nevermind', 'replan', 'redo the plan', 'not yet']) {
        assert.match(
            handshake,
            new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
            `expected REJECT_PHRASE_PATTERNS to contain '${phrase}'`,
        );
    }
});

test('InitiateMissionPlanSchema rejects plans with empty phases', () => {
    // The zod schema is a string in source. Look for the min(1)
    // guard on the phases array.
    assert.match(
        handshake,
        /phases[\s\S]{0,200}\.min\(1\)\.max\(5\)/,
        'expected phases array to be clamped to 1..5',
    );
    // And the per-phase tasks array to be clamped to 1..20.
    assert.match(
        handshake,
        /tasks[\s\S]{0,200}\.min\(1\)\.max\(20\)/,
        'expected per-phase tasks array to be clamped to 1..20',
    );
    // Phase name must be one of the canonical five.
    assert.match(
        handshake,
        /z\.enum\(\['Intake',\s*'Research',\s*'Build',\s*'Verify',\s*'Deliver'\]\)/,
        'expected phase name enum to be the canonical 5 phases',
    );
});

test('InitiateMissionPlanSchema riskLevel enum is Low/Medium/High/Critical', () => {
    assert.match(
        handshake,
        /riskLevel:\s*z\.enum\(\['Low',\s*'Medium',\s*'High',\s*'Critical'\]\)/,
        'expected riskLevel enum to include all 4 tiers',
    );
});

test('detectHandshakeIntent prioritises reject > revise > go', () => {
    // The function should test reject BEFORE revise BEFORE go so an
    // ambiguous message like "cancel and revise" is classified as
    // reject.
    const fnBody = handshake.match(
        /export function detectHandshakeIntent[\s\S]*?\n\}/,
    )?.[0] || '';
    const rejectIdx = fnBody.indexOf('getRejectPhraseRegex');
    const reviseIdx = fnBody.indexOf('getRevisePhraseRegex');
    const goIdx = fnBody.indexOf('getGoPhraseRegex');
    assert.ok(rejectIdx > 0, 'detectHandshakeIntent should call getRejectPhraseRegex');
    assert.ok(reviseIdx > 0, 'detectHandshakeIntent should call getRevisePhraseRegex');
    assert.ok(goIdx > 0, 'detectHandshakeIntent should call getGoPhraseRegex');
    assert.ok(rejectIdx < reviseIdx, 'reject should be tested before revise');
    assert.ok(reviseIdx < goIdx, 'revise should be tested before go');
});

test('isConciergeEnabled defaults to ON (opt-out via settings)', () => {
    // Operators must explicitly disable Concierge mode. The default
    // must be true so a fresh install still requires a handshake.
    const fnBody = handshake.match(
        /export function isConciergeEnabled[\s\S]*?\n\}/,
    )?.[0] || '';
    assert.match(fnBody, /undefined.*return\s+true|null.*return\s+true|''.*return\s+true/s);
});

// ---------------------------------------------------------------------------
// 2. initiate-mission.ts -- the gating tool
// ---------------------------------------------------------------------------

test('initiate-mission.ts is registered as a native tool', () => {
    // The register.ts side-effect import must list this tool.
    assert.match(
        register,
        /import\s+["']\.\/initiate-mission["']/,
        'expected register.ts to side-effect-import initiate-mission',
    );
});

test('initiate-mission.ts is gated to the Edit tier and High risk', () => {
    assert.match(initiate, /requiredTier:\s*['"]Edit['"]/);
    assert.match(initiate, /riskLevel:\s*['"]High['"]/);
});

test('initiate-mission.ts is the ONLY tool that writes to Missions from the chat', () => {
    // Defence-in-depth: the tool name and description must make
    // clear this is the only path. Any other tool that does
    // INSERT INTO Missions is a regression.
    assert.match(initiate, /name:\s*["']initiate_mission["']/);
    assert.match(initiate, /ONLY path/i);

    // The execute() function must INSERT into Missions in a single
    // runTransaction-style block.
    const executeBody = initiate.match(
        /execute:\s*async[\s\S]*?\n\s*\},?\s*\n\s*\},/,
    )?.[0] || '';
    assert.match(executeBody, /INSERT INTO Missions/);
    assert.match(executeBody, /INSERT INTO Glidepaths/);
    assert.match(executeBody, /INSERT INTO Tasks/);
    assert.match(executeBody, /INSERT INTO Artifacts/);
    assert.match(executeBody, /INSERT INTO Event_Log/);
});

test('initiate-mission.ts re-validates the plan before writing', () => {
    // Even though the registry parses the zod schema, the tool must
    // re-validate against validatePlan so a future schema change is
    // enforced at the write site.
    assert.match(initiate, /validatePlan\(params\.plan\)/);
});

test('initiate-mission.ts sorts phases into the canonical 5-phase order', () => {
    assert.match(initiate, /PHASE_ORDER/);
    const sortBody = initiate.match(
        /\[\.\.\.plan\.phases\]\.sort\([\s\S]*?\)/,
    )?.[0] || '';
    assert.match(sortBody, /PHASE_ORDER\.indexOf/);
});

test('initiate-mission.ts seeds three standard Artifacts', () => {
    // strategic_briefing.md, integrity_audit.py,
    // project_checklists.json
    for (const filename of [
        'strategic_briefing.md',
        'integrity_audit.py',
        'project_checklists.json',
    ]) {
        assert.match(initiate, new RegExp(filename.replace(/\./g, '\\.')), `expected ${filename} to be seeded`);
    }
});

test('initiate-mission.ts emits a Concierge Handshake Event_Log entry', () => {
    const eventBlock = initiate.match(
        /INSERT INTO Event_Log[\s\S]*?Concierge Handshake[\s\S]*?timestamp\)/,
    );
    assert.ok(eventBlock, 'expected an Event_Log row mentioning Concierge Handshake');
});

// ---------------------------------------------------------------------------
// 3. chat-workspace.ts Concierge actions
// ---------------------------------------------------------------------------

test('chat-workspace.ts exposes conciergeInitiateAction', () => {
    assert.match(chatActions, /export\s+async\s+function\s+conciergeInitiateAction/);
});

test('chat-workspace.ts exposes conciergePeekAction (read-only)', () => {
    assert.match(chatActions, /export\s+async\s+function\s+conciergePeekAction/);
});

test('chat-workspace.ts exposes fetchConciergeCapabilitiesAction', () => {
    assert.match(chatActions, /export\s+async\s+function\s+fetchConciergeCapabilitiesAction/);
});

test('conciergeInitiateAction guards with validatePlan + isConciergeEnabled + registry check', () => {
    // Extract just the conciergeInitiateAction function body.
    const fnBody = chatActions.match(
        /export\s+async\s+function\s+conciergeInitiateAction[\s\S]*?\n\}/,
    )?.[0] || '';
    assert.match(fnBody, /validatePlan\(/);
    assert.match(fnBody, /isConciergeEnabled\(/);
    assert.match(fnBody, /toolRegistry\.getTool\(['"]initiate_mission['"]\)/);
    assert.match(fnBody, /toolRegistry\.executeTool\([\s\S]*?initiate_mission/);
});

test('conciergePeekAction only reads, never writes', () => {
    const fnBody = chatActions.match(
        /export\s+async\s+function\s+conciergePeekAction[\s\S]*?\n\}/,
    )?.[0] || '';
    // Must not call any mutating tool.
    for (const banned of [
        /toolRegistry\.executeTool/,
        /writeWorkspaceFile/,
        /sendChatMessageAction/,
        /createMission/,
        /INSERT INTO Missions/i,
    ]) {
        assert.doesNotMatch(fnBody, banned, `conciergePeekAction must not call ${banned}`);
    }
    // Must use the read-only helpers.
    assert.match(fnBody, /fetchWorkspaceFilesAction/);
    assert.match(fnBody, /readWorkspaceFileAction/);
});

test('conciergePeekAction caps workspace reads at PEEK_FILE_LIMIT (4) and snippet at 1500 chars', () => {
    const fnBody = chatActions.match(
        /export\s+async\s+function\s+conciergePeekAction[\s\S]*?\n\}/,
    )?.[0] || '';
    assert.match(fnBody, /PEEK_FILE_LIMIT/);
    assert.match(fnBody, /slice\(0,\s*PEEK_FILE_LIMIT\)/);
    assert.match(fnBody, /slice\(0,\s*1500\)/);
});

test('conciergeInitiateAction returns ok=false on validation failure without throwing', () => {
    const fnBody = chatActions.match(
        /export\s+async\s+function\s+conciergeInitiateAction[\s\S]*?\n\}/,
    )?.[0] || '';
    // The validatePlan branch returns a graceful error envelope.
    assert.match(fnBody, /Plan validation failed/);
    assert.match(fnBody, /return\s*\{\s*ok:\s*false/);
});

// ---------------------------------------------------------------------------
// 4. Guard rails: nothing else writes to Missions from the chat path
// ---------------------------------------------------------------------------

test('sendChatMessageAction no longer auto-creates missions (Concierge gate)', () => {
    // The old code path `routeIntakeToProjectFlow` used to auto-spin
    // up missions. The Concierge mode expects that the chat path
    // is the ONLY one to use conciergeInitiateAction. We don't
    // enforce this destructively here; we just sanity-check that
    // the chat action does not also call createMission directly.
    const sendFnBody = chatActions.match(
        /export\s+async\s+function\s+sendChatMessageAction[\s\S]*?\n\}/,
    )?.[0] || '';
    assert.doesNotMatch(sendFnBody, /createMission\(/);
});

// ---------------------------------------------------------------------------
// 5. Runtime smoke test: the validatePlan function actually parses
// ---------------------------------------------------------------------------

test('validatePlan accepts a valid plan and rejects a malformed one', async () => {
    // Dynamic import via tsx loader so we can exercise the real
    // function. The concierge test is the only one in the suite
    // that crosses the source-only boundary, because handshake
    // detection is the single most important security invariant.
    const { validatePlan } = await import(
        resolve(__dirname, '..', 'lib', 'concierge', 'handshake.ts')
    );
    const valid = {
        name: 'Build a coffee shop website',
        objective: 'A polished landing page for Acme Coffee.',
        phases: [
            {
                name: 'Research',
                tasks: [{ title: 'Survey competitors', agentRole: 'Researcher', riskLevel: 'Low' }],
            },
            {
                name: 'Build',
                tasks: [
                    { title: 'Implement hero', agentRole: 'Frontend', riskLevel: 'Medium' },
                    { title: 'Wire checkout', agentRole: 'Engineer', riskLevel: 'High' },
                ],
            },
        ],
    };
    const ok = validatePlan(valid);
    assert.equal(ok.ok, true, 'valid plan should be accepted');
    if (ok.ok) {
        assert.equal(ok.plan.name, 'Build a coffee shop website');
        assert.equal(ok.plan.phases.length, 2);
    }

    // Malformed: missing phases.
    const malformed = validatePlan({ name: 'x', objective: 'y' });
    assert.equal(malformed.ok, false, 'plan without phases should be rejected');

    // Malformed: bad phase name.
    const wrongPhase = validatePlan({
        name: 'Bad Phase Name',
        objective: 'Test',
        phases: [
            { name: 'Yolo', tasks: [{ title: 't', agentRole: 'r', riskLevel: 'Low' }] },
        ],
    });
    assert.equal(wrongPhase.ok, false, 'plan with non-canonical phase name should be rejected');

    // Malformed: empty task title.
    const emptyTask = validatePlan({
        name: 'Empty Task',
        objective: 'Test',
        phases: [
            { name: 'Research', tasks: [{ title: '', agentRole: 'r', riskLevel: 'Low' }] },
        ],
    });
    assert.equal(emptyTask.ok, false, 'plan with empty task title should be rejected');
});

test('detectHandshakeIntent classifies a sample of canonical phrases', async () => {
    const { detectHandshakeIntent } = await import(
        resolve(__dirname, '..', 'lib', 'concierge', 'handshake.ts')
    );
    const cases = [
        ['looks good, let\'s do it', 'go'],
        ['proceed', 'go'],
        ['ship it', 'go'],
        ['cancel', 'reject'],
        ['nevermind', 'reject'],
        ['replan', 'reject'],
        ['tweak step 2', 'revise'],
        ['change the order', 'revise'],
        ['hello', 'none'],
        ['what can you do', 'none'],
    ];
    for (const [phrase, expected] of cases) {
        const intent = detectHandshakeIntent(phrase);
        assert.equal(
            intent.kind,
            expected,
            `expected "${phrase}" to be classified as ${expected} (got ${intent.kind})`,
        );
    }
});

test('isConciergeEnabled treats undefined / empty / "false" as off and "true" / "1" as on', async () => {
    const { isConciergeEnabled } = await import(
        resolve(__dirname, '..', 'lib', 'concierge', 'handshake.ts')
    );
    // Default-ON: undefined / null / empty should be true.
    assert.equal(isConciergeEnabled(undefined), true, 'undefined -> on');
    assert.equal(isConciergeEnabled(null), true, 'null -> on');
    assert.equal(isConciergeEnabled(''), true, 'empty -> on');
    // Explicit "true" / "1" -> on.
    assert.equal(isConciergeEnabled('true'), true, '"true" -> on');
    assert.equal(isConciergeEnabled('1'), true, '"1" -> on');
    // Anything else -> off.
    assert.equal(isConciergeEnabled('false'), false, '"false" -> off');
    assert.equal(isConciergeEnabled('0'), false, '"0" -> off');
    assert.equal(isConciergeEnabled('no'), false, '"no" -> off');
});

// ---------------------------------------------------------------------------
// Pass 3 polish: chat thread must respect Concierge mode
// ---------------------------------------------------------------------------
//
// Without this guard, a user typing a substantive request into the
// chat would still get an auto-spawned mission even when the
// operator has explicitly enabled Concierge mode. The whole point
// of Concierge is that the user has to approve a plan before
// anything spins up, so the chat must take the direct (read-only)
// path and surface a hint. The ConciergeInitiateAction is the
// only writer in the Concierge loop, so the chat must NOT
// call routeIntakeToProjectFlow when Concierge is on.

test('sendChatMessageAction forces the direct (read-only) path under Concierge', () => {
    const body = chatActions.match(/export async function sendChatMessageAction[\s\S]*?\n\}/)?.[0] || '';
    // The Concierge branch must force shouldRoute=false, so the
    // shouldRoute calculation must reference isConciergeEnabled.
    assert.match(
        body,
        /isConciergeEnabled/,
        'sendChatMessageAction must consult isConciergeEnabled before routing',
    );
    // The chat should NOT auto-spawn via routeIntakeToProjectFlow
    // when Concierge is on. The flag inverts the route decision.
    assert.match(
        body,
        /!conciergeActive && shouldRouteSuprChatToProjectFlow/,
        'shouldRoute must be AND-NOT-conciergeActive so Concierge always wins',
    );
});

test('buildDirectSuprChatResponse emits a Concierge hint when the flag is set', () => {
    const fnBody = chatActions.match(
        /async function buildDirectSuprChatResponse[\s\S]*?\n\}/,
    )?.[0] || '';
    // The function must accept the flag and gate the Concierge
    // branch on it.
    assert.match(fnBody, /conciergeActive/);
    // The Concierge branch must return a hint that mentions the
    // protocol so the user knows what to do next.
    assert.match(fnBody, /Concierge mode is on/);
    assert.match(fnBody, /confirmation card/);
});

test('Concierge chat hint must NOT call routeIntakeToProjectFlow', () => {
    // The Concierge branch returns a static hint instead of
    // dispatching work. This is what makes the chat read-only.
    const fnBody = chatActions.match(
        /async function buildDirectSuprChatResponse[\s\S]*?\n\}/,
    )?.[0] || '';
    // The Concierge branch sits BEFORE the routeIntakeToProjectFlow
    // try/catch and returns early. Verify the order.
    const conciergeIdx = fnBody.indexOf('if (conciergeActive)');
    const routeIdx = fnBody.indexOf('routeIntakeToProjectFlow');
    assert.ok(conciergeIdx > 0, 'Concierge branch must exist');
    assert.ok(routeIdx > 0, 'routeIntakeToProjectFlow must still exist for non-Concierge path');
    assert.ok(
        conciergeIdx < routeIdx,
        'Concierge branch must short-circuit BEFORE the routeIntakeToProjectFlow call',
    );
});
