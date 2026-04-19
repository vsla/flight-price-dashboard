# flightsearch-frontend

Interface para visualizar e filtrar pacotes de passagens aéreas (Recife → Europa).

**Stack:** Next.js 16 + React 19 + Tailwind CSS v4 + shadcn/ui + TanStack Query v5

Consome a API do [flightsearch-backend](https://github.com/SEU_USUARIO/flightsearch-backend).

---

## Desenvolvimento local

### Pré-requisitos

- Node.js 20+
- Backend rodando em `http://localhost:3001` ([instruções](https://github.com/SEU_USUARIO/flightsearch-backend))

### 1. Instalar dependências

```bash
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

`.env.local` para desenvolvimento:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Rodar

```bash
npm run dev
# Abre em http://localhost:3000
```

---

## Deploy — Vercel

O Vercel é a plataforma feita pelo mesmo time do Next.js — zero configuração necessária.

### Passo 1 — Criar conta no Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Clique em **Sign Up**
3. Escolha **Continue with GitHub**
4. Autorize o Vercel a acessar seus repositórios

---

### Passo 2 — Importar o repositório

1. No dashboard do Vercel, clique em **Add New → Project**
2. Em "Import Git Repository", selecione o repo `flightsearch-frontend`
   - Se não aparecer, clique em **"Adjust GitHub App Permissions"** e dê acesso ao repo
3. Na tela de configuração:
   - **Framework Preset:** Next.js (detectado automaticamente)
   - **Root Directory:** `.` (deixar como está)
   - **Build Command:** `next build` (padrão)
   - **Output Directory:** `.next` (padrão)

---

### Passo 3 — Configurar a variável de ambiente

Ainda na tela de configuração (antes de clicar em Deploy):

1. Expanda a seção **"Environment Variables"**
2. Adicione:
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `http://IP_DA_SUA_VM` (o IP público da VM Azure)
   - **Environment:** Production, Preview, Development (marque todos)
3. Clique em **Add**

> Use `http://` (não `https://`) a menos que você tenha SSL configurado na VM.

---

### Passo 4 — Deploy

1. Clique em **Deploy**
2. Aguarde ~2 minutos enquanto o Vercel faz o build
3. Quando terminar, você recebe uma URL no formato `https://flightsearch-frontend.vercel.app`

---

### Deploys automáticos

A partir desse momento, **todo `git push` para a branch `main` faz deploy automático**.

```bash
git add .
git commit -m "sua mudança"
git push origin main
# → Vercel faz deploy automaticamente em ~1-2 minutos
```

Para outras branches, o Vercel cria um **preview deploy** com URL temporária.

---

### Passo 5 — Verificar

1. Acesse a URL gerada pelo Vercel
2. A página deve carregar e mostrar os pacotes de voo
3. Se aparecer vazio, verifique:
   - O backend está rodando: `curl http://IP_DA_VM/health`
   - A variável `NEXT_PUBLIC_API_URL` está correta no Vercel
   - Já foi feita ao menos uma coleta: `npm run collect` no backend

---

## Atualizar a URL da API

Se o IP da VM mudar:

1. No Vercel, vá em **Settings → Environment Variables**
2. Edite `NEXT_PUBLIC_API_URL` com o novo IP
3. Vá em **Deployments** → clique nos `...` do último deploy → **Redeploy**

> **Dica:** Configure um IP estático na VM Azure para evitar que o IP mude.
> Azure Portal → VM → Networking → IP configuration → Allocation: **Static**.

---

## Domínio personalizado (opcional)

1. No Vercel, vá em **Settings → Domains**
2. Adicione seu domínio
3. Siga as instruções para apontar o DNS
4. O Vercel configura HTTPS automaticamente via Let's Encrypt

---

## Scripts

```bash
npm run dev     # desenvolvimento (http://localhost:3000)
npm run build   # build de produção
npm run start   # rodar o build localmente
npm run lint    # verificar erros de lint
```
