# Supr Capability Evaluations

Supr is evaluated against observable task outcomes, not competitor source code
or internal architecture.

Required production scenarios:

1. Inspect a repository, modify code, run tests, and return evidence.
2. Research through the browser and produce source-backed structured output.
3. Execute scheduled unattended work through Cloud Scheduler and Cloud Tasks.
4. Recover from an unavailable integration without corrupting the session.
5. Pause an irreversible action for approval and resume it exactly once.
6. Resume a leased execution after worker termination.
7. Complete a Telegram request and send its verified result.

Each evaluation records its execution ID, session ID, tool invocations,
evidence, approval decisions, final status, duration, and cost.

Local release evidence is produced by:

```text
npm run test:prod
npm run test:postgres
terraform fmt -check -recursive
terraform validate
git diff --check
```

External acceptance evidence must include the staging project, execution IDs,
Cloud Run revision IDs, and timestamps for every scenario. Local passing tests
do not replace the required staging drills or 48-hour soak.
