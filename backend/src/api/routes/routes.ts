import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { runDailyFetch } from '../../scheduler'

const VALID_TRIP_TYPES = ['oneway', 'roundtrip']

export async function routesRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  // GET /api/routes — lista todas as rotas
  fastify.get('/api/routes', async (_request, reply) => {
    const routes = await prisma.route.findMany({ orderBy: { id: 'asc' } })
    return reply.send({ routes })
  })

  // POST /api/routes — cria nova rota
  fastify.post('/api/routes', async (request, reply) => {
    const body = request.body as { origin?: string; destination?: string; tripType?: string }

    const origin = body?.origin?.toUpperCase().trim()
    const destination = body?.destination?.toUpperCase().trim()
    const tripType = body?.tripType?.toLowerCase().trim()

    if (!origin || origin.length !== 3) {
      return reply.status(400).send({ error: 'origin deve ser um código IATA de 3 letras (ex: REC)' })
    }
    if (!destination || destination.length !== 3) {
      return reply.status(400).send({ error: 'destination deve ser um código IATA de 3 letras (ex: LIS)' })
    }
    if (!tripType || !VALID_TRIP_TYPES.includes(tripType)) {
      return reply.status(400).send({ error: 'tripType deve ser "oneway" ou "roundtrip"' })
    }

    try {
      const route = await prisma.route.upsert({
        where: { origin_destination_tripType: { origin, destination, tripType } },
        update: { isActive: true },
        create: { origin, destination, tripType, isActive: true },
      })
      return reply.status(201).send({ route })
    } catch {
      return reply.status(409).send({ error: 'Rota já existe' })
    }
  })

  // PATCH /api/routes/:id — ativa ou desativa uma rota
  fastify.patch('/api/routes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { isActive?: boolean }

    if (typeof body?.isActive !== 'boolean') {
      return reply.status(400).send({ error: 'isActive (boolean) é obrigatório' })
    }

    const routeId = parseInt(id)
    if (isNaN(routeId)) return reply.status(400).send({ error: 'id inválido' })

    const existing = await prisma.route.findUnique({ where: { id: routeId } })
    if (!existing) return reply.status(404).send({ error: 'Rota não encontrada' })

    const route = await prisma.route.update({
      where: { id: routeId },
      data: { isActive: body.isActive },
    })
    return reply.send({ route })
  })

  // DELETE /api/routes/:id — remove rota e seus snapshots
  fastify.delete('/api/routes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const routeId = parseInt(id)
    if (isNaN(routeId)) return reply.status(400).send({ error: 'id inválido' })

    const existing = await prisma.route.findUnique({ where: { id: routeId } })
    if (!existing) return reply.status(404).send({ error: 'Rota não encontrada' })

    // Deleta snapshots e alertas associados antes de deletar a rota
    await prisma.priceSnapshot.deleteMany({ where: { routeId } })
    await prisma.priceAlert.deleteMany({ where: { routeId } })
    await prisma.route.delete({ where: { id: routeId } })

    return reply.send({ deleted: true, id: routeId })
  })

  // POST /api/routes/:id/collect — dispara coleta apenas para esta rota
  fastify.post('/api/routes/:id/collect', async (request, reply) => {
    const { id } = request.params as { id: string }
    const routeId = parseInt(id)
    if (isNaN(routeId)) return reply.status(400).send({ error: 'id inválido' })

    const existing = await prisma.route.findUnique({ where: { id: routeId } })
    if (!existing) return reply.status(404).send({ error: 'Rota não encontrada' })
    if (!existing.isActive) return reply.status(400).send({ error: 'Rota está inativa' })

    // Roda em background
    runDailyFetch(prisma, routeId)
      .then((count) => fastify.log.info(`Coleta da rota ${routeId} concluída: ${count} snapshots`))
      .catch((err) => fastify.log.error(`Erro na coleta da rota ${routeId}:`, err))

    return reply.send({
      started: true,
      routeId,
      message: `Coleta da rota ${existing.origin}→${existing.destination} (${existing.tripType}) iniciada`,
    })
  })
}
