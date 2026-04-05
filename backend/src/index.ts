import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient } from '@prisma/client'
import cron from 'node-cron'
import { packagesRoutes } from './api/routes/packages'
import { collectRoutes } from './api/routes/collect'
import { routesRoutes } from './api/routes/routes'
import { snapshotsRoutes } from './api/routes/snapshots'
import { runDailyFetch } from './scheduler'

const prisma = new PrismaClient()
const fastify = Fastify({ logger: true })

async function bootstrap() {
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  })

  // Registrar rotas
  await packagesRoutes(fastify, prisma)
  await collectRoutes(fastify, prisma)
  await routesRoutes(fastify, prisma)
  await snapshotsRoutes(fastify, prisma)

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  // Scheduler: coleta diária às 06:00
  cron.schedule('0 6 * * *', async () => {
    fastify.log.info('[Cron] Iniciando coleta diária...')
    await runDailyFetch(prisma)
  })

  const port = parseInt(process.env.PORT ?? '3001')
  await fastify.listen({ port, host: '0.0.0.0' })
  fastify.log.info(`Backend rodando em http://localhost:${port}`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
