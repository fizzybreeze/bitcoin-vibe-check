// The brand accent, as a hex value.
//
// Everything that can reach the stylesheet uses Tailwind's `orange-400` class
// instead. This exists for the places that cannot: recharts takes colours as
// props, not classes, and `ShareCanvas` renders into a canvas via html2canvas.
// It was defined three times before — twice under the same name and once
// inline — which is two chances for the chart and its tooltip to stop matching.
export const ORANGE = '#fb923c'
