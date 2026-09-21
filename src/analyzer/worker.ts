import { parentPort, workerData } from 'node:worker_threads';
import { compareSnapshots, ReportRequestSchema } from '../compare.ts';

const result = await compareSnapshots(ReportRequestSchema.parse(workerData));
parentPort!.postMessage(result);
