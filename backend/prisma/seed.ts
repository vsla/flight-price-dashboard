import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_ROUTES = [
  { origin: 'REC', destination: 'LIS', tripType: 'oneway' },
  { origin: 'REC', destination: 'MAD', tripType: 'oneway' },
  { origin: 'REC', destination: 'OPO', tripType: 'oneway' },
  { origin: 'LIS', destination: 'REC', tripType: 'oneway' },
  { origin: 'MAD', destination: 'REC', tripType: 'oneway' },
  { origin: 'OPO', destination: 'REC', tripType: 'oneway' },
]

async function main() {
  for (const route of DEFAULT_ROUTES) {
    await prisma.route.upsert({
      where: {
        origin_destination_tripType: {
          origin: route.origin,
          destination: route.destination,
          tripType: route.tripType,
        },
      },
      update: {},
      create: route,
    })
  }
  console.log('Seed concluído: 6 rotas oneway inseridas.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
