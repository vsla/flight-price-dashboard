import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { runDailyFetch } from '../../scheduler'

let isRunning = false

export async function collectRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  fastify.post('/api/collect', async (request, reply) => {
    if (isRunning) {
      return reply.status(409).send({ error: 'Coleta já em andamento' })
    }
    isRunning = true
    // Roda em background
    runDailyFetch(prisma)
      .then((count) => {
        fastify.log.info(`Coleta concluída: ${count} snapshots`)
        isRunning = false
      })
      .catch((err) => {
        fastify.log.error('Erro na coleta:', err)
        isRunning = false
      })

    return reply.send({ started: true, message: 'Coleta iniciada em background' })
  })

  fastify.get('/api/collect/status', async (_request, reply) => {
    return reply.send({ isRunning })
  })
}
