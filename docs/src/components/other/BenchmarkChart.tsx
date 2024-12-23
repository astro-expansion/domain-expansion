"use client"

import { Bar, BarChart, XAxis } from "recharts"

import prettyMs from "pretty-ms"

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import type { CollectionEntry } from "astro:content"
import { cn } from "@/lib/utils"

const chartConfig = {
  duration: {
    label: "Time to build",
    color: "#b4befe",
  },
} satisfies ChartConfig;

const keyMap = {
  standard: {
    label: "Without DE",
    color: "#b4befe",
  },
  cold: {
    label: "With DE, first run",
    color: "#74c7ec",
  },
  hot: {
    label: "With DE, sub. runs",
    color: "#94e2d5",
  },
}

export function BenchmarkChart({ results }: { results: CollectionEntry<'benchmark'> }) {
  const formatted = Object.keys(results.data.benchmark.means).map((key) => ({
    name: key,
    duration: results.data.benchmark.means[key as keyof typeof results.data.benchmark.means].mean,
    stdDev: results.data.benchmark.means[key as keyof typeof results.data.benchmark.means].stdDev,
    color: keyMap[key as keyof typeof keyMap].color,
  })).sort((a, b) => {
    // name: hot > cold > standard
    if (a.name === "hot") return 1;
    if (b.name === "hot") return -1;
    if (a.name === "cold") return 1;
    if (b.name === "cold") return -1;
    return 0;
  }).reverse();

  return (
    <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
      <BarChart barGap={8} accessibilityLayer data={formatted}>
        <XAxis
          dataKey="name"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={(value) => keyMap[value as keyof typeof keyMap].label}
        />
        <ChartTooltip 
          content={
            <ChartTooltipContent 
              labelKey="name" 
              className="recharts-tooltip"
              formatter={(value) => (
                <div style={{ display: "flex", gap: ".5rem", alignItems: 'center' }}>
                  <div
                    className={cn(
                      "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg], h-2.5 w-2.5 relative top-px"
                    )}
                    style={
                      {
                        "--color":  formatted.find((x) => x.duration === value)?.color || '#b4befe',
                        "background": 'var(--color)',
                        "border": '1px solid var(--color)',
                      } as React.CSSProperties
                    }
                  />
                  {prettyMs(
                    Math.floor((value as number)) * 1000,
                  )} ± {prettyMs(
                    Math.floor((formatted.find((x) => x.duration === value)?.stdDev || 0) * 1000),
                  )}
                </div>
              )}
            />
          }
        />
        <Bar barSize={70} dataKey="duration" fill="var(--color-duration)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
