import { z } from 'zod';
import type { InvocationDescriptor, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types';
import { ReportSchema, ReportIndexSchema } from './report.ts';
import type { Report, ReportIndex } from './report.ts';

const idSchema = z.string().min(1);
const descriptors: InvocationDescriptor[] = [
  { method: 'list', names: ['session_id'], schema: z.array(ReportIndexSchema) },
  { method: 'get', names: ['session_id', 'report_id'], schema: ReportSchema.optional() },
  { method: 'watch', names: ['session_id'], schema: z.array(ReportIndexSchema) },
].map(({ method, names, schema }) => ({
  id: `dsh-plugin-noema#noema/${method}`,
  service: 'noema',
  namespace: 'noema',
  method,
  invocation: { kind: 'direct' },
  ...(method === 'watch' ? { mode: 'stream' as const } : {}),
  cancellation: { parameter: 'signal' },
  parameters: names.map((name) => ({
    name,
    wire: name,
    source: 'json',
    codec: { mode: 'strict', typeSymbol: 'NoemaId', create: () => idSchema },
  })),
  result: {
    mode: 'strict',
    typeSymbol: method === 'get' ? 'NoemaReport' : 'NoemaReportIndex',
    create: () => schema,
  },
}));

export const TYPERT: TypertContribution = {
  package: 'dsh-plugin-noema',
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: descriptors,
};
export const REMOTE: TypertRemoteContribution = { package: 'dsh-plugin-noema', descriptors };

export interface NoemaRemote {
  list(session_id: string, signal?: AbortSignal): Promise<RemoteResult<ReportIndex[]>>;
  get(session_id: string, report_id: string, signal?: AbortSignal): Promise<RemoteResult<Report | undefined>>;
  watch(session_id: string, signal?: AbortSignal): AsyncIterable<ReportIndex[]>;
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    noema: NoemaRemote;
  }
}
