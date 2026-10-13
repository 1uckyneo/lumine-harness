# Project service extensions

Inspect real launch entry points, scripts, existing Skills, ports, and health checks during adoption. Reuse project capabilities first; generate a shared project extension when routine service operations are needed and missing. Do not assume a language, framework, package manager, port, or OS. Business services, the Wiki reader, databases, MCP, containers, and deployment are not one default action.

Document the contract needed for this project:

| Item | Required clarity |
| --- | --- |
| Triggers and targets | Natural-language actions mapped to a service and start/restart/stop/status. Resolve ambiguity from context without operating unrelated services. |
| Launch facts | Repository-relative cwd, real command, existing tools and configuration variable names, precedence, health check, and startup side effects. Never store secret values. |
| Instance ownership | Evidence permitting reuse or stop; recheck process identity before stopping. Report unknown port owners rather than killing by process name or port. |
| Lifecycle | Query a starting instance rather than creating duplicates. Give actionable failure steps and protect controlled instances from concurrent writes or interrupted recovery. |
| Local state | Keep state, logs, and nonsecret recovery parameters in ignored local storage. Verify project identity and provenance; never execute arbitrary commands from records. |
| Authorization and acceptance | Tool installation, configuration, data migration, and deployment follow actual authorization. Another project's global-install permission is not inherited. Separate listener/health readiness from login and business acceptance. |

Use existing scripts, a CLI, or a lightweight manager according to real needs without expanding into a generic framework. Executable content stays in the extension; the Wiki operation guide explains and links it, with a short root AGENTS entry. Verify reuse, ownership, conflicts, failed startup, stop boundaries, and actual lifecycle on applicable platforms. Simulations or static checks are not real-machine evidence. If the environment is insufficient, retain usable entry points and state unverified scope.
