import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { orders, intercepts, journeys } from '@routebite/db/schema';
import type { PlaceOrderInput, PlaceOrderResult } from './types';
import { checkForDuplicateOrder } from './guard';
import { generateInterceptAddress } from './address';
import { calculateOrderTiming, estimatePrepTime, fallbackRiderTravel } from './timing';
import { buildRiderBrief, parseVehicleDetails } from './rider-brief';
import { getTrainRun } from '../railways/train-run';
import { etaForStationIntercept } from '../railways/train-journey';
import { SwiggyMCPClient } from '../swiggy/client';
import { RouteBiteError } from '../../middleware/error-handler';
import crypto from 'crypto';
import type { OrderStatus, TransportMode, VehicleDetails } from '@routebite/shared/types';

export async function placeOrder(
  input: PlaceOrderInput,
  accessToken: string
): Promise<PlaceOrderResult> {
  const db = getDb();
  const client = new SwiggyMCPClient(accessToken);

  // 1. Fetch intercept details from DB
  const intercept = await db.select().from(intercepts).where(eq(intercepts.id, input.interceptId)).get();
  if (!intercept) {
    throw new RouteBiteError('VALIDATION_ERROR', 'Intercept not found', 404);
  }

  // 2. Generate delivery address + rider-facing brief from journey vehicle profile
  const address = await generateInterceptAddress({ lat: intercept.lat, lng: intercept.lng });
  const journey = await db.select().from(journeys).where(eq(journeys.id, input.journeyId)).get();
  const transportMode = (journey?.transportMode ?? 'car') as TransportMode;
  const vehicleDetails: VehicleDetails =
    parseVehicleDetails(journey?.vehicleDetailsJson) ?? { description: 'RouteBite journey' };
  const riderBrief = buildRiderBrief(transportMode, vehicleDetails, address.label);

  // 3. Double-submit guard
  const itemCount = input.foodItems?.length ?? input.productItems?.length ?? 0;
  const itemsHash = crypto.createHash('sha256')
    .update(JSON.stringify(input.foodItems ?? input.productItems))
    .digest('hex')
    .slice(0, 16);

  const duplicateId = await checkForDuplicateOrder(client, input.server, input.interceptId, itemsHash);
  if (duplicateId) {
    throw new RouteBiteError('ORDER_DOUBLE_SUBMIT', `Duplicate order detected: ${duplicateId}`, 409);
  }

  // 4. Create address on Swiggy (mock supports this)
  const addrRes = await client.callTool(
    'create_address',
    { label: address.label, address: address.formatted, landmark: riderBrief },
    input.server
  );
  if (!addrRes.success) {
    throw new RouteBiteError('NETWORK_ERROR', 'Failed to create delivery address on Swiggy', 502);
  }

  // 5. Update cart
  if (input.server === 'food' && input.foodItems) {
    await client.updateFoodCart({
      restaurantId: input.restaurantId!,
      items: input.foodItems.map(it => ({
        itemId: it.menuItemId,
        variantId: it.variantId,
        addOns: it.addonIds,
        quantity: it.quantity,
      })),
    });
  } else if (input.server === 'instamart' && input.productItems) {
    await client.updateInstamartCart({
      items: input.productItems.map(it => ({
        productId: it.productId,
        variantId: it.variantId,
        quantity: it.quantity,
      })),
    });
  }

  // 6. Calculate timing — for trains use NTES live ETA to station intercept
  const prepTime = estimatePrepTime(input.server, itemCount);
  let customerETA = intercept.estimatedDwellTime ?? 300;

  if (transportMode === 'train' && vehicleDetails.trainNumber) {
    try {
      const run = await getTrainRun(vehicleDetails.trainNumber);
      const ntesEta = etaForStationIntercept(run.run, intercept.name);
      if (ntesEta != null) customerETA = ntesEta;
    } catch {
      // keep dwell fallback
    }
  }

  const timing = await calculateOrderTiming(
    customerETA,
    prepTime,
    input.server === 'food' ? 'bike' : 'car',
    input.restaurantLocation
      ? {
          restaurant: input.restaurantLocation,
          intercept: { lat: intercept.lat, lng: intercept.lng },
        }
      : undefined
  );

  // 7. Place order (if timing === 'now', else queue for auto-place)
  let swiggyOrderId: string | undefined;
  let status: OrderStatus = 'pending';

  if (input.timing === 'now') {
    const orderRes =
      input.server === 'food'
        ? await client.placeFoodOrder({ paymentMethod: input.paymentMethod ?? 'COD' })
        : await client.placeInstamartOrder({ paymentMethod: input.paymentMethod ?? 'COD' });

    if (!orderRes.success || !orderRes.data) {
      throw new RouteBiteError(
        'ORDER_NON_IDEMPOTENT',
        orderRes.error?.message ?? 'Order placement failed',
        502
      );
    }

    const data = orderRes.data as any;
    swiggyOrderId = data.orderId;
    status = 'confirmed';
  }

  // 8. Persist order in DB
  const orderId = `ord_${crypto.randomBytes(8).toString('hex')}`;
  await db.insert(orders).values({
    id: orderId,
    userId: input.userId,
    journeyId: input.journeyId,
    interceptId: input.interceptId,
    swiggyOrderId,
    server: input.server,
    status,
    totalAmount: 0, // Will be updated after Swiggy confirms
    timingType: input.timing,
    placedAt: input.timing === 'now' ? new Date() : undefined,
    notes: `Delivery to: ${address.formatted}\n\nRider brief: ${riderBrief}`,
  });

  return {
    orderId,
    swiggyOrderId,
    status,
    totalAmount: 0,
    estimatedDeliveryTime: timing.autoPlaceAt.toISOString(),
    interceptAddress: address.formatted,
    riderBrief,
    timing: input.timing,
    autoPlaceAt: input.timing === 'auto' ? timing.autoPlaceAt.toISOString() : undefined,
  };
}
