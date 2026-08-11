import subprocess, sys, io

MUTS = [
 # 1. A surface goes back to setting the title as text
 ("ogView reverts to a Geist string",
  'api/lib/ogView.js',
  "          ...wordmark(),",
  "          text({ fontSize: 30, letterSpacing: '0.14em', color: WHITE }, 'BITCOIN VIBE CHECK'),"),
 # 2. ShareCanvas reverts
 ("ShareCanvas reverts to bold system text",
  'src/components/ShareCanvas.jsx',
  "                <Wordmark cell={2} />",
  "                <div style={{ fontSize: 20, fontWeight: 700, color: p.ink }}>Bitcoin Vibe Check</div>"),
 # 3. static card reverts
 ("static card reverts to a set title",
  'scripts/generate-og-image.mjs',
  "    <div class=\"title\">${wordmark()}</div>",
  "    <div class=\"title\">BITCOIN VIBE CHECK</div>"),
 # 4. a glyph goes missing rather than throwing
 ("layoutLine drops an unknown letter instead of throwing",
  'src/lib/wordmark.js',
  "    if (!glyph) throw new Error(`Wordmark: no glyph for \"${char}\"`)",
  "    if (!glyph) return"),
 # 5. run merging removed
 ("run merging removed — one rect per cell",
  'src/lib/wordmark.js',
  "      while (row[x + width] === row[x]) width++",
  "      // merged"),
 # 6. CHECK loses the accent
 ("CHECK painted in the ink like the rest",
  'src/components/Wordmark.jsx',
  "  const fills = [colors.ink, colors.accent]",
  "  const fills = [colors.ink, colors.ink]"),
 # 7. sr-only name removed
 ("the heading loses its accessible name",
  'src/App.jsx',
  "            <span className=\"sr-only\">{WORDMARK_TEXT}</span>",
  ""),
 # 8. crispEdges dropped
 ("crispEdges dropped so the letterforms antialias",
  'src/components/Wordmark.jsx',
  "      shapeRendering=\"crispEdges\"",
  ""),
 # 9. size class drifts from the constants
 ("a size class drifts from the constants",
  'src/components/Wordmark.jsx',
  "md:w-[244px] md:h-[60px]",
  "md:w-[240px] md:h-[60px]"),
 # 10. the alphabet grows a glyph nothing uses
 ("the alphabet grows a glyph nothing renders",
  'src/lib/wordmark.js',
  "  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],",
  "  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],\n  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],"),
 # 11. I widened back to 5 — the loose-lettering regression
 ("I widened back to 5 cells",
  'src/lib/wordmark.js',
  "  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],",
  "  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],"),
 # 12. the wordmark is no longer aria-hidden — the reading is announced twice
 ("the drawing announces itself as well as the text",
  'src/components/Wordmark.jsx',
  "      aria-hidden=\"true\"",
  "      role=\"img\" aria-label=\"Bitcoin Vibe Check\""),
 # 13. lineDataUri stops matching lineSvg
 ("the data URI is built from a different drawing",
  'src/lib/wordmark.js',
  "  `data:image/svg+xml;base64,${btoa(lineSvg(text, opts))}`",
  "  `data:image/svg+xml;base64,${btoa(lineSvg(text))}`"),
 # 14. the responsive classes reach ShareCanvas
 ("the fixed-cell variant keeps the breakpoint classes",
  'src/components/Wordmark.jsx',
  "${cell == null ? 'w-[183px] h-[45px] md:w-[244px] md:h-[60px]' : ''}",
  "w-[183px] h-[45px] md:w-[244px] md:h-[60px]"),
]

for name, path, old, new in MUTS:
    src = open(path).read()
    if old not in src:
        print(f"== {name} -> MUTATION DID NOT APPLY"); continue
    open(path,'w').write(src.replace(old, new, 1))
    r = subprocess.run(['npx','vitest','run'], capture_output=True, text=True)
    line = [l for l in (r.stdout+r.stderr).splitlines() if l.strip().startswith('Tests ')]
    print(f"== {name} -> {line[0].strip() if line else 'NO RESULT'}")
    subprocess.run(['git','checkout','--',path])
