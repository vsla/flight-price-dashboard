import { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { PrismaClient } from '@prisma/client'

/** Ordenação explícita para GET /api/snapshots (?order=…) */
function snapshotOrderBy(order: string | undefined): Prisma.PriceSnapshotOrderByWithRelationInput[] {
  const idAsc: Prisma.PriceSnapshotOrderByWithRelationInput = { id: 'asc' }
  switch (order) {
    case 'flightDate_asc':
      return [{ flightDate: 'asc' }, idAsc]
    case 'flightDate_desc':
      return [{ flightDate: 'desc' }, idAsc]
    case 'priceBrl_asc':
      return [{ priceBrl: 'asc' }, idAsc]
    case 'priceBrl_desc':
      return [{ priceBrl: 'desc' }, idAsc]
    case 'collectedAt_asc':
      return [{ collectedAt: 'asc' }, { flightDate: 'asc' }, idAsc]
    case 'source_asc':
      return [{ source: 'asc' }, idAsc]
    case 'source_desc':
      return [{ source: 'desc' }, idAsc]
    case 'collectedAt_desc':
    default:
      return [{ collectedAt: 'desc' }, { flightDate: 'asc' }, idAsc]
  }
}

export async function snapshotsRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  fastify.get('/api/snapshots', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>

    const lastCollect = q.lastCollect === '1' || q.lastCollect === 'true'
    const rawLimit = q.limit ? parseInt(q.limit, 10) : 10000
    const take = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 25000) : 10000

    let collectedAtFilter: Prisma.DateTimeFilter | undefined
    if (lastCollect) {
      const agg = await prisma.priceSnapshot.aggregate({
        _max: { collectedAt: true },
      })
      const maxAt = agg._max.collectedAt
      if (!maxAt) {
        return reply.send({
          snapshots: [],
          meta: {
            lastCollectedAt: null,
            onlyLastCollect: true,
            total: 0,
          },
        })
      }
      collectedAtFilter = { equals: maxAt }
    }

    const routeWhere: Prisma.RouteWhereInput = {
      ...(q.origin && { origin: q.origin.trim().toUpperCase() }),
      ...(q.destination && { destination: q.destination.trim().toUpperCase() }),
      ...(q.tripType && { tripType: q.tripType }),
    }

    let flightDateWhere: Prisma.DateTimeFilter | Date | undefined
    if (q.flightDate) {
      flightDateWhere = new Date(q.flightDate)
    } else {
      const range: Prisma.DateTimeFilter = {}
      if (q.after) range.gte = new Date(q.after)
      if (q.before) range.lte = new Date(q.before)
      if (Object.keys(range).length > 0) flightDateWhere = range
    }

    const where: Prisma.PriceSnapshotWhereInput = {
      ...(collectedAtFilter && { collectedAt: collectedAtFilter }),
      ...(Object.keys(routeWhere).length > 0 && { route: routeWhere }),
      ...(flightDateWhere !== undefined && {
        flightDate: flightDateWhere as Prisma.DateTimeFilter | Date,
      }),
    }

    const snapshots = await prisma.priceSnapshot.findMany({
      where,
      include: { route: true },
      orderBy: snapshotOrderBy(q.order),
      take,
    })

    const globalMax = await prisma.priceSnapshot.aggregate({
      _max: { collectedAt: true },
    })

    return reply.send({
      snapshots,
      meta: {
        lastCollectedAt: globalMax._max.collectedAt?.toISOString() ?? null,
        onlyLastCollect: lastCollect,
        total: snapshots.length,
      },
    })
  })
}
