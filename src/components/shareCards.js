// The set of cards offered in the share modal, in display order.
// Kept in its own module so ShareModal.jsx only exports components — a file
// that mixes component and non-component exports breaks Fast Refresh.
export const SHARE_CARDS = [
  { key: 'btcPrice',         label: 'BTC Price'        },
  { key: 'marketSentiment',  label: 'Market Sentiment' },
  { key: 'volume',           label: '24h Volume'       },
  { key: 'networkPulse',     label: 'Network Health'   },
  { key: 'halving',          label: 'Next Halving'     },
  { key: 'recentBlocks',     label: 'Recent Blocks'    },
  { key: 'fees',             label: 'Network Fees'     },
  { key: 'cycleIndicators',  label: 'Cycle Indicators' },
]
