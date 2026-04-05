import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

export async function snapshotsRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  fastify.get('/api/snapshots', async (request, reply) => {
    const q = request.query as Record<string, string>

    const snapshots = await prisma.priceSnapshot.findMany({
      where: {
        route: {
          ...(q.origin && { origin: q.origin }),
          ...(q.destination && { destination: q.destination }),
          ...(q.tripType && { tripType: q.tripType }),
        },
        ...(q.after && { flightDate: { gte: new Date(q.after) } }),
        ...(q.before && { flightDate: { lte: new Date(q.before) } }),
      },
      include: { route: true },
      orderBy: { flightDate: 'asc' },
      take: 500,
    })

    return reply.send({ snapshots })
  })
}
