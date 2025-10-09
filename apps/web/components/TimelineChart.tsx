'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createBrowserClient } from '@/lib/supabase-client';

interface TimelineChartProps {
  hours?: number;
  domain?: string;
}

export function TimelineChart({ hours = 24, domain }: TimelineChartProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topDomains, setTopDomains] = useState<string[]>([]);

  useEffect(() => {
    fetchTimelineData();
  }, [hours, domain]);

  const fetchTimelineData = async () => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const params = new URLSearchParams({
        hours: hours.toString(),
      });

      if (domain) {
        params.append('domain', domain);
      }

      const response = await fetch(`/api/analytics/timeline?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        
        // Process data for chart
        const chartData = result.data.map((bucket: any) => {
          const row: any = {
            label: bucket.label,
            timestamp: bucket.timestamp,
            total: bucket.totalDwell,
          };

          // Add dwell time per domain
          bucket.domains.forEach((d: any) => {
            row[d.domain] = d.dwell;
          });

          return row;
        });

        // Find top domains by total dwell time
        const domainTotals: Record<string, number> = {};
        result.data.forEach((bucket: any) => {
          bucket.domains.forEach((d: any) => {
            domainTotals[d.domain] = (domainTotals[d.domain] || 0) + d.dwell;
          });
        });

        const top = Object.entries(domainTotals)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([domain]) => domain);

        setTopDomains(top);
        setData(chartData);
      }
    } catch (error) {
      console.error('Error fetching timeline data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
        <CardDescription>
          Dwell time per domain over the last {hours} hours
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground">
            Loading chart data...
          </div>
        ) : data.length === 0 || data.every((d) => d.total === 0) ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p>No activity data available for this time period.</p>
              <p className="text-sm mt-2">
                Visit{' '}
                <a href="/test-ingest" className="text-blue-600 underline">
                  /test-ingest
                </a>{' '}
                to add test events with dwell time.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  {topDomains.map((domain, index) => (
                    <linearGradient
                      key={domain}
                      id={`color${index}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor={colors[index]} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={colors[index]} stopOpacity={0.1} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={formatDuration}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                  formatter={(value: any) => formatDuration(value)}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(value) => value.length > 25 ? value.substring(0, 25) + '...' : value}
                />
                {topDomains.map((domain, index) => (
                  <Area
                    key={domain}
                    type="monotone"
                    dataKey={domain}
                    stackId="1"
                    stroke={colors[index]}
                    fill={`url(#color${index})`}
                    name={domain}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

