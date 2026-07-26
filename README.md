# Archimedes Assistant MCP

A read-only Model Context Protocol server for Archimedes Market. It gives
Claude, Cursor, Copilot, and other MCP clients four tools:

- `search_assets`
- `get_asset`
- `search_bounties`
- `get_bounty`

The server uses Archimedes' public, unauthenticated endpoints. It never asks
for an Archimedes username, password, session, or API key.

## Requirements

- Node.js 20 or newer
- npm

The optional context-ranking service requires Python 3.11 and TensorFlow.

## Install and run

```bash
npm install
npm run build
npm start
```

You can also run the package directly after it has been packed or published:

```bash
npx archimedes-assistant-mcp
```

The MCP protocol uses standard input and output. Logs and startup failures go
to standard error so they do not corrupt the protocol stream.

For a hosted Streamable HTTP endpoint:

```bash
npm run start:http
```

The endpoint is available at `http://127.0.0.1:3000/mcp`, with a health check
at `/health`.

## MCP client configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "archimedes": {
      "command": "npx",
      "args": ["-y", "archimedes-assistant-mcp"]
    }
  }
}
```

### Cursor

Add the same server definition to Cursor's MCP settings. Use `npx` as the
command and `-y`, `archimedes-assistant-mcp` as the arguments.

### VS Code and Copilot

Add a standard-input MCP server whose command is:

```text
npx -y archimedes-assistant-mcp
```

The tools are client-neutral and do not contain model-specific logic.

## Examples

- “Search Archimedes assets for Python.”
- “Show open hardware bounties worth at least $100.”
- “Get asset `1878153b-096a-486e-ac6b-7197346bdff2`.”
- “Explain the requirements for bounty
  `5586f0c8-cde1-416c-ac28-d85bc6a264f0`.”

Prices returned by `search_assets` are in US dollars. Bounty prices use
`price_cents` and include a `currency` field.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ARCHIMEDES_API_URL` | `https://archimedes.market` | Public Archimedes base URL |
| `ARCHIMEDES_TIMEOUT_MS` | `10000` | Per-request timeout, from 100 to 120000 ms |
| `ARCHIMEDES_CONTEXT_URL` | unset | Optional Flask/TensorFlow ranking service |
| `MCP_HOST` | `127.0.0.1` | Bind address for Streamable HTTP |
| `MCP_ALLOWED_HOSTS` | unset | Allowed hostnames for non-loopback HTTP |

If the optional ranking service is unreachable, searches still return the
order supplied by Archimedes.

## Optional Flask and TensorFlow service

The service ranks the small result set returned by Archimedes against the
user's query. It does not accept credentials and has no write endpoint.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
python python/app.py
```

Then start the MCP server with:

```bash
ARCHIMEDES_CONTEXT_URL=http://127.0.0.1:8080 npm start
```

Docker is also supported:

```bash
docker compose up --build
```

### Render

The included `render.yaml` deploys the Streamable HTTP server as a free Render
web service. Render supplies `PORT` and `RENDER_EXTERNAL_HOSTNAME`
automatically; the server binds to the assigned port and permits only that
hostname. Set the service health check to `/health`. The public MCP endpoint is
`https://<service-name>.onrender.com/mcp`.

The reference deployment is available at
`https://archimedes-assistant-mcp.onrender.com/mcp`, with its health check at
`https://archimedes-assistant-mcp.onrender.com/health`.

The free instance may sleep after inactivity. Its first request after sleeping
can take longer while the instance starts.

### AWS

For existing AWS App Runner customers, the repository also contains two App
Runner definitions:

- `deploy/aws-mcp-apprunner.yaml` deploys the Streamable HTTP MCP server.
- `deploy/aws-context-apprunner.yaml` deploys the TensorFlow context ranker.

Build the root `Dockerfile` for the MCP service and `python/Dockerfile` for the
ranker, push both images to Amazon ECR, and deploy the ranker first. Pass its
HTTPS URL as `ContextRankerUrl` when deploying the MCP service. Set
`AllowedHosts` to the custom hostname clients will use. External binding fails
closed when no allowed hostname is configured. AWS stopped opening App Runner
to new customers in 2026; new deployments should use Render, ECS, Azure
Container Apps, or another container service.

## Verification

```bash
npm test
npm run check
npm run build
npm run test:live
```

The live test starts the MCP server and exercises all four tools against the
public Archimedes service. The unit tests use local responses and do not need
network access.

To test the Python component:

```bash
cd python
python -m unittest -v test_app.py
```

## Error handling

Network operations time out instead of hanging. Rate-limit responses and
temporary server errors are retried with bounded exponential backoff. Tool
failures are returned as MCP errors with concise messages. Search limits,
identifiers, price ranges, and query lengths are validated before any request
is sent.

## Security and privacy

- Every tool is read-only.
- No user authentication or payment information is read or stored.
- Requests are limited to the configured Archimedes base URL and optional
  context-ranking URL.
- Result sizes and request durations are bounded.
- The package contains no analytics, advertising, or telemetry.

## License

MIT
