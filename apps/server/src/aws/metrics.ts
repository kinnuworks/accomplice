// CloudWatch metrics through the Embedded Metric Format: one JSON line on stdout per data point.
// The ECS log driver ships stdout to CloudWatch Logs, which turns these lines into metrics.
// No PutMetricData calls and no extra IAM permissions are needed. Enabled with EMF_METRICS=on.

const NAMESPACE = process.env.EMF_NAMESPACE || 'Accomplice';
const SERVICE = process.env.EMF_SERVICE || 'game-server';

export const emfEnabled = () => (process.env.EMF_METRICS ?? 'off') === 'on';

type Unit = 'Count' | 'Milliseconds' | 'None';

/** Emit one or more metrics that share a dimension set. Values are numbers; non-finite values are skipped. */
export function emit(metrics: Record<string, { value: number; unit: Unit }>, props: Record<string, unknown> = {}) {
  if (!emfEnabled()) return;
  const defs: { Name: string; Unit: Unit }[] = [];
  const values: Record<string, number> = {};
  for (const [name, m] of Object.entries(metrics)) {
    if (!Number.isFinite(m.value)) continue;
    defs.push({ Name: name, Unit: m.unit });
    values[name] = m.value;
  }
  if (!defs.length) return;
  const line = {
    _aws: { Timestamp: Date.now(), CloudWatchMetrics: [{ Namespace: NAMESPACE, Dimensions: [['Service']], Metrics: defs }] },
    Service: SERVICE,
    ...props,
    ...values,
  };
  process.stdout.write(JSON.stringify(line) + '\n');
}
