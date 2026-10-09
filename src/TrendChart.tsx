import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Datum = Record<string, string | number | undefined>;

export default function TrendChart({ data, dataKey, label, unit, gradientId, compact = false, secondaryKey, secondaryLabel }: {
  data: Datum[];
  dataKey: string;
  label: string;
  unit: string;
  gradientId: string;
  compact?: boolean;
  secondaryKey?: string;
  secondaryLabel?: string;
}) {
  return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b9b76" stopOpacity={0.24} /><stop offset="100%" stopColor="#5b9b76" stopOpacity={0.01} /></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="#edf1ee" />
      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#87958d", fontSize: compact ? 10 : 11 }} />
      <YAxis hide={compact} axisLine={false} tickLine={false} tick={{ fill: "#99a59f", fontSize: 10 }} unit={unit} />
      <Tooltip contentStyle={{ border: "1px solid #e8eeeb", borderRadius: 14, boxShadow: "0 8px 24px #14372d12" }} labelStyle={{ color: "#53635d", fontSize: 12 }} formatter={(value, key) => [`${value} ${unit}`, key === secondaryKey ? secondaryLabel : label]} />
      <Area type="monotone" dataKey={dataKey} name={label} stroke="#5b9b76" strokeWidth={compact ? 2.5 : 3} fill={`url(#${gradientId})`} activeDot={{ r: 5 }} />
      {secondaryKey && <Area type="monotone" dataKey={secondaryKey} name={secondaryLabel} stroke="#86a7bd" strokeWidth={2} fill="transparent" activeDot={{ r: 4 }} />}
    </AreaChart>
  </ResponsiveContainer>;
}
