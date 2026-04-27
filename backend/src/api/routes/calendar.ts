import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

export async function calendarRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  fastify.get('/api/calendar', async (request, reply) => {
    const q = request.query as Record<string, string>

    const destinations = q.destinations ? q.destinations.split(',') : ['LIS', 'MAD', 'OPO']
    const departAfter = q.departAfter ? new Date(q.departAfter) : new Date()
    const departBefore = q.departBefore
      ? new Date(q.departBefore)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    const minStayDays = q.minStayDays ? parseInt(q.minStayDays) : 14
    const maxStayDays = q.maxStayDays ? parseInt(q.maxStayDays) : 30

    try {
      // Find most recent collectedAt per routeId
      const latestByRoute = await prisma.priceSnapshot.groupBy({
        by: ['routeId'],
        _max: { collectedAt: true },
      })

      if (latestByRoute.length === 0) {
        return reply.send({ days: [] })
      }

      const latestFilter = latestByRoute.map((r) => ({
        routeId: r.routeId,
        collectedAt: r._max.collectedAt!,
      }))

      // Fetch outbound snapshots (both oneway and roundtrip bundled)
      const outboundSnaps = await prisma.priceSnapshot.findMany({
        where: {
          OR: latestFilter,
          flightDate: { gte: departAfter, lte: departBefore },
          route: { origin: 'REC', destination: { in: destinations } },
          priceBrl: { gt: 0 },
        },
        select: {
          flightDate: true,
          returnDate: true,
          priceBrl: true,
          route: { select: { destination: true, tripType: true } },
        },
      })

      // Fetch return one-way snapshots within the valid stay window
      const returnAfterDate = new Date(departAfter.getTime() + minStayDays * 86_400_000)
      const returnBeforeDate = new Date(departBefore.getTime() + maxStayDays * 86_400_000)

      const returnSnaps = await prisma.priceSnapshot.findMany({
        where: {
          OR: latestFilter,
          flightDate: { gte: returnAfterDate, lte: returnBeforeDate },
          route: { destination: 'REC', origin: { in: destinations }, tripType: 'oneway' },
          priceBrl: { gt: 0 },
        },
        select: { flightDate: true, priceBrl: true },
      })

      // Build cheapest return price per calendar date
      const cheapestRetByDate = new Map<string, number>()
      for (const ret of returnSnaps) {
        const dateStr = ret.flightDate.toISOString().slice(0, 10)
        const price = Number(ret.priceBrl)
        const cur = cheapestRetByDate.get(dateStr)
        if (cur === undefined || price < cur) cheapestRetByDate.set(dateStr, price)
      }
      const sortedReturnDates = [...cheapestRetByDate.keys()].sort()

      // For each outbound departure date+destination, compute cheapest round-trip price
      const dateDestMap = new Map<string, number>()

      for (const s of outboundSnaps) {
        const outDateStr = s.flightDate.toISOString().slice(0, 10)
        const outPrice = Number(s.priceBrl)
        const dest = s.route.destination
        const key = `${outDateStr}|${dest}`

        if (s.route.tripType === 'roundtrip' && s.returnDate) {
          // Bundled price already covers both legs
          const stayMs = s.returnDate.getTime() - s.flightDate.getTime()
          const stay = Math.round(stayMs / 86_400_000)
          if (stay >= minStayDays && stay <= maxStayDays) {
            const cur = dateDestMap.get(key)
            if (cur === undefined || outPrice < cur) dateDestMap.set(key, outPrice)
          }
        } else if (s.route.tripType === 'oneway') {
          // Pair with cheapest compatible return
          const outMs = s.flightDate.getTime()
          let cheapestRet = Infinity
          for (const retDateStr of sortedReturnDates) {
            const retMs = new Date(retDateStr + 'T00:00:00Z').getTime()
            const stay = Math.round((retMs - outMs) / 86_400_000)
            if (stay < minStayDays) continue
            if (stay > maxStayDays) break
            const retPrice = cheapestRetByDate.get(retDateStr)!
            if (retPrice < cheapestRet) cheapestRet = retPrice
          }
          if (cheapestRet < Infinity) {
            const total = outPrice + cheapestRet
            const cur = dateDestMap.get(key)
            if (cur === undefined || total < cur) dateDestMap.set(key, total)
          }
        }
      }

      const days = Array.from(dateDestMap.entries()).map(([key, cheapestPrice]) => {
        const [date, destination] = key.split('|')
        return { date, destination, cheapestPrice }
      })

      days.sort((a, b) => a.date.localeCompare(b.date))

      return reply.send({ days })
    } catch (err) {
      fastify.log.error(err)
      return reply.status(500).send({ error: 'Erro ao buscar calendário de preços' })
    }
  })
}
