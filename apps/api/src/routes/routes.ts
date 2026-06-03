import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { JourneyInputSchema } from '@routebite/shared/schemas';
import { JOURNEY_CONSTRAINTS } from '@routebite/shared/constants';
import { mapsClient } from '../services/maps/client';
import { computeInterceptPoints } from '../services/intercept/algorithm';
import { buildTrainJourneyPlan, etaForStationIntercept } from '../services/railways/train-journey';
import { getTrainRun } from '../services/railways/train-run';
import { buildStationIndex } from '../services/railways/ntes/stations';
import { parseStationCodeFromLabel } from '../services/railways/ntes/station-code';
import { denyAccess } from '../lib/access-control';
import { RouteBiteError } from '../middleware/error-handler';
import { getDb } from '@routebite/db/client';
import { journeys, intercepts } from '@routebite/db/schema';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { GPSPositionSchema, VehicleDetailsSchema } from '@routebite/shared/schemas';

const app = new Hono();

async function requireJourneyOwnership(journeyId: string, userId: number, c: Context) {
  const db = getDb();
  const journey = await db.select().from(journeys).where(eq(journeys.id, journeyId)).get();
  if (!journey) {
    denyAccess(c, { resource: 'journey', resourceId: journeyId });
  }
  if (journey.userId !== userId) {
    denyAccess(c, { resource: 'journey', resourceId: journeyId, ownerUserId: journey.userId });
  }
  return journey;
}

const AnalyzeRouteSchema = JourneyInputSchema.extend({
  origin: z.string().min(1),
  destination: z.string().min(1),
  validateAddresses: z.boolean().optional().default(true),
  departureTime: z.string().datetime().optional(),
});

app.post('/analyze', zValidator('json', AnalyzeRouteSchema), async (c) => {
  const data = c.req.valid('json');

  // Validate addresses (catches typos, standardizes format)
  let originAddress = data.origin;
  let destAddress = data.destination;

  if (data.validateAddresses) {
    try {
      const [originValid, destValid] = await Promise.all([
        mapsClient.validateAddress(data.origin),
        mapsClient.validateAddress(data.destination),
      ]);
      if (originValid.valid) originAddress = originValid.formattedAddress;
      if (destValid.valid) destAddress = destValid.formattedAddress;
    } catch {
      // Fall back to raw addresses if validation fails
    }
  }

  const departureTime = data.departureTime ? new Date(data.departureTime) : undefined;

  // Geocode origin/destination for storage
  const originLL = await mapsClient.geocode(originAddress);
  const destLL = await mapsClient.geocode(destAddress);

  const user = c.get('user');
  const db = getDb();

  let route: Awaited<ReturnType<typeof mapsClient.computeRoute>>;
  let interceptPoints: Awaited<ReturnType<typeof computeInterceptPoints>>;
  let trainRunSnapshot: Awaited<ReturnType<typeof buildTrainJourneyPlan>>['trainRun'] | undefined;

  // Train + NTES: live schedule/run drives trajectory and station intercepts
  if (data.transportMode === 'train' && data.vehicleDetails.trainNumber) {
    const plan = await buildTrainJourneyPlan({
      trainNumber: data.vehicleDetails.trainNumber,
      origin: originLL,
      destination: destLL,
    });

    trainRunSnapshot = plan.trainRun;
    interceptPoints = plan.interceptPoints;
    route = {
      polylinePoints: plan.routePoints,
      encodedPolyline: plan.encodedPolyline,
      distanceMeters: plan.distanceMeters,
      durationSeconds: plan.durationSeconds,
      steps: [],
      hasTolls: false,
    };
  } else {
    route = await mapsClient.computeRoute(originAddress, destAddress, data.transportMode, {
      departureTime,
      extraComputations: data.transportMode === 'train' ? false : undefined,
    });

    interceptPoints = await computeInterceptPoints(
      {
        origin: originLL,
        destination: destLL,
        transportMode: data.transportMode,
        routePoints: route.polylinePoints,
        steps: route.steps,
      },
      route,
      undefined,
      { snapToRoads: data.transportMode !== 'train', departureTime }
    );
  }

  const distanceM = route.distanceMeters;
  if (distanceM < JOURNEY_CONSTRAINTS.MIN_DISTANCE_M) {
    throw new RouteBiteError('ROUTE_TOO_SHORT', 'Journey must be at least 5 km', 400);
  }
  if (distanceM > JOURNEY_CONSTRAINTS.MAX_DISTANCE_M) {
    throw new RouteBiteError('ROUTE_TOO_LONG', 'Journey must be under 500 km', 400);
  }

  const journeyId = `jrn_${crypto.randomBytes(8).toString('hex')}`;

  const vehiclePayload = trainRunSnapshot
    ? {
        ...data.vehicleDetails,
        trainRunSnapshot: {
          startDate: trainRunSnapshot.startDate,
          trainName: trainRunSnapshot.trainName,
          updatedAt: trainRunSnapshot.updatedAt,
        },
      }
    : data.vehicleDetails;

  await db.insert(journeys).values({
    id: journeyId,
    userId: user.id,
    originAddress,
    originLat: originLL.lat,
    originLng: originLL.lng,
    destAddress,
    destLat: destLL.lat,
    destLng: destLL.lng,
    transportMode: data.transportMode,
    vehicleDetailsJson: JSON.stringify(vehiclePayload),
    routePolyline: route.encodedPolyline,
    estimatedDuration: route.durationSeconds,
  });

  const weatherWarnings = interceptPoints
    .filter(p => p.weatherRisk)
    .map(p => ({
      lat: p.lat,
      lng: p.lng,
      title: p.weatherAlertTitle ?? 'Weather advisory',
    }));

  // Store intercepts
  if (interceptPoints.length > 0) {
    await db.insert(intercepts).values(
      interceptPoints.map(p => ({
        id: `int_${crypto.randomBytes(6).toString('hex')}`,
        journeyId,
        lat: p.lat,
        lng: p.lng,
        type: p.type,
        score: p.score,
        estimatedDwellTime: p.dwellTime,
        restaurantCount: p.restaurantCount,
        safetyRating: p.safetyRating,
        name: p.name,
      }))
    );
  }

  return c.json({
    success: true,
    data: {
      journeyId,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      interceptCount: interceptPoints.length,
      hasTolls: route.hasTolls ?? false,
      weatherWarnings,
      trainRun: trainRunSnapshot
        ? {
            trainNumber: trainRunSnapshot.trainNumber,
            trainName: trainRunSnapshot.trainName,
            startDate: trainRunSnapshot.startDate,
            stationCount: trainRunSnapshot.stations.length,
            upcomingStops: trainRunSnapshot.stations.filter(s => !s.passed && s.haltSeconds >= 180).length,
          }
        : undefined,
    },
  });
});

// GET /api/v1/routes/:journeyId
app.get('/:journeyId', async (c) => {
  const journeyId = c.req.param('journeyId');
  const user = c.get('user');
  const db = getDb();

  const journey = await requireJourneyOwnership(journeyId, user.id, c);

  const interceptRows = await db
    .select()
    .from(intercepts)
    .where(eq(intercepts.journeyId, journeyId))
    .all();

  const routePoints = journey.routePolyline
    ? mapsClient.decodePolyline(journey.routePolyline)
    : [];

  let vehicleDetails = null;
  if (journey.vehicleDetailsJson) {
    try {
      vehicleDetails = VehicleDetailsSchema.parse(JSON.parse(journey.vehicleDetailsJson));
    } catch {
      vehicleDetails = null;
    }
  }

  return c.json({
    success: true,
    data: {
      id: journey.id,
      originAddress: journey.originAddress,
      originLat: journey.originLat,
      originLng: journey.originLng,
      destinationAddress: journey.destAddress,
      destinationLat: journey.destLat,
      destinationLng: journey.destLng,
      transportMode: journey.transportMode,
      estimatedDuration: journey.estimatedDuration ?? 0,
      routePolyline: journey.routePolyline ?? null,
      routePoints,
      interceptCount: interceptRows.length,
      vehicleDetails,
    },
  });
});

// GET /api/v1/routes/:journeyId/intercepts
app.get('/:journeyId/intercepts', async (c) => {
  const journeyId = c.req.param('journeyId');
  const user = c.get('user');
  const db = getDb();

  const journey = await requireJourneyOwnership(journeyId, user.id, c);

  const points = await db
    .select()
    .from(intercepts)
    .where(eq(intercepts.journeyId, journeyId))
    .all();

  let liveRun: Awaited<ReturnType<typeof getTrainRun>> | undefined;
  if (journey.transportMode === 'train') {
    let trainNumber: string | undefined;
    if (journey.vehicleDetailsJson) {
      try {
        const vd = JSON.parse(journey.vehicleDetailsJson) as { trainNumber?: string };
        trainNumber = vd.trainNumber;
      } catch {
        trainNumber = undefined;
      }
    }
    if (trainNumber) {
      liveRun = await getTrainRun(trainNumber);
    }
  }

  const stationIndex = liveRun ? buildStationIndex(liveRun.run.stations) : undefined;

  return c.json({
    success: true,
    data: points.map(p => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      type: p.type,
      score: p.score,
      dwellTime: p.estimatedDwellTime ?? 0,
      restaurantCount: p.restaurantCount ?? 0,
      safetyRating: p.safetyRating ?? 3,
      name: p.name ?? undefined,
      etaSeconds: stationIndex ? etaForStationIntercept(liveRun!.run, p.name, stationIndex) : undefined,
      stationCode: parseStationCodeFromLabel(p.name),
    })),
  });
});

const TelemetrySchema = z.object({
  vehicleDetails: VehicleDetailsSchema.partial().optional(),
  liveLocation: GPSPositionSchema.optional(),
  liveLocationSharing: z.boolean().optional(),
});

function mergeVehicleDetails(
  existingJson: string | null | undefined,
  patch: z.infer<typeof TelemetrySchema>
) {
  let current: Record<string, unknown> = {};
  if (existingJson) {
    try {
      current = JSON.parse(existingJson) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }
  if (patch.vehicleDetails) {
    Object.assign(current, patch.vehicleDetails);
  }
  if (patch.liveLocationSharing !== undefined) {
    current.liveLocationSharing = patch.liveLocationSharing;
  }
  if (patch.liveLocation) {
    current.liveLocation = patch.liveLocation;
  }
  return VehicleDetailsSchema.parse({
    description: (current.description as string) ?? 'RouteBite journey',
    ...current,
  });
}

// PATCH /api/v1/routes/:journeyId/telemetry — live GPS + vehicle profile updates
app.patch('/:journeyId/telemetry', zValidator('json', TelemetrySchema), async (c) => {
  const journeyId = c.req.param('journeyId');
  const user = c.get('user');
  const body = c.req.valid('json');
  const db = getDb();

  const journey = await requireJourneyOwnership(journeyId, user.id, c);

  const merged = mergeVehicleDetails(journey.vehicleDetailsJson, body);

  await db
    .update(journeys)
    .set({ vehicleDetailsJson: JSON.stringify(merged) })
    .where(eq(journeys.id, journeyId));

  return c.json({ success: true, data: { vehicleDetails: merged } });
});

export default app;
