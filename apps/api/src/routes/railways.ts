import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getTrainLiveStatus } from '../services/railways/tracker';
import { getTrainRun } from '../services/railways/train-run';
import { RouteBiteError } from '../middleware/error-handler';

const app = new Hono();

const TrainParamsSchema = z.object({
  trainNumber: z.string().regex(/^\d{5}$/, 'Train number must be 5 digits'),
});

// GET /api/v1/railways/trains/:trainNumber/status — summary live status
app.get('/trains/:trainNumber/status', zValidator('param', TrainParamsSchema), async (c) => {
  const { trainNumber } = c.req.valid('param');
  try {
    const status = await getTrainLiveStatus(trainNumber);
    return c.json({ success: true, data: status });
  } catch (err) {
    throw new RouteBiteError('RAILWAYS_ERROR', (err as Error).message, 502);
  }
});

// GET /api/v1/railways/trains/:trainNumber/run — full trajectory + station ETAs
app.get('/trains/:trainNumber/run', zValidator('param', TrainParamsSchema), async (c) => {
  const { trainNumber } = c.req.valid('param');
  try {
    const run = await getTrainRun(trainNumber);
    return c.json({ success: true, data: run });
  } catch (err) {
    throw new RouteBiteError('RAILWAYS_ERROR', (err as Error).message, 502);
  }
});

export default app;
