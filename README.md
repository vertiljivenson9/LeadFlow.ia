# LeadFlow AI - Despliegue Gratuito en Cloudflare

Este proyecto está optimizado para el **plan GRATUITO** de Cloudflare. No necesitas pagar por Queues.

## Arquitectura Gratuita

| Recurso | Uso | Costo |
|---------|-----|-------|
| Workers | API backend | GRATIS (100K requests/día) |
| D1 | Base de datos SQLite | GRATIS (5GB, 5M rows/día) |
| KV | Caché + tokens | GRATIS (1GB, 100K reads/día) |
| R2 | Export CSV | GRATIS (10GB) |
| **Cron Triggers** | Procesar emails pendientes | **GRATIS** |

**Total: $0/mes**

---

## Inicio Rápido

### 1. Requisitos
```bash
# Instalar wrangler
npm install -g wrangler

# Iniciar sesión
wrangler login
```

### 2. Crear Recursos

```bash
cd backend

# Base de datos D1
wrangler d1 create leadflow-db
# Copia el database_id mostrado

# KV Namespace
wrangler kv:namespace create KV
# Copia el id mostrado

# R2 Bucket
wrangler r2 bucket create leadflow-exports
```

### 3. Configurar wrangler.toml

Edita `backend/wrangler.toml`:

```toml
[[d1_databases]]
database_id = "PEGA_TU_DATABASE_ID"

[[kv_namespaces]]
id = "PEGA_TU_KV_ID"
```

### 4. Configurar Secrets

```bash
cd backend

# JWT para access tokens
wrangler secret put JWT_SECRET
# Ingresa: cualquier-string-largo-y-aleatorio

# JWT para refresh tokens
wrangler secret put JWT_REFRESH_SECRET
# Ingresa: otro-string-largo-y-diferente

# API Key de Resend (gratis en resend.com)
wrangler secret put RESEND_API_KEY
# Ingresa: re_tu_api_key
```

### 5. Ejecutar Migraciones

```bash
wrangler d1 execute leadflow-db --file=../migrations/0001_init.sql
```

### 6. Desplegar

```bash
# Backend
cd backend
wrangler deploy

# Frontend
cd ../frontend
npm install
npm run build
wrangler pages deploy dist --project-name=leadflow-ai
```

---

## Cómo Funciona la Automatización Gratuita

### En lugar de Cloudflare Queues ($5/mes):

1. **Crear lead** → Guarda trabajo en tabla `queue_jobs` (status: pending)
2. **Cron Trigger** → Ejecuta cada 5 minutos (GRATIS)
3. **Scheduled Worker** → Procesa hasta 20 emails pendientes
4. **Resend API** → Envía los emails

```
Lead creado → [queue_jobs DB] → Cron (cada 5 min) → Email enviado
```

### Ventajas:
- Sin costo adicional
- Persistencia en D1 (no se pierden jobs)
- Reintentos automáticos (3 intentos)
- Logs completos en `email_logs`

---

## Desarrollo Local

```bash
# Backend (terminal 1)
cd backend
npm install
npm run dev
# → http://localhost:8787

# Frontend (terminal 2)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Configurar Cron Trigger

El Cron ya está configurado en `wrangler.toml`:

```toml
[triggers]
crons = ["*/5 * * * *"]  # Cada 5 minutos
```

Esto ejecuta la función `scheduled` en `src/index.ts` automáticamente.

---

## Obtener API Key de Resend (Gratis)

1. Ve a [resend.com](https://resend.com)
2. Crea cuenta gratuita (3,000 emails/mes)
3. Ve a API Keys → Create API Key
4. Copia la key y configúrala:

```bash
wrangler secret put RESEND_API_KEY
```

---

## Verificar Deployment

```bash
# Health check
curl https://tu-worker.tu-subdomain.workers.dev/health

# API info
curl https://tu-worker.tu-subdomain.workers.dev/api

# Procesar jobs manualmente
curl -X POST https://tu-worker.tu-subdomain.workers.dev/api/admin/process-jobs \
  -H "Authorization: Bearer TU_JWT_SECRET"
```

---

## Estructura del Proyecto

```
/
├── backend/
│   ├── src/
│   │   ├── index.ts           # App + Cron handler
│   │   ├── routes/            # API endpoints
│   │   ├── services/
│   │   │   ├── job-processor.ts  # Procesa jobs (FREE)
│   │   │   ├── email.ts       # Resend integration
│   │   │   └── ...
│   │   └── middleware/
│   ├── wrangler.toml          # Config (sin Queues)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/             # React pages
│   │   ├── components/        # UI components
│   │   └── lib/               # API client
│   └── package.json
└── migrations/
    └── 0001_init.sql          # DB schema
```

---

## Comandos Útiles

```bash
# Ver logs en tiempo real
wrangler tail

# Ver secrets configurados
wrangler secret list

# Ejecutar SQL
wrangler d1 execute leadflow-db --command="SELECT COUNT(*) FROM leads"

# Ver jobs pendientes
wrangler d1 execute leadflow-db --command="SELECT * FROM queue_jobs WHERE status='pending'"
```

---

## Límites del Plan Gratuito

| Servicio | Límite | Qué pasa si excedes |
|----------|--------|---------------------|
| Workers | 100K req/día | Request falla con 429 |
| D1 | 5M rows/día | Query falla |
| KV | 100K reads/día | Read falla |
| Resend | 3K emails/mes | Email no se envía |

Para uso normal de un pequeño negocio, estos límites son más que suficientes.
