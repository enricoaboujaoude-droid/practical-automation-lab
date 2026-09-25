# n8n Outcome Reconciler

**Owned and maintained by Practical Automation Lab.** Live browser tool: https://n8n-outcome-reconciler.roroabja.chatgpt.site

A zero-cost, browser-local MVP for detecting successful n8n executions that failed their intended business outcome.

## Job to be done

Import a workflow export and execution JSON, define the terminal outcome contract, and identify:

- successful runs that never reached the terminal node;
- successful runs below a minimum output count;
- missing side-effect receipts such as message or order IDs;
- failed/running executions;
- overdue workflows based on expected cadence.

No files leave the browser. There is no backend, account, tracking script, API, build step, or dependency.

## Use

Open `index.html` in a modern browser. Import the files in `samples/` to see one valid run and one green-but-wrong run. Set:

- Terminal node: `Send Report`
- Minimum terminal items: `1`
- Receipt path: `json.messageId`
- Cadence: `24`

Generate the report and optionally download it as JSON.

## Verification

Run:

```bash
node --test test/reconciler.test.js
```

## Success event

The MVP succeeds when a user imports real n8n evidence and generates a reconciliation report. A local-only counter records completed reports in browser `localStorage`; no telemetry is sent anywhere.

## Scope boundary

This MVP deliberately does not connect to live n8n instances, retain uploads, provide generic security linting, add billing, or require hosting. Live-instance polling and CI/team policy packs remain gated on real usage.
