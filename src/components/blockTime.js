// Block-time colour scale, shared by RecentBlocksCard (its desktop heartbeat
// header) and NetworkHeartbeatCard (the mobile card). It maps to Tailwind class
// names rather than numbers, so it lives beside the components that render it
// rather than in lib/calculations.js.
//
// Orange is the "on target" state: ~10 minutes is what difficulty adjusts to.
// Faster than that reads green, slower reads red.
export function blockTimeColors(mins) {
  if (mins == null || (mins >= 9 && mins <= 11)) return { text: 'text-orange-400', bg: 'bg-orange-400' }
  if (mins < 9) return { text: 'text-green-400', bg: 'bg-green-400' }
  return              { text: 'text-red-400',    bg: 'bg-red-400'   }
}
