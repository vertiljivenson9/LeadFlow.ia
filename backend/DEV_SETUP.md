# LeadFlow AI - Desarrollo Local

Esta guía te permite ejecutar LeadFlow AI localmente sin necesidad de crear recursos en Cloudflare.

## Opción A: Desarrollo Local Simplificado (Recomendado)

### 1. Instalar dependencias

```bash
cd backend
npm install
```

### 2. Ejecutar en modo local

```bash
# Usando configuración local (sin queues)
wrangler dev --config wrangler.local.toml --local
```

La API estará disponible en `http://localhost:8787`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend estará disponible en `http://localhost:5173`

**Nota**: En modo local, las tablas se crean automáticamente en una base de datos SQLite temporal. Los emails de seguimiento se registran en la consola en lugar de enviarse.

---

## Opción B: Con recursos Cloudflare reales

Si deseas probar con los recursos reales de Cloudflare:

### 1. Crear recursos

```bash
# Login
wrangler login

# Crear D1
wrangler d1 create leadflow-db

# Crear KV
wrangler kv:namespace create KV

# Crear R2
wrangler r2 bucket create leadflow-exports

# (Opcional) Crear Queue - requiere plan paid
wrangler queues create leadflow-queue
```

### 2. Actualizar wrangler.toml

Copia los IDs mostrados en los comandos anteriores a `wrangler.toml`:

```toml
[[d1_databases]]
database_id = "PEGA_TU_ID_AQUI"

[[kv_namespaces]]
id = "PEGA_TU_ID_AQUI"
```

### 3. Configurar secrets

```bash
wrangler secret put JWT_SECRET
wrangler secret put JWT_REFRESH_SECRET
wrangler secret put RESEND_API_KEY
```

### 4. Ejecutar migraciones

```bash
wrangler d1 execute leadflow-db --file=../migrations/0001_init.sql
```

### 5. Desarrollo remoto

```bash
wrangler dev --remote
```

---

## Probar la API

```bash
# Health check
curl http://localhost:8787/health

# API info
curl http://localhost:8787/api

# Registrar usuario
curl -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123",
    "firstName": "Test",
    "lastName": "User",
    "teamName": "Test Team"
  }'

# Crear lead (necesitas token del registro)
curl -X POST http://localhost:8787/api/leads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d '{
    "name": "Lead de prueba",
    "email": "lead@test.com",
    "phone": "+1234567890",
    "company": "Test Corp",
    "source": "website"
  }'
```

---

## Estructura de Archivos Local

```
backend/
├── .wrangler/           # Creado automáticamente
│   └── state/           # SQLite local, KV local
├── wrangler.toml        # Configuración producción
├── wrangler.local.toml  # Configuración local
└── src/
```

---

## Troubleshooting

### Error: "No such binding: DB"
Asegúrate de ejecutar con `--local`:
```bash
wrangler dev --config wrangler.local.toml --local
```

### Error: "Queue not found"
Las queues requieren plan Workers Paid. Usa la configuración local que no requiere queues.

### Las tablas no se crean
En modo `--local`, Wrangler crea la base de datos automáticamente. Si hay problemas, elimina la carpeta `.wrangler` y vuelve a ejecutar.
