# Guía de Despliegue en Cloudflare

## Requisitos Previos

1. **Cuenta de Cloudflare** con plan Workers Paid (necesario para Queues)
2. **Node.js 20+** instalado
3. **Wrangler CLI** instalado globalmente:
   ```bash
   npm install -g wrangler
   ```

---

## Paso 1: Autenticación

```bash
wrangler login
```

Esto abrirá tu navegador para autorizar a Wrangler con tu cuenta de Cloudflare.

---

## Paso 2: Crear Recursos en Cloudflare

### 2.1 Base de Datos D1

```bash
# Crear base de datos
wrangler d1 create leadflow-db

# Guarda el database_id que aparece en la salida
# Ejemplo: database_id = "abc123-def456-ghi789"
```

### 2.2 KV Namespace

```bash
# Crear namespace para caché y tokens
wrangler kv:namespace create KV

# Guarda el id que aparece en la salida
# Ejemplo: id = "abc123def456ghi789"
```

### 2.3 Queue (Requiere plan Workers Paid)

```bash
# Crear cola para procesamiento asíncrono
wrangler queues create leadflow-queue
```

### 2.4 R2 Bucket

```bash
# Crear bucket para exports
wrangler r2 bucket create leadflow-exports
```

---

## Paso 3: Configurar wrangler.toml

Actualiza el archivo `backend/wrangler.toml` con los IDs obtenidos:

```toml
[[d1_databases]]
binding = "DB"
database_name = "leadflow-db"
database_id = "TU_DATABASE_ID_AQUI"  # <-- Pega aquí tu ID

[[kv_namespaces]]
binding = "KV"
id = "TU_KV_ID_AQUI"  # <-- Pega aquí tu ID
```

---

## Paso 4: Configurar Secrets

Los secrets son valores sensibles que no se guardan en el código:

```bash
cd backend

# JWT Secret para access tokens
wrangler secret put JWT_SECRET
# Ingresa un valor aleatorio largo, ej: mi-secreto-super-seguro-12345678

# JWT Secret para refresh tokens
wrangler secret put JWT_REFRESH_SECRET
# Ingresa otro valor aleatorio diferente

# API Key de Resend (obtén una en https://resend.com)
wrangler secret put RESEND_API_KEY
# Ingresa tu API key: re_abc123...
```

---

## Paso 5: Ejecutar Migraciones

```bash
# Aplicar schema a la base de datos
wrangler d1 execute leadflow-db --file=migrations/0001_init.sql

# Verificar que se crearon las tablas
wrangler d1 execute leadflow-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

---

## Paso 6: Desplegar Backend

```bash
cd backend

# Desplegar a Cloudflare Workers
wrangler deploy

# El output mostrará la URL de tu API:
# https://leadflow-ai-api.tu-subdomain.workers.dev
```

---

## Paso 7: Desplegar Frontend

### 7.1 Configurar URL del Backend

Edita `frontend/src/lib/api.ts` si necesitas cambiar la URL del backend:

```typescript
const API_BASE = 'https://leadflow-ai-api.tu-subdomain.workers.dev/api';
```

### 7.2 Build y Deploy

```bash
cd frontend

# Instalar dependencias
npm install

# Build de producción
npm run build

# Desplegar a Cloudflare Pages
wrangler pages deploy dist --project-name=leadflow-ai
```

---

## Paso 8: Configurar Dominio Personalizado (Opcional)

### Para el Backend (Workers)

```bash
# Agregar dominio personalizado
wrangler domains add leadflow-api.tudominio.com
```

### Para el Frontend (Pages)

1. Ve a Cloudflare Dashboard > Pages > leadflow-ai
2. Settings > Custom domains
3. Agrega tu dominio: `leadflow.tudominio.com`

---

## Verificación

### Probar Backend

```bash
# Health check
curl https://leadflow-ai-api.tu-subdomain.workers.dev/health

# API info
curl https://leadflow-ai-api.tu-subdomain.workers.dev/api
```

### Probar Frontend

Abre la URL de Cloudflare Pages en tu navegador y:
1. Registra una cuenta
2. Crea un lead
3. Verifica que aparezca en el pipeline

---

## Comandos Útiles

```bash
# Ver logs del worker
wrangler tail

# Ver información del worker
wrangler deployments list

# Ver contenido de KV
wrangler kv:key list --namespace-id=TU_KV_ID

# Ejecutar SQL en D1
wrangler d1 execute leadflow-db --command="SELECT * FROM users LIMIT 5"

# Ver secrets configurados
wrangler secret list
```

---

## Solución de Problemas

### Error: "Queue not found"
- Verifica que creaste la queue: `wrangler queues list`
- Asegúrate de tener plan Workers Paid

### Error: "D1 database not found"
- Verifica que el database_id en wrangler.toml es correcto
- Ejecuta: `wrangler d1 list`

### Error: "Unauthorized"
- Verifica que configuraste JWT_SECRET y JWT_REFRESH_SECRET
- Ejecuta: `wrangler secret list`

### Error: "R2 bucket not found"
- Verifica que creaste el bucket: `wrangler r2 bucket list`
- Asegúrate que el nombre coincide en wrangler.toml

### Los emails no se envían
- Verifica que RESEND_API_KEY está configurado
- Revisa los logs: `wrangler tail`
- Verifica en Resend dashboard que el email fue procesado

---

## Costos Estimados (Cloudflare Free Tier)

| Recurso | Límite Gratuito |
|---------|-----------------|
| Workers | 100,000 requests/día |
| D1 | 5 GB almacenamiento, 5M rows leídas/día |
| KV | 1 GB almacenamiento, 100K reads/día |
| R2 | 10 GB almacenamiento |
| Queues | **Requiere plan Paid** ($5/mes mínimo) |

**Nota**: Si no necesitas automatización de emails, puedes comentar la sección de Queues en wrangler.toml y el código relacionado.
