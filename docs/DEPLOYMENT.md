# 1Person AI Company OS - Production Deployment Guide

**Domain:** `https://1person.bap-software.net`  
**Stack:** Next.js + Hono API + PostgreSQL + Redis + Nginx  

---

## Architecture Overview

```
Internet
    |
    v
[Nginx :443]  (SSL termination, reverse proxy, rate limiting)
    |
    +---> [Web :3004]   Next.js frontend (SSR)
    +---> [API :8004]   Hono API backend
              |
              +---> [PostgreSQL :5432]  (pgvector)
              +---> [Redis :6379]       (cache, job queue)
```

---

## Prerequisites

- **Server:** Ubuntu 22.04+ / any Linux with Docker
- **Docker:** v24+ with Docker Compose v2
- **Domain:** `1person.bap-software.net` pointing to server IP
- **RAM:** Minimum 4GB (recommended 8GB)
- **Storage:** Minimum 20GB SSD

---

## Step-by-Step Deployment

### 1. Clone Repository

```bash
ssh user@your-server
git clone https://github.com/your-org/1person.git /opt/1person
cd /opt/1person
git checkout main
```

### 2. Configure Environment

```bash
# Copy production template
cp .env.production .env

# Edit and fill in all CHANGE_ME values
nano .env
```

**Required changes in `.env`:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_PASSWORD` | PostgreSQL password | `Str0ng_P@ssw0rd_2025!` |
| `REDIS_PASSWORD` | Redis password | `redis_secure_pass_2025` |
| `JWT_SECRET` | Random 64-char string | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Admin login password | `Admin_Pr0d_2025!` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-xxx` |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional) | `sk-ant-xxx` |

Generate JWT secret:
```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" 
```

### 3. SSL Certificate (Let's Encrypt)

**First time setup** (before starting nginx):

```bash
# Create temporary nginx for ACME challenge
docker compose -f docker-compose.prod.yml up -d nginx

# Get certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d 1person.bap-software.net \
  --email devops@bap-software.net \
  --agree-tos --no-eff-email

# Restart nginx with SSL
docker compose -f docker-compose.prod.yml restart nginx
```

**Alternative (if DNS is available before deployment):**

Comment out the SSL lines in `infrastructure/nginx/nginx.conf` temporarily, start with HTTP only, get cert, then enable SSL.

### 4. Build & Start All Services

```bash
# Build all images
docker compose -f docker-compose.prod.yml build

# Start all services (detached)
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

### 5. Database Migration

```bash
# Run inside API container
docker compose -f docker-compose.prod.yml exec api \
  npx drizzle-kit push

# Or if using migration files:
docker compose -f docker-compose.prod.yml exec api \
  npx drizzle-kit migrate
```

### 6. Verify Deployment

```bash
# Health check
curl https://1person.bap-software.net/health

# Expected: {"status":"ok","timestamp":"..."}

# Check logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```

### 7. Admin Login

The admin account is **auto-created** on first API start:

- **URL:** `https://1person.bap-software.net/login`
- **Email:** Value of `ADMIN_EMAIL` in `.env` (default: `admin@1person.ai`)
- **Password:** Value of `ADMIN_PASSWORD` in `.env`
- **Admin Panel:** `https://1person.bap-software.net/admin`

The admin can:
- Approve/reject new user registrations
- Create and publish blog posts
- Manage system settings

---

## Operational Commands

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f postgres
```

### Restart Services

```bash
# Restart all
docker compose -f docker-compose.prod.yml restart

# Restart specific
docker compose -f docker-compose.prod.yml restart api
```

### Update / Deploy New Version

```bash
cd /opt/1person

# Pull latest code
git pull origin main

# Rebuild and restart (zero downtime)
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d api web

# Run migrations if needed
docker compose -f docker-compose.prod.yml exec api npx drizzle-kit push
```

### Database Backup

```bash
# Backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres oneperson > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
cat backup_file.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres oneperson
```

### SSL Certificate Renewal

Certbot auto-renews via the running container. Manual renewal:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml restart nginx
```

---

## Service Ports (Internal Only)

| Service | Internal Port | External Access |
|---------|---------------|-----------------|
| Nginx | 80, 443 | Public (internet) |
| Web (Next.js) | 3004 | localhost only |
| API (Hono) | 8004 | localhost only |
| PostgreSQL | 5432 | localhost only |
| Redis | 6379 | localhost only |

> Only Nginx is exposed to the internet. All other services bind to `127.0.0.1`.

---

## Security Checklist

- [ ] All `CHANGE_ME` values in `.env` replaced with strong passwords
- [ ] `JWT_SECRET` is a random 64-character hex string
- [ ] `DB_PASSWORD` is strong (16+ chars, mixed case, numbers, symbols)
- [ ] `.env` file permissions: `chmod 600 .env`
- [ ] API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) are set
- [ ] SSL certificate is active (`https://` works)
- [ ] Firewall: only ports 80, 443, 22 open
- [ ] Admin password changed from default after first login
- [ ] PostgreSQL not exposed to internet (bound to 127.0.0.1)
- [ ] Redis requires password

---

## Monitoring

### Health Endpoints

- **API:** `GET /health` -> `{"status":"ok"}`
- **Web:** Load `https://1person.bap-software.net` in browser

### Docker Health Status

```bash
docker compose -f docker-compose.prod.yml ps
# All services should show "healthy" or "running"
```

### Disk Usage

```bash
docker system df
df -h /var/lib/docker
```

---

## Troubleshooting

### API won't start
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs api

# Common: DATABASE_URL wrong, DB not ready
# Fix: Check .env, wait for postgres health check
```

### "502 Bad Gateway"
```bash
# Check if backend services are running
docker compose -f docker-compose.prod.yml ps

# Restart
docker compose -f docker-compose.prod.yml restart api web nginx
```

### Database connection refused
```bash
# Check postgres is running
docker compose -f docker-compose.prod.yml logs postgres

# Check DATABASE_URL matches DB_USER/DB_PASSWORD
```

### SSL certificate errors
```bash
# Check cert exists
ls infrastructure/nginx/ssl/live/1person.bap-software.net/

# Re-issue
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d 1person.bap-software.net \
  --force-renewal
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `production` | Environment mode |
| `DB_USER` | Yes | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | **Yes** | - | PostgreSQL password |
| `DB_NAME` | Yes | `oneperson` | Database name |
| `DATABASE_URL` | Yes | - | Full PostgreSQL connection string |
| `REDIS_PASSWORD` | Yes | - | Redis password |
| `REDIS_URL` | Yes | - | Full Redis connection string |
| `JWT_SECRET` | **Yes** | - | JWT signing secret (64+ chars) |
| `JWT_EXPIRES_IN` | No | `7d` | JWT token expiry |
| `ADMIN_EMAIL` | No | `admin@1person.ai` | Admin account email |
| `ADMIN_PASSWORD` | **Yes** | - | Admin account password |
| `WEB_URL` | Yes | - | Public URL of the web app |
| `NEXT_PUBLIC_API_URL` | Yes | - | Public URL of the API |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for AI features |
| `ANTHROPIC_API_KEY` | No | - | Anthropic API key (optional) |
| `FTUX_AI_PROVIDER` | No | `openai` | AI provider for onboarding |
| `FTUX_AI_MODEL` | No | `gpt-4o-mini` | AI model for onboarding |

---

*Last updated: 2025-04-06*
