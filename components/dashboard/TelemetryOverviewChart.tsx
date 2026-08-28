'use client';

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Spacecraft, TelemetryReading } from '@/lib/types';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingState';
import { BarChart2 } from 'lucide-react';
import { format } from 'date-fns';

interface TelemetryOverviewChartProps {
  spacecraft: Spacecraft[];
}

interface ChartDataPoint {
  time: string;
  battery: number;
  temperature: number;
  power: number;
  signal: number;
}

const CHART_PARAMS = [
  { key: 'battery', label: 'Battery Voltage (V)', color: '#3b82f6', unit: 'V' },
  { key: 'temperature', label: 'Internal Temp (°C)', color: '#f97316', unit: '°C' },
  { key: 'power', label: 'Power Consumption (W)', color: '#a855f7', unit: 'W' },
  { key: 'signal', label: 'Signal Strength (dBm)', color: '#06b6d4', unit: 'dBm' },
];

export function TelemetryOverviewChart({ spacecraft }: TelemetryOverviewChartProps) {
  const [selectedParam, setSelectedParam] = useState<string>('battery');
  const [selectedSc, setSelectedSc] = useState<string>('ORBIT-01');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const res = await fetch(`/api/telemetry?spacecraft_id=${selectedSc}&hours=6`);
        const json = await res.json();
        const readings: TelemetryReading[] = json.telemetry || [];

        // Sample every 6 readings (30-min intervals for chart clarity)
        const sampled = readings.filter((_, i) => i % 6 === 0);

        const points: ChartDataPoint[] = sampled.map(r => ({
          time: format(new Date(r.timestamp), 'HH:mm'),
          battery: parseFloat(r.battery_voltage.toFixed(2)),
          temperature: parseFloat(r.temperature_internal.toFixed(1)),
          power: parseFloat(r.power_consumption.toFixed(0)),
          signal: parseFloat(r.signal_strength.toFixed(1)),
        }));

        setChartData(points);
      } catch (e) {
        console.error('Telemetry fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchTelemetry();
  }, [selectedSc]);

  const currentParam = CHART_PARAMS.find(p => p.key === selectedParam)!;

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      const value = payload[0]?.value;
      return (
        <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg px-3 py-2 text-xs">
          <div className="text-slate-400 mb-1">{label}</div>
          <div className="text-slate-100 font-mono font-medium">
            {value?.toFixed?.(2)} {currentParam.unit}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader
        title="Telemetry Overview"
        subtitle={`${selectedSc} — last 6 hours`}
        icon={<BarChart2 className="w-4 h-4 text-blue-400" />}
        actions={
          <div className="flex items-center gap-2">
            {/* Spacecraft selector */}
            <select
              value={selectedSc}
              onChange={e => { setSelectedSc(e.target.value); setLoading(true); }}
              className="bg-[#080d1a] border border-[#1e2d4a] text-slate-300 text-xs rounded-md px-2 py-1 outline-none focus:border-blue-500/50"
            >
              {spacecraft.map(sc => (
                <option key={sc.id} value={sc.id}>{sc.name}</option>
              ))}
            </select>

            {/* Parameter selector */}
            <select
              value={selectedParam}
              onChange={e => setSelectedParam(e.target.value)}
              className="bg-[#080d1a] border border-[#1e2d4a] text-slate-300 text-xs rounded-md px-2 py-1 outline-none focus:border-blue-500/50"
            >
              {CHART_PARAMS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        }
      />
      <CardBody className="px-4 pt-2 pb-4">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={45}
                />
                <Tooltip content={customTooltip} />
                <Line
                  type="monotone"
                  dataKey={selectedParam}
                  stroke={currentParam.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: currentParam.color }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Quick stats row */}
        {chartData.length > 0 && !loading && (() => {
          const vals = chartData.map(d => (d as any)[selectedParam] as number);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const latest = vals[vals.length - 1];
          return (
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#1e2d4a]">
              {[
                { label: 'Current', value: latest },
                { label: 'Average', value: avg },
                { label: 'Min', value: min },
                { label: 'Max', value: max },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-[10px] text-slate-500 uppercase mb-0.5">{label}</div>
                  <div className="text-sm font-mono text-slate-200 font-medium">
                    {value.toFixed(1)}{currentParam.unit}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </CardBody>
    </Card>
  );
}
