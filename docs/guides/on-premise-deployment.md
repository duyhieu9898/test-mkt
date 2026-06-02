# On-Premise Deployment Guide

> For customers who need **zero data egress** — 1Person running entirely
> on your own hardware, with your own LLM, inside your own network.
>
> This is the "Data never leaves your infrastructure" promise from the
> landing page made real. After following this guide, nothing about
> your documents, campaigns, or business brain touches OpenAI,
> Anthropic, Google, or 1Person's servers.

---

## What you get

After deployment, a single host runs:

| Service | Purpose |
|---|---|
| **Postgres 16 + pgvector** | All your data. Encrypted at rest if you mount the volume on LUKS. |
| **Redis 7** | Queue + rate-limit buckets. |
| **vLLM** | Open-weights LLM serving the AI. Default: Qwen 2 7B Instruct. |
| **Langfuse** | LLM observability ("Why this output?" trace inspector). |
| **1Person API** | Hono-based backend, same code as cloud version. |
| **1Person Web** | Next.js frontend, same as cloud. |
| **Caddy** | TLS termination + reverse proxy. |

Every inter-service call stays on the `onpremise` Docker bridge
network — no outbound calls to `*.openai.com`, `*.anthropic.com`,
`*.googleapis.com`, or `*.1person.ai`.

---

## Hardware requirements

### Minimum (single-tenant pilot)
- 1× GPU with ≥ 16 GB VRAM (e.g. NVIDIA A10, L4, RTX 4090)
- 8 CPU cores
- 32 GB system RAM
- 200 GB SSD (mostly for LLM weights + Postgres)
- Ubuntu 22.04 LTS or RHEL 9

### Recommended (production, 10-50 active users)
- 1× NVIDIA A100 40GB or H100
- 16 CPU cores
- 64 GB system RAM
- 500 GB NVMe SSD
- Ubuntu 22.04 LTS

### For larger deployments
- Multi-GPU vLLM tensor parallel
- Separate host for Postgres (with encrypted volume)
- External Redis cluster

---

## Prerequisites

1. **Docker 24+** and **Docker Compose v2.23+**
2. **NVIDIA drivers** (525+) and **nvidia-container-toolkit**
   ```bash
   sudo apt install nvidia-container-toolkit
   sudo systemctl restart docker
   ```
3. **Git** to clone the 1Person repo
4. **A hostname** pointed at the deployment host (e.g. `ai.yourcompany.com`)

Verify GPU is visible to Docker:
```bash
docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.3.0-base-ubuntu22.04 nvidia-smi
```
Should print a GPU table.

---

## Step-by-step deployment

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_ORG/1person.git
cd 1person
```

### 2. Configure environment

```bash
cd infrastructure/docker
cp .env.on-premise.example .env
```

Edit `.env` and **change every line marked "MUST CHANGE"**:

```bash
# Generate strong secrets:
openssl rand -base64 32   # For POSTGRES_PASSWORD
openssl rand -base64 16   # For ADMIN_PASSWORD
openssl rand -base64 64   # For JWT_SECRET
openssl rand -base64 64   # For TRUSTAI_KEY_ENCRYPTION_KEY
openssl rand -base64 32   # For LANGFUSE_NEXTAUTH_SECRET
openssl rand -base64 32   # For LANGFUSE_SALT
```

**CRITICAL**: `TRUSTAI_KEY_ENCRYPTION_KEY` encrypts every stored tenant
API key. If you lose it, all BYO keys become unrecoverable. Back it
up to your corporate secret manager immediately.

### 3. Point your domain

Update `Caddyfile`:
```bash
# Replace the `:80, :443` line with your actual domain:
ai.yourcompany.com {
  # ... existing directives ...
}
```

Caddy will automatically fetch a Let's Encrypt certificate on first
boot. If you're in an air-gapped environment, replace with an internal
CA cert + TLS block.

### 4. Pick your LLM model

Default is `Qwen/Qwen2-7B-Instruct` (~14GB VRAM, quality on par with
GPT-3.5 for marketing tasks). Alternatives:

| Model | VRAM | Quality | Notes |
|---|---|---|---|
| `Qwen/Qwen2-7B-Instruct` (default) | 14 GB | ⭐⭐⭐ | Fast, no approval needed |
| `mistralai/Mistral-7B-Instruct-v0.3` | 14 GB | ⭐⭐⭐ | Stable, well-tested |
| `meta-llama/Llama-3.1-8B-Instruct` | 16 GB | ⭐⭐⭐⭐ | Needs HF access approval + `HUGGING_FACE_HUB_TOKEN` |
| `Qwen/Qwen2.5-14B-Instruct` | 28 GB | ⭐⭐⭐⭐ | Best quality for 1 GPU |
| `meta-llama/Llama-3.1-70B-Instruct` (GPTQ) | 40+ GB | ⭐⭐⭐⭐⭐ | Needs A100 40GB or multi-GPU |

Set `VLLM_MODEL=...` in `.env` and `LLM_MODEL=...` in the api service
block if you pick a different model.

### 5. Start the stack

```bash
docker compose -f on-premise.yml --env-file .env up -d
```

First boot takes ~5-15 minutes as vLLM downloads the model weights
(7B = ~14 GB download). Watch progress:
```bash
docker compose -f on-premise.yml logs -f vllm
```

Wait until vLLM logs `Application startup complete` before proceeding.

### 6. Run the database migration

```bash
docker compose -f on-premise.yml exec api \
  pnpm --filter @1person/ai-tenant db:migrate
```

This creates all the `trustai_*` tables (tenants, documents, chunks,
brain, audit log, deployment modes, query history).

### 7. Verify everything is healthy

```bash
# Postgres
docker compose -f on-premise.yml exec postgres pg_isready -U postgres
# → /var/run/postgresql:5432 - accepting connections

# Redis
docker compose -f on-premise.yml exec redis redis-cli ping
# → PONG

# vLLM (the slowest to start)
curl http://localhost:8000/health  # or inside: exec api curl http://vllm:8000/health
# → {"status":"ok"} eventually

# Langfuse
curl https://ai.yourcompany.com/langfuse/api/public/health
# → {"status":"OK"}

# 1Person API
curl https://ai.yourcompany.com/api/v1/health
# → {"status":"ok","timestamp":"..."}
```

### 8. Log in and verify deployment mode

1. Open `https://ai.yourcompany.com` in your browser
2. Log in with the admin credentials from `.env`
3. Navigate to **Settings → Deployment Mode**
4. You should see **On-Premise** selected, with the vLLM URL pointing
   at `http://vllm:8000/v1`

### 9. Run the "does it actually work" smoke test

Create a test company, upload a document, ask a question via the chatbot.
Then check:

```bash
# Verify the query went to vLLM, not OpenAI
docker compose -f on-premise.yml logs api | grep -i "llm"
# → should show vllm base URL, never api.openai.com
```

Check the audit trail integrity:

```bash
curl https://ai.yourcompany.com/api/v1/tenant-ai/public/proof/<company_id>/verify
# → {"valid":true,"entriesChecked":N,"documentsChecked":N}
```

---

## Air-gap hardening (strict deployments)

For truly air-gapped deployments where even the reverse proxy must not
reach the internet:

1. **Disable Caddy auto-TLS**: replace with your internal CA:
   ```caddyfile
   ai.yourcompany.com {
     tls /certs/fullchain.pem /certs/key.pem
     # ... rest
   }
   ```
   Mount `/certs` as a volume.

2. **Pre-pull all Docker images** on a connected host, then `docker
   save` them to a tarball, `scp` to the air-gapped host, `docker
   load`.

3. **Pre-download model weights** to the air-gapped host and mount at
   `/root/.cache/huggingface` inside the vllm container:
   ```yaml
   vllm:
     volumes:
       - /local/path/to/models:/root/.cache/huggingface
   ```

4. **Block all egress at the host firewall**. Only allow inbound
   443/80 from your corporate network. Nothing else.

5. **Confirm no external DNS resolution**:
   ```bash
   docker compose -f on-premise.yml exec api nslookup api.openai.com
   # → should fail
   ```

---

## Backups

The only stateful volume is `postgres_data`. Everything else can be
rebuilt from the repo.

Daily backup script:
```bash
docker compose -f on-premise.yml exec -T postgres \
  pg_dump -U postgres oneperson | gzip > /backups/oneperson-$(date +%F).sql.gz

docker compose -f on-premise.yml exec -T postgres \
  pg_dump -U postgres langfuse | gzip > /backups/langfuse-$(date +%F).sql.gz
```

The tenant file storage (`tenant_data` volume) should also be backed up
if customers upload files:
```bash
docker run --rm -v 1person_tenant_data:/src -v /backups:/dst alpine \
  tar czf /dst/tenant-data-$(date +%F).tar.gz -C /src .
```

---

## Upgrading

```bash
cd 1person
git pull
docker compose -f infrastructure/docker/on-premise.yml --env-file .env build
docker compose -f infrastructure/docker/on-premise.yml --env-file .env up -d
# Run any new migrations
docker compose -f infrastructure/docker/on-premise.yml exec api \
  pnpm --filter @1person/ai-tenant db:migrate
```

---

## Compliance notes

- **Tamper-evident audit**: `trustai_audit_log` uses a blockchain-style
  hash chain. The `/api/v1/tenant-ai/public/proof/:id/verify` endpoint
  recomputes the chain and returns 200 only if every entry is
  untampered. Auditors can verify this without logging in.
- **File integrity**: Every uploaded document has a SHA-256 hash stored
  alongside the file. The `/proof` endpoint also re-hashes files on
  disk and compares.
- **Encryption at rest**: The host should mount the Postgres volume on
  a LUKS-encrypted filesystem. `TRUSTAI_KEY_ENCRYPTION_KEY` encrypts
  stored BYO API keys at application level on top of that.
- **No telemetry**: Langfuse is started with `TELEMETRY_ENABLED=false`.
  The 1Person API has no telemetry of any kind.
- **No outbound LLM calls**: With the default config, `LLM_PROVIDER`
  is set to `openai` with `OPENAI_BASE_URL=http://vllm:8000/v1`.
  The OpenAI SDK is used only as a transport — it talks to your local
  vLLM, not to `api.openai.com`.

---

## Troubleshooting

### "vLLM container is unhealthy"
Check GPU visibility: `docker compose exec vllm nvidia-smi`.
If that fails, reinstall `nvidia-container-toolkit` and restart Docker.

### "OOM killed" during model load
Your GPU doesn't have enough VRAM. Switch to a smaller model (e.g.
Qwen 2 1.5B for testing on a 4-6GB GPU).

### "Postgres can't connect"
Check password in `.env` matches what Postgres was initialized with.
If you changed the password after first boot, you need to recreate
the `postgres_data` volume.

### "Langfuse won't start"
The `langfuse` database must exist before Langfuse boots. The
`init-databases.sh` script creates it on first Postgres boot. If you
skipped it, manually create:
```bash
docker compose exec postgres psql -U postgres -c "CREATE DATABASE langfuse;"
docker compose restart langfuse
```

### "Audit verify returns valid:false"
Something actually tampered with the audit log. This is DESIGNED to
fail loudly. Investigate which entry broke by looking at
`brokenAtEntry` in the response and correlating with your system logs.

---

## Support

Enterprise on-premise customers get dedicated support. Reach out to
your account contact. Community edition: open an issue on the GitHub
repo.
