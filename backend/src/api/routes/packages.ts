import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { assembleGroupedPackages, PackageFilters } from '../../packages/assembler'

export async function packagesRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  fastify.get('/api/packages', async (request, reply) => {
    const q = request.query as Record<string, string>

    const filters: PackageFilters = {
      destinations: q.destinations ? q.destinations.split(',') : ['LIS', 'MAD'],
      minStayDays: q.minStayDays ? parseInt(q.minStayDays) : 5,
      maxStayDays: q.maxStayDays ? parseInt(q.maxStayDays) : 60,
      departAfter: q.departAfter ? new Date(q.departAfter) : undefined,
      departBefore: q.departBefore ? new Date(q.departBefore) : undefined,
      returnBefore: q.returnBefore ? new Date(q.returnBefore) : undefined,
      maxStops: q.maxStops !== undefined ? parseInt(q.maxStops) : undefined,
      maxPriceBrl: q.maxPriceBrl ? parseInt(q.maxPriceBrl) : undefined,
      sameAirline: q.sameAirline === 'true' ? true : q.sameAirline === 'false' ? false : undefined,
      sortBy: (q.sortBy as PackageFilters['sortBy']) ?? 'score',
      limit: q.limit ? parseInt(q.limit) : 15,
      offset: q.offset ? parseInt(q.offset) : 0,
    }

    try {
      const result = await assembleGroupedPackages(prisma, filters)
      return reply.send(result)
    } catch (err) {
      fastify.log.error(err)
      return reply.status(500).send({ error: 'Erro ao montar pacotes' })
    }
  })
}
