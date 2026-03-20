#!/bin/bash

# LeadFlow AI - Cloudflare Deployment Script
# Este script configura y despliega todos los recursos necesarios en Cloudflare

set -e

echo "=========================================="
echo "  LeadFlow AI - Cloudflare Deployment"
echo "=========================================="
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funciones auxiliares
success() { echo "${GREEN}✓ $1${NC}"; }
warning() { echo "${YELLOW}⚠ $1${NC}"; }
error() { echo "${RED}✗ $1${NC}"; exit 1; }

# Verificar que wrangler está instalado
if ! command -v wrangler &> /dev/null; then
    error "wrangler no está instalado. Ejecuta: npm install -g wrangler"
fi

# Verificar login
echo "Paso 1: Verificando autenticación con Cloudflare..."
if ! wrangler whoami &> /dev/null; then
    echo "Necesitas iniciar sesión en Cloudflare..."
    wrangler login
fi
success "Autenticación verificada"
echo ""

# Variables
PROJECT_NAME="leadflow-ai"
DB_NAME="leadflow-db"
KV_NAME="leadflow-kv"
QUEUE_NAME="leadflow-queue"
R2_BUCKET="leadflow-exports"

echo "Paso 2: Creando recursos en Cloudflare..."
echo ""

# Crear D1 Database
echo "Creando D1 Database..."
DB_RESULT=$(wrangler d1 create $DB_NAME 2>&1 || true)
if echo "$DB_RESULT" | grep -q "already exists"; then
    warning "D1 Database ya existe"
else
    success "D1 Database creada"
fi

# Obtener Database ID
DB_ID=$(wrangler d1 list 2>/dev/null | grep "$DB_NAME" | awk '{print $1}' || echo "")

# Crear KV Namespace
echo "Creando KV Namespace..."
KV_RESULT=$(wrangler kv:namespace create KV 2>&1 || true)
if echo "$KV_RESULT" | grep -q "already exists"; then
    warning "KV Namespace ya existe"
fi
KV_ID=$(wrangler kv:namespace list 2>/dev/null | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

# Crear Queue
echo "Creando Queue..."
QUEUE_RESULT=$(wrangler queues create $QUEUE_NAME 2>&1 || true)
if echo "$QUEUE_RESULT" | grep -q "already exists"; then
    warning "Queue ya existe"
else
    success "Queue creada"
fi

# Crear R2 Bucket
echo "Creando R2 Bucket..."
R2_RESULT=$(wrangler r2 bucket create $R2_BUCKET 2>&1 || true)
if echo "$R2_RESULT" | grep -q "already exists"; then
    warning "R2 Bucket ya existe"
else
    success "R2 Bucket creado"
fi

echo ""
echo "Paso 3: Mostrando IDs de recursos..."
echo "--------------------------------------"
echo "Database ID: $DB_ID"
echo "KV ID: $KV_ID"
echo ""
echo "IMPORTANTE: Copia estos IDs a tu wrangler.toml"
echo ""

# Preguntar si quiere configurar secrets
read -p "¿Quieres configurar los secrets ahora? (y/n): " CONFIGURE_SECRETS

if [ "$CONFIGURE_SECRETS" = "y" ] || [ "$CONFIGURE_SECRETS" = "Y" ]; then
    echo ""
    echo "Paso 4: Configurando secrets..."
    
    echo "Ingresa el JWT_SECRET (puedes generar uno aleatorio):"
    read -s JWT_SECRET
    wrangler secret put JWT_SECRET <<< "$JWT_SECRET"
    success "JWT_SECRET configurado"
    
    echo "Ingresa el JWT_REFRESH_SECRET:"
    read -s JWT_REFRESH_SECRET
    wrangler secret put JWT_REFRESH_SECRET <<< "$JWT_REFRESH_SECRET"
    success "JWT_REFRESH_SECRET configurado"
    
    echo "Ingresa el RESEND_API_KEY (obtén uno en resend.com):"
    read -s RESEND_KEY
    wrangler secret put RESEND_API_KEY <<< "$RESEND_KEY"
    success "RESEND_API_KEY configurado"
fi

echo ""
echo "=========================================="
echo "  Configuración completada!"
echo "=========================================="
echo ""
echo "Próximos pasos:"
echo "1. Actualiza wrangler.toml con los IDs mostrados arriba"
echo "2. Ejecuta: wrangler d1 execute $DB_NAME --file=migrations/0001_init.sql"
echo "3. Ejecuta: cd backend && wrangler deploy"
echo "4. Para el frontend: cd frontend && npm run build && wrangler pages deploy dist"
echo ""
