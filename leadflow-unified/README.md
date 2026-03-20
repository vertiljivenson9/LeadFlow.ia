# 🚀 LeadFlow AI - Unified Deployment

**Un proyecto, un despliegue.** Frontend + Backend juntos en Cloudflare Pages.

---

## 📱 Despliegue desde el Celular (Sin comandos)

### Paso 1: Crear Recursos en Dashboard

1. **D1 Database**
   - Ve a: https://dash.cloudflare.com → Workers & Pages → D1
   - Click **Create database**
   - Nombre: `leadflow-db`
   - Click **Create**

2. **KV Namespace**
   - Ve a: Workers & Pages → KV
   - Click **Create a namespace**
   - Nombre: `leadflow-kv`
   - Click **Add**

3. **R2 Bucket**
   - Ve a: R2 Object Storage
   - Click **Create bucket**
   - Nombre: `leadflow-exports`
   - Click **Create bucket**

4. **Obtener API Key de Resend**
   - Ve a: https://resend.com (registro gratis)
   - API Keys → Create API Key
   - Copia la key

---

### Paso 2: Conectar GitHub a Cloudflare Pages

1. Ve a: Workers & Pages → **Create application**
2. Selecciona **Pages** → **Connect to Git**
3. Autoriza GitHub y selecciona: `vertiljivenson9/LeadFlow.ia`
4. Configura:
   - **Branch**: `main`
   - **Build command**: `npm install && npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `leadflow-unified`

5. Click **Save and Deploy**

---

### Paso 3: Configurar Bindings

Después del primer deploy, ve a tu proyecto → **Settings** → **Functions**:

1. **D1 Database binding**:
   - Variable name: `DB`
   - Selecciona: `leadflow-db`

2. **KV Namespace binding**:
   - Variable name: `KV`
   - Selecciona: `leadflow-kv`

3. **R2 Bucket binding**:
   - Variable name: `R2`
   - Selecciona: `leadflow-exports`

---

### Paso 4: Configurar Environment Variables

Ve a **Settings** → **Environment variables**:

| Variable | Valor |
|----------|-------|
| `JWT_SECRET` | (genera un string aleatorio de 32+ caracteres) |
| `JWT_REFRESH_SECRET` | (otro string aleatorio diferente) |
| `RESEND_API_KEY` | `re_tu_api_key_de_resend` |

---

### Paso 5: Ejecutar Migración SQL

Ve a: D1 → `leadflow-db` → **Console**

Copia y pega el contenido de `migrations/0001_init.sql` y ejecútalo.

---

## 🎉 ¡Listo!

Tu app estará en: `https://leadflow-ai.pages.dev`

---

## 📁 Estructura del Proyecto

```
leadflow-unified/
├── functions/
│   └── api/
│       └── [[...path]].ts   # Backend API (todas las rutas)
├── src/
│   ├── App.tsx              # Frontend React
│   ├── main.tsx             # Entry point
│   └── index.css            # Estilos
├── migrations/
│   └── 0001_init.sql        # Database schema
├── index.html               # HTML template
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── wrangler.toml            # Cloudflare config
```

---

## 🆓 Costo Total: $0/mes

| Servicio | Plan Gratuito |
|----------|--------------|
| Workers | 100K requests/día |
| D1 | 5GB storage, 5M rows/día |
| KV | 1GB storage, 100K reads/día |
| R2 | 10GB storage |
| Resend | 3,000 emails/mes |

---

## 🔧 Desarrollo Local

```bash
cd leadflow-unified
npm install
npm run dev
# → http://localhost:5173
```
