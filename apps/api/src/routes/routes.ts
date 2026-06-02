import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { JourneyInputSchema } from '@routebite/shared/schemas';
import { JOURNEY_CONSTRAINTS } from '@routebite/shared/constants';
import { mapsClient } from '../services/maps/client';
import { computeInterceptPoints } from '../services/intercept/algorithm';
import { RouteBiteError } from '../middleware/error-handler';
import { getDb } from '@routebite/db/client';
import { journeys, intercepts } from '@routebite/db/schema';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';

const app = new Hono();

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

  // Compute route
  const departureTime = data.departureTime ? new Date(data.departureTime) : undefined;
  const route = await mapsClient.computeRoute(
    originAddress,
    destAddress,
    data.transportMode,
    { departureTime }
  );

  const distanceM = route.distanceMeters;
  if (distanceM < JOURNEY_CONSTRAINTS.MIN_DISTANCE_M) {
    throw new RouteBiteError('ROUTE_TOO_SHORT', 'Journey must be at least 5 km', 400);
  }
  if (distanceM > JOURNEY_CONSTRAINTS.MAX_DISTANCE_M) {
    throw new RouteBiteError('ROUTE_TOO_LONG', 'Journey must be under 500 km', 400);
  }

  const journeyId = `jrn_${crypto.randomBytes(8).toString('hex')}`;

  // Geocode origin/destination for storage
  const originLL = await mapsClient.geocode(originAddress);
  const destLL = await mapsClient.geocode(destAddress);

  // Store journey (scoped to authenticated user)
  const user = c.get('user');
  const db = getDb();
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
    vehicleDetailsJson: JSON.stringify(data.vehicleDetails),
    routePolyline: route.encodedPolyline,
    estimatedDuration: route.durationSeconds,
  });

  // Compute intercepts (with road snapping for real-world accuracy)
  const interceptPoints = await computeInterceptPoints(
    {
      origin: originLL,
      destination: destLL,
      transportMode: data.transportMode,
      routePoints: route.polylinePoints,
      steps: route.steps,
    },
    route,
    undefined,
    { snapToRoads: true, departureTime }
  );

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
    },
  });
});

// GET /api/v1/routes/:journeyId
app.get('/:journeyId', async (c) => {
  const journeyId = c.req.param('journeyId');
  const user = c.get('user');
  const db = getDb();

  const journey = await db
    .select()
    .from(journeys)
    .where(and(eq(journeys.id, journeyId), eq(journeys.userId, user.id)))
    .get();

  if (!journey) {
    throw new RouteBiteError('NOT_FOUND', 'Journey not found', 404);
  }

  const interceptRows = await db
    .select()
    .from(intercepts)
    .where(eq(intercepts.journeyId, journeyId))
    .all();

  const routePoints = journey.routePolyline
    ? mapsClient.decodePolyline(journey.routePolyline)
    : [];

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
    },
  });
});

// GET /api/v1/routes/:journeyId/intercepts
app.get('/:journeyId/intercepts', async (c) => {
  const journeyId = c.req.param('journeyId');
  const user = c.get('user');
  const db = getDb();

  const journey = await db
    .select()
    .from(journeys)
    .where(and(eq(journeys.id, journeyId), eq(journeys.userId, user.id)))
    .get();

  if (!journey) {
    throw new RouteBiteError('NOT_FOUND', 'Journey not found', 404);
  }

  const points = await db
    .select()
    .from(intercepts)
    .where(eq(intercepts.journeyId, journeyId))
    .all();

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
    })),
  });
});

export default app;
