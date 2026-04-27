import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient } from '@prisma/client'
import cron from 'node-cron'
import { packagesRoutes } from './api/routes/packages'
import { collectRoutes } from './api/routes/collect'
import { routesRoutes } from './api/routes/routes'
import { snapshotsRoutes } from './api/routes/snapshots'
import { calendarRoutes } from './api/routes/calendar'
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
  await calendarRoutes(fastify, prisma)

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  // Scheduler: coleta diária às 06:00 (desativado se DISABLE_CRON=true)
  if (!process.env.DISABLE_CRON) {
    cron.schedule('0 6 * * *', async () => {
      fastify.log.info('[Cron] Iniciando coleta diária...')
      const report = await runDailyFetch(prisma)
      fastify.log.info(
        `[Cron] Coleta concluída: ${report.totalSaved} snapshots, ${report.warnings.length} aviso(s)`
      )
    })
  } else {
    fastify.log.info('[Cron] Desativado via DISABLE_CRON')
  }

  const port = parseInt(process.env.PORT ?? '3001')
  await fastify.listen({ port, host: '0.0.0.0' })
  fastify.log.info(`Backend rodando em http://localhost:${port}`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
