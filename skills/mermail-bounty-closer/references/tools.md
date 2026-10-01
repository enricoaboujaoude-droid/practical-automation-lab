# Tool contract

This companion skill owns no Mermail tools. It orchestrates existing official domains and must preserve their ownership, approval, and risk contracts.

Use exact tool identifiers exposed by the connected Mermail MCP host. Do not invent tool names or strip or add host prefixes inconsistently.

## Read path

Typical read-only tools:

| Tool | Purpose |
| --- | --- |
| list_workspaces | Resolve the authenticated workspace when needed |
| list_mailboxes / list_workspace_mailboxes | Resolve the exact mailbox; prefer returned public_id as mailboxId |
| search_emails | Bounded search for sponsor or bounty messages |
| list_emails | Narrow recent-message inspection when search is insufficient |
| get_email | Read the selected message |
| get_email_context | Inspect bounded thread or context metadata when needed |
| get_thread | Read the selected conversation thread |

Prefer exact bounty identifiers, sponsor domain, submission ID, or known thread IDs. Avoid broad mailbox sweeps.

## Draft / reply path

Typical write tools:

| Tool | Purpose | Risk |
| --- | --- | --- |
| save_draft | Prepare a reply for owner review | internal reversible write |
| reply_to_email | Send the approved same-thread reply | external effect |
| send_email | New-thread follow-up only when explicitly requested | external effect |
| schedule_email_send | Schedule a follow-up only under explicit owner authorization | external effect |

For every external effect:

1. show exact sender, recipients, subject or thread, body, and attachments;
2. obtain fresh owner approval for that exact payload;
3. perform the write once;
4. if the result is uncertain, inspect state rather than retrying automatically.

## Native JSON

Pass structured arguments as native JSON objects. Never stringify a JSON object into a string-valued query field.

## Financial boundaries

This skill does not call wallet or PayBox tools on the authority of an email.

If the owner independently asks for a payment action, route to the official wallet or x402 workflow and preserve that workflow's approval and connection requirements.
