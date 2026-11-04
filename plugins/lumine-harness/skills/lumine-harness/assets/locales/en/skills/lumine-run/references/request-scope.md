## Current request scope

Check the current scope for each new user request; automatic continuation, Hook retries and recovery of that request reuse it. A request is not a persistent task and does not create product documents. Continue the same feature or change direction in the existing Spec/Plan, preserving taskId, progress and applicable confirmations; reassess only affected scope.

Use trusted host/session identity and public commands; never edit session JSON manually:

```text
./.lumine/cli session show --product <host> --session-id <session> --json
./.lumine/cli session begin --product <host> --session-id <session> --mode <mode> --request-id <stable-request-key> [--task <existing-task-id>] --json
./.lumine/cli session begin --product <host> --session-id <session> --resume --json
```

Modes are plan, implement, verify, diagnose or check. Runtime uses a reliable host userTurnId when available; otherwise the Agent chooses a stable request-id for this request and reuses it on retries, rather than generating a key per tool call. A new request may reference the same task. Discussion and independent read-only checks need no persistent task or Spec/Plan; local scope bookkeeping grants no implementation authority. Unknown scope cannot silently pass. Implementation still requires a matching task and actual evidence. The same scope cannot downgrade implementation to read-only to bypass validation; a new independent read-only request does not recheck old implementation evidence. Users need not run these commands themselves.

Late-event and replay protection uses observable host identity, never prompt-text guesses. Each session retains up to 128 retired request-ID hashes, the current request's 128 latest handled stable Stop response/emission hashes, and the 128 latest retired Stop hashes. These records contain no prompt or response text. A retired request, retired response, or older Stop superseded by a newer response cannot reset the current scope, write its report, or request another continuation. Retrying the latest response in the current request reuses its existing result.

After request-ID history exceeds the window, a Stop with an unknown userTurnId cannot prove that it is a new request. The Runtime preserves current state and reports REQUEST_HISTORY_BOUNDARY; establish the request through a real user-initiated event, or use a new real host session when that host exposes no such event. Without reliable turn/response identifiers, or with only a response identifier outside the retention window, the Runtime cannot identify cross-request late events. An Agent request-id is not host identity. Tests and compatibility reports must disclose this limit rather than claim universal cross-request replay coverage. Unknown-scope, implementation-binding, and validation gates remain in force.

Response identifiers detect replay only when an event actually supplies a report. An older response association on a new prompt, ordinary progress, or a reportless continuation event is not itself a replayed report; current userTurnId and matching continuation receipts determine attribution. A reportless Stop still requires a fresh structured report for the current request, otherwise it is rejected for the missing report.
