// The stats panel body (computeStats, pricing, cards) loads on demand; App preloads it on start.
import { lazyModule } from '@/components/common/lazyModule'

export const sessionStatsModule = lazyModule(() => import('./SessionStats').then((m) => m.SessionStats))
