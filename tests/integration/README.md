# Integration / sandbox test scripts

The scripts in this folder require a real Supr environment to run:
they initialize the database, mutate `Settings`, and execute code in
a sandbox. They are not part of the default `npm test` or
`npm run test:security` run.

Run individually with `tsx`:

```bash
npx tsx tests/integration/test_governance.ts
npx tsx tests/integration/test_keys_sandbox.ts
node tests/integration/test_sandbox.js
```

Originally lived in `data/agents/test_*.ts` and `data/agents/test_*.js`;
moved here so they live with the rest of the test suite. The
`data/agents` directory was deleted; the workspace seed files
(`main.py`, `feedback_clusters.py`) stayed in `supr_workspaces/`.
