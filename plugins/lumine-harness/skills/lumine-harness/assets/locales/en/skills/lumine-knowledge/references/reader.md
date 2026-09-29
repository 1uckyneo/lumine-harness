# Start, restart, and stop the Wiki reader

Use this reference when the user asks to open the knowledge base or start, restart, or stop its reader. Reading Markdown, querying knowledge, and maintaining text do not require a server. Opening the reader does not initiate knowledge generation or a whole-library update.

## Requirements and project ownership

Lumine installs the reader and its bundled dependencies. Running it requires Node.js 18 or later and a modern browser; no npm install, model connection, or business service is needed. Use the confirmed Harness root and its `.lumine/cli` to resolve the correct Runtime. The nearest Git root in a business subrepository may be wrong. Ordinary adopted projects can also run `node .lumine/wiki.mjs serve` without the Bash wrapper; source-repository self-use should use its own `.lumine/cli`.

Inspect the current session's process handles, startup logs, and listening sockets as needed. Establish that a service belongs to this Harness root before reusing or stopping it:

- Prefer the process handle and explicit startup root recorded in this session.
- For a process from another session, verify its PID, command, `--root` or working directory, and listening address. Recheck immediately before signaling it to guard against PID reuse.
- A port, HTTP 200, or repository IDs from `/api/config` are supporting clues, not unique proof of ownership. The current Runtime has no reader-specific PID registry or `status/stop/restart` commands.
- Do not terminate an unidentified process. An open request can use another free port; a stop or restart request should explain the identification gap and request the original terminal or startup details.

## Open or start

Reuse an accessible reader belonging to the current project. If a new process is needed, run from the Harness root:

```bash
./.lumine/cli wiki serve --root "$PWD"
```

The default listener is `127.0.0.1:4318`. If another project occupies that port, leave its process alone and select a free port, such as `--port 4319`. Alternatively, use `--port 0` for an OS-assigned port. Always use the URL actually returned by the command. Quote paths containing spaces.

Run the foreground service in a terminal or process session that the host can keep alive. Retain its handle, project root, and returned address for later operations. If the host cannot keep it alive across turns, explain that limitation and provide a command the user can keep running; do not promise a persistent service from a temporary process. Do not add system startup entries or a daemon by default.

Confirm the process is alive, its returned address responds, and `/api/config` or the catalog matches the expected project. Open that address with an available browser tool, or return a clickable link if opening is unavailable. An HTTP probe establishes reachability, not successful diagram rendering or UI behavior. Preserve loopback-only listening.

## Stop

For a service started in this session, prefer sending `Ctrl+C` to its original terminal. Alternatively, send `SIGTERM` to a PID whose ownership has just been verified and wait for exit. If no relevant process exists, report it as already stopped. Do not kill all processes using a port, run `pkill node`, or default to `kill -9`.

Confirm the target process exited. If the port still responds, identify its current owner rather than stopping another process. Closing a browser tab does not stop the server. Stopping the server does not delete body text, indexes, maintenance state, or logs.

## Restart

Record the root and actual port, stop the identified service as above, confirm exit, and launch it with the same configuration. If the requested port becomes occupied, preserve its owner and report the conflict or choose another port. With `--port 0`, the new address may change. Recheck the service and provide its final URL.

Body-text changes normally need only a page refresh. Restart after changing Runtime or configuration read at startup. Reader static-file updates normally need a refresh; restart if the installation layout changes. Do not describe refreshing a browser page as restarting the service.

## Results and failures

Briefly report whether the service was reused, started, restarted, or stopped, together with the project, actual address, and relevant limitations. Explain missing Node, missing assets, port conflicts, or insufficient permissions with a concrete next step. Repair missing assets through Lumine maintenance rather than loading replacements from a CDN. Preserve existing materials and report unsuccessful stop or restart attempts accurately.
