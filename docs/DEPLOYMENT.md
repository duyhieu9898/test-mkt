# 1Person AI Company OS - Production Deployment Guide

**Domain:** `https://1person.bap-software.net`
**Repository:** `https://gitlab-new.bap.jp/BAP-GROUP/1person`
**Stack:** Next.js 14 + Hono API + PostgreSQL 16 (pgvector) + Redis 7 + Nginx

---

## 1. Architecture

```
                        Internet
                           |
                     [Firewall: 80, 443, 22]
                           |
                    ┌──────┴──────┐
                    │  Nginx :443 │  SSL termination, reverse proxy, rate limiting
                    └──────┬──────┘
                           |
              ┌────────────┴────────────┐
              |                         |
     ┌────────┴────────┐      ┌────────┴────────┐
     │  Web :3004      │      │  API :8004      │
     │  Next.js SSR    │      │  Hono (Node.js) │
     │  Landing page   │      │  REST API       │
     │  Admin CMS      │      │  Auth + RBAC    │
     │  Dashboard      │      │  AI Agents      │
     └─────────────────┘      └────────┬────────┘
                                       |
                          ┌────────────┴────────────┐
                          |                         |
                 ┌────────┴────────┐      ┌────────┴────────┐
                 │ PostgreSQL :5432│      │  Redis :6379    │
                 │ pgvector        │      │  Cache + Queue  │
                 │ 32 tables       │      │  BullMQ workers │
                 └─────────────────┘      └─────────────────┘
```

**All services run as Docker containers. Only Nginx is exposed to the internet.**

---

## 2. Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Docker | v24+ | v27+ |
| Docker Compose | v2.20+ | v2.30+ |
| RAM | 4GB | 8GB |
| Storage | 20GB SSD | 50GB SSD |
| CPU | 2 cores | 4 cores |

**DNS:** `1person.bap-software.net` A record pointing to server IP.

---

## 3. Deployment Steps

### Step 1: Server Setup

```bash
# SSH into server
ssh user@your-server-ip

# Install Docker (if not installed)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change

# Verify
docker --version
docker compose version
```

### Step 2: Clone Repository

```bash
# Clone from GitLab
git clone https://gitlab-new.bap.jp/BAP-GROUP/1person.git /opt/1person
cd /opt/1person

# Checkout the release branch
git checkout develop
```

### Step 3: Configure Environment

```bash
# Copy production template
cp .env.production .env

# Generate secure passwords
echo "=== Copy these values into .env ==="
echo "DB_PASSWORD=$(openssl rand -base64 24)"
echo "REDIS_PASSWORD=$(openssl rand -base64 24)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "ADMIN_PASSWORD=$(openssl rand -base64 16)"
```

Edit `.env` and replace ALL `CHANGE_ME` values:

```bash
nano .env
```

**Required values to change:**

| Variable | What to set | How to generate |
|----------|-------------|-----------------|
| `DB_PASSWORD` | Strong PostgreSQL password | `openssl rand -base64 24` |
| `DATABASE_URL` | Must match DB_PASSWORD | `postgresql://postgres:YOUR_DB_PASSWORD@postgres:5432/oneperson` |
| `REDIS_PASSWORD` | Strong Redis password | `openssl rand -base64 24` |
| `REDIS_URL` | Must match REDIS_PASSWORD | `redis://:YOUR_REDIS_PASSWORD@redis:6379` |
| `JWT_SECRET` | 64-char random hex | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Admin login password | Choose strong password |
| `OPENAI_API_KEY` | OpenAI API key | Get from platform.openai.com |

**Lock file permissions:**
```bash
chmod 600 .env
```

### Step 4: SSL Certificate (Let's Encrypt)

**Option A: Automatic (recommended)**

First, temporarily allow HTTP-only nginx. Create a minimal nginx config:

```bash
# Start postgres + redis first (nginx needs them indirectly)
docker compose -f docker-compose.prod.yml up -d postgres redis

# Start nginx for ACME challenge
docker compose -f docker-compose.prod.yml up -d nginx

# Request certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d 1person.bap-software.net \
  --email devops@bap-software.net \
  --agree-tos --no-eff-email

# Verify certificate
ls infrastructure/nginx/ssl/live/1person.bap-software.net/

# Stop nginx (will restart with full stack)
docker compose -f docker-compose.prod.yml down
```

**Option B: Use existing certificate**

If you already have SSL certs, copy them:
```bash
mkdir -p infrastructure/nginx/ssl/live/1person.bap-software.net/
cp /path/to/fullchain.pem infrastructure/nginx/ssl/live/1person.bap-software.net/
cp /path/to/privkey.pem infrastructure/nginx/ssl/live/1person.bap-software.net/
```

### Step 5: Build & Start

```bash
# Build all Docker images (first time takes ~5 min)
docker compose -f docker-compose.prod.yml build

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Watch startup logs
docker compose -f docker-compose.prod.yml logs -f
# Wait until you see:
#   1person-api: "🚀 AI Company OS API"
#   1person-api: "✅ Admin account created: admin@1person.ai"
#   1person-web: "✓ Ready"
# Press Ctrl+C to exit logs
```

### Step 6: Database Setup

```bash
# Push schema to database (creates all 33 tables)
docker compose -f docker-compose.prod.yml exec api npx drizzle-kit push

# When prompted about table creation, select "Yes"
```

### Step 7: Verify

```bash
# 1. Health check
curl https://1person.bap-software.net/health
# Expected: {"status":"ok","timestamp":"..."}

# 2. Landing page
curl -s -o /dev/null -w "%{http_code}" https://1person.bap-software.net
# Expected: 200

# 3. API
curl https://1person.bap-software.net/api/v1/health
# Expected: {"status":"ok"}

# 4. Check all containers are running
docker compose -f docker-compose.prod.yml ps
# All should show "Up" or "healthy"
```

---

## 4. Admin Access

### First Login

Admin account is **auto-created** on first API startup.

| Field | Value |
|-------|-------|
| URL | `https://1person.bap-software.net/login` |
| Email | `admin@1person.ai` (or `ADMIN_EMAIL` in .env) |
| Password | Value of `ADMIN_PASSWORD` in .env |
| Admin Panel | `https://1person.bap-software.net/admin` |

### Admin CMS Features

The admin panel at `/admin` is a full CMS with:

| Section | Path | Description |
|---------|------|-------------|
| Dashboard | `/admin` | System overview: users, companies, blog stats |
| SEO & Metadata | `/admin/seo` | Page title, meta description, keywords (4 languages) |
| Navigation | `/admin/navigation` | Menu links, CTA buttons (4 languages) |
| Hero Section | `/admin/hero` | Landing page hero content (4 languages) |
| Features | `/admin/features` | Feature cards content (4 languages) |
| Security | `/admin/security` | Trust/security section (4 languages) |
| Call to Action | `/admin/cta` | CTA section content (4 languages) |
| Footer | `/admin/footer` | Footer links & developer info (4 languages) |
| Users | `/admin/users` | User management: approve, reject, change roles |
| Companies | `/admin/companies` | Company management: activate, pause, archive |
| Blog Posts | `/admin/blog` | Create, edit, publish blog articles for SEO |
| Settings | `/admin/settings` | AI performance level, agent behavior |

**Supported languages:** English, Japanese (日本語), Vietnamese (Tiếng Việt), Korean (한국어)

### User Registration Flow

1. User registers at `/register`
2. Account created with status `pending`
3. Admin approves/rejects at `/admin/users`
4. User can login only after approval

---

## 5. Service Ports

| Service | Container | Internal Port | External |
|---------|-----------|---------------|----------|
| Nginx | 1person-nginx | 80, 443 | Public |
| Next.js | 1person-web | 3004 | 127.0.0.1 only |
| Hono API | 1person-api | 8004 | 127.0.0.1 only |
| PostgreSQL | 1person-postgres | 5432 | 127.0.0.1 only |
| Redis | 1person-redis | 6379 | 127.0.0.1 only |

---

## 6. Operational Commands

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api --tail=100
docker compose -f docker-compose.prod.yml logs -f web --tail=100
docker compose -f docker-compose.prod.yml logs -f postgres --tail=100
```

### Restart

```bash
# Restart all
docker compose -f docker-compose.prod.yml restart

# Restart single service
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart web
```

### Stop / Start

```bash
# Stop all (data preserved in volumes)
docker compose -f docker-compose.prod.yml down

# Start all
docker compose -f docker-compose.prod.yml up -d
```

---

## 7. Update / New Release

```bash
cd /opt/1person

# 1. Pull latest code
git pull origin develop

# 2. Rebuild changed images
docker compose -f docker-compose.prod.yml build api web

# 3. Rolling restart (minimal downtime)
docker compose -f docker-compose.prod.yml up -d api web

# 4. Run migrations (if schema changed)
docker compose -f docker-compose.prod.yml exec api npx drizzle-kit push

# 5. Verify
curl https://1person.bap-software.net/health
```

---

## 8. Database Backup & Restore

### Backup

```bash
# One-time backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres oneperson > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres oneperson | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Automated Daily Backup (cron)

```bash
# Add to crontab
crontab -e

# Add this line (backup at 2:00 AM daily, keep 30 days)
0 2 * * * cd /opt/1person && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres oneperson | gzip > /opt/backups/1person_$(date +\%Y\%m\%d).sql.gz && find /opt/backups -name "1person_*.sql.gz" -mtime +30 -delete
```

### Restore

```bash
# From SQL file
cat backup_file.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres oneperson

# From gzipped file
gunzip -c backup_file.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres oneperson
```

---

## 9. SSL Certificate

### Auto-renewal

The `certbot` container auto-renews certificates every 12 hours. No manual action needed.

### Manual Renewal

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml restart nginx
```

### Check Expiry

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certificates
```

---

## 10. Security Checklist

### Before Go-Live

- [ ] All `CHANGE_ME` values in `.env` replaced
- [ ] `JWT_SECRET` is random 64-char hex string
- [ ] `DB_PASSWORD` is strong (16+ chars, mixed)
- [ ] `ADMIN_PASSWORD` is strong
- [ ] `.env` permissions: `chmod 600 .env`
- [ ] `OPENAI_API_KEY` is set
- [ ] SSL certificate active (https:// works)
- [ ] Admin password changed after first login

### Server Hardening

- [ ] Firewall: only ports 80, 443, 22 open
- [ ] SSH: key-only auth, no root login
- [ ] PostgreSQL bound to 127.0.0.1 (not public)
- [ ] Redis requires password
- [ ] Docker volumes on encrypted disk (optional)
- [ ] Automated backups configured

### Nginx Security Headers (pre-configured)

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Rate Limiting (pre-configured)

- API: 30 requests/second per IP
- Auth endpoints: 5 requests/second per IP (brute-force protection)

---

## 11. Monitoring

### Health Checks

```bash
# Quick status
docker compose -f docker-compose.prod.yml ps

# API health
curl -s https://1person.bap-software.net/health | python3 -m json.tool

# Database connection
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres
```

### Resource Usage

```bash
# Container resources
docker stats --no-stream

# Disk usage
docker system df
df -h /var/lib/docker

# Database size
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('oneperson'));"
```

### Log Rotation

Docker logs are managed automatically. To configure:
```bash
# /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

---

## 12. Troubleshooting

### API won't start

```bash
docker compose -f docker-compose.prod.yml logs api --tail=50

# Common causes:
# - DATABASE_URL wrong → check .env, ensure password matches
# - DB not ready → restart: docker compose -f docker-compose.prod.yml restart api
# - Port conflict → check: lsof -i :8004
```

### 502 Bad Gateway

```bash
# Check all containers running
docker compose -f docker-compose.prod.yml ps

# Restart stack
docker compose -f docker-compose.prod.yml restart

# Check nginx config
docker compose -f docker-compose.prod.yml exec nginx nginx -t
```

### Database connection refused

```bash
# Check postgres running
docker compose -f docker-compose.prod.yml logs postgres --tail=20

# Verify connection from API container
docker compose -f docker-compose.prod.yml exec api \
  node -e "const pg = require('postgres'); const sql = pg(process.env.DATABASE_URL); sql\`SELECT 1\`.then(() => console.log('OK')).catch(console.error)"
```

### Admin can't login

```bash
# Check admin exists in DB
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d oneperson -c "SELECT email, role, approval_status FROM users WHERE email='admin@1person.ai';"

# If missing, restart API to trigger auto-seed
docker compose -f docker-compose.prod.yml restart api

# If role is wrong, fix manually
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d oneperson -c "UPDATE users SET role='admin', approval_status='approved', onboarding_completed=true WHERE email='admin@1person.ai';"
```

### SSL certificate errors

```bash
# Check cert exists
ls -la infrastructure/nginx/ssl/live/1person.bap-software.net/

# Re-issue
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d 1person.bap-software.net --force-renewal

docker compose -f docker-compose.prod.yml restart nginx
```

### Out of disk space

```bash
# Clean Docker cache
docker system prune -a --volumes

# Clean old images
docker image prune -a
```

---

## 13. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **Server** | | | |
| `NODE_ENV` | Yes | `production` | Environment mode |
| `API_PORT` | No | `8004` | API server port |
| `WEB_PORT` | No | `3004` | Web server port |
| **URLs** | | | |
| `WEB_URL` | Yes | - | `https://1person.bap-software.net` |
| `NEXT_PUBLIC_API_URL` | Yes | - | `https://1person.bap-software.net/api/v1` |
| **Database** | | | |
| `DB_USER` | No | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | **Yes** | - | PostgreSQL password |
| `DB_NAME` | No | `oneperson` | Database name |
| `DATABASE_URL` | Yes | - | Full PostgreSQL connection string |
| **Redis** | | | |
| `REDIS_PASSWORD` | Yes | - | Redis password |
| `REDIS_URL` | Yes | - | Full Redis connection string |
| **Auth** | | | |
| `JWT_SECRET` | **Yes** | - | JWT signing secret (64+ chars) |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiry |
| `ADMIN_EMAIL` | No | `admin@1person.ai` | Admin account email |
| `ADMIN_PASSWORD` | **Yes** | - | Admin account password |
| **AI** | | | |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | - | Anthropic API key |
| `FTUX_AI_PROVIDER` | No | `openai` | AI provider for onboarding |
| `FTUX_AI_MODEL` | No | `gpt-4o-mini` | AI model for onboarding |
| **Google (optional)** | | | |
| `GOOGLE_CLIENT_ID` | No | - | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | - | Google OAuth secret |

---

## 14. File Structure (Production)

```
/opt/1person/
├── .env                          ← Production secrets (chmod 600)
├── .env.production               ← Template (safe to commit)
├── docker-compose.prod.yml       ← Production stack definition
├── infrastructure/
│   └── nginx/
│       ├── nginx.conf            ← Nginx config (reverse proxy, SSL, headers)
│       └── ssl/                  ← Let's Encrypt certificates (auto-managed)
├── apps/
│   ├── api/
│   │   └── Dockerfile            ← API Docker build
│   └── web/
│       └── Dockerfile            ← Web Docker build
└── docs/
    └── DEPLOYMENT.md             ← This document
```

---

## 15. Quick Reference

```bash
# === DAILY OPERATIONS ===
cd /opt/1person

# Status
docker compose -f docker-compose.prod.yml ps

# Logs
docker compose -f docker-compose.prod.yml logs -f api --tail=50

# Restart
docker compose -f docker-compose.prod.yml restart

# === DEPLOY NEW VERSION ===
git pull origin develop
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d api web
docker compose -f docker-compose.prod.yml exec api npx drizzle-kit push

# === BACKUP ===
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres oneperson | gzip > /opt/backups/1person_$(date +%Y%m%d).sql.gz

# === EMERGENCY ===
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

**Contact:** devops@bap-software.net
**Last updated:** 2026-04-06
