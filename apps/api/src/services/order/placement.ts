import { eq } from 'drizzle-orm';
import { getDb } from '@routebite/db/client';
import { orders, intercepts, journeys, users } from '@routebite/db/schema';
import type { PlaceOrderInput, PlaceOrderResult } from './types';
import { checkForDuplicateOrder } from './guard';
import { generateInterceptAddress } from './address';
import {
  ensureSwiggyAddressId,
  FOOD_CART_CAP_RUPEES,
  INSTAMART_MIN_RUPEES,
} from './swiggy-address';
import { calculateOrderTiming, estimatePrepTime, fallbackRiderTravel } from './timing';
import { buildRiderBrief, parseVehicleDetails } from './rider-brief';
import { ensureInterceptReachability } from './restaurant-rank';
import { isPointInsideRiderIsochrone } from '../maps/reachability';
import { getTrainRun } from '../railways/train-run';
import { etaForStationIntercept } from '../railways/train-journey';
import { SwiggyMCPClient } from '../swiggy/client';
import { RouteBiteError } from '../../middleware/error-handler';
import crypto from 'crypto';
import type {
  InterceptReachability,
  OrderStatus,
  TransportMode,
  VehicleDetails,
} from '@routebite/shared/types';
import { ISOCHRONE, MAPS_FEATURES } from '@routebite/shared/constants';
import { mealPrimingForInterceptEta } from '../fusion/meal-priming';
import { evaluateHaltGate } from '../fusion/halt-gate';
import type { DeferredPayload } from '../fusion/deferred-placer';

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
  const journey = await db.select().from(journeys).where(eq(journeys.id, input.journeyId)).get();
  const transportMode = (journey?.transportMode ?? 'car') as TransportMode;
  const vehicleDetails: VehicleDetails =
    parseVehicleDetails(journey?.vehicleDetailsJson) ?? { description: 'RouteBite journey' };
  const provisional = await generateInterceptAddress({ lat: intercept.lat, lng: intercept.lng });
  const riderBrief = buildRiderBrief(transportMode, vehicleDetails, provisional.label);

  const userRow = await db.select().from(users).where(eq(users.id, input.userId)).get();
  const userName = input.userName ?? userRow?.name ?? 'RouteBite User';
  const userPhone = input.userPhone ?? '9999999999';

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

  // 4. create_address (Instamart schema — shared address book)
  let addressId: string;
  let address = provisional;
  try {
    const created = await ensureSwiggyAddressId(client, { lat: intercept.lat, lng: intercept.lng }, {
      userName,
      userPhone,
      landmark: riderBrief,
    });
    addressId = created.addressId;
    address = created.address;
  } catch (err) {
    throw new RouteBiteError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Failed to create delivery address on Swiggy',
      502
    );
  }

  // 5. Update cart (official field names)
  if (input.server === 'food' && input.foodItems) {
    await client.updateFoodCart({
      restaurantId: input.restaurantId!,
      addressId,
      cartItems: input.foodItems.map((it) => ({
        itemId: it.menuItemId,
        quantity: it.quantity,
        ...(it.variantId ? { variantId: it.variantId } : {}),
        ...(it.addonIds?.length ? { addOns: it.addonIds } : {}),
      })),
    });

    if (input.couponCode) {
      await client.applyFoodCoupon({ couponCode: input.couponCode, addressId });
    }

    const cart = await client.getFoodCart({ addressId });
    const total = Number((cart.data as { total?: number } | undefined)?.total ?? 0);
    if (total >= FOOD_CART_CAP_RUPEES) {
      throw new RouteBiteError(
        'VALIDATION_ERROR',
        `Cart exceeds ₹${FOOD_CART_CAP_RUPEES} Builders Club testing cap`,
        400
      );
    }
  } else if (input.server === 'instamart' && input.productItems) {
    await client.updateInstamartCart({
      selectedAddressId: addressId,
      items: input.productItems.map((it) => ({
        spinId: it.variantId || it.productId,
        quantity: it.quantity,
      })),
    });

    const cart = await client.getInstamartCart();
    const total = Number((cart.data as { total?: number } | undefined)?.total ?? 0);
    if (total > 0 && total < INSTAMART_MIN_RUPEES) {
      throw new RouteBiteError(
        'VALIDATION_ERROR',
        `Instamart minimum order is ₹${INSTAMART_MIN_RUPEES}`,
        400
      );
    }
    if (total >= FOOD_CART_CAP_RUPEES) {
      throw new RouteBiteError(
        'VALIDATION_ERROR',
        `Cart exceeds ₹${FOOD_CART_CAP_RUPEES} Builders Club testing cap`,
        400
      );
    }
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

  // Isochrone feasibility: restaurant must be inside rider inbound polygon when enforced
  let reachability: InterceptReachability | null = null;
  if (intercept.reachabilityJson) {
    try {
      reachability = JSON.parse(intercept.reachabilityJson) as InterceptReachability;
    } catch {
      reachability = null;
    }
  }
  reachability = await ensureInterceptReachability(
    { lat: intercept.lat, lng: intercept.lng },
    intercept.estimatedDwellTime ?? customerETA,
    intercept.restaurantCount ?? undefined,
    reachability
  );

  if (
    MAPS_FEATURES.ISOCHRONES &&
    ISOCHRONE.ENFORCE_RESTAURANT_INSIDE &&
    input.restaurantLocation &&
    reachability?.riderIsochrone
  ) {
    const inside = isPointInsideRiderIsochrone(input.restaurantLocation, reachability);
    if (inside === false) {
      throw new RouteBiteError(
        'VALIDATION_ERROR',
        `Restaurant is outside the rider's ${Math.round((reachability.riderBudgetSeconds ?? 0) / 60)}-minute reachability zone for this intercept. Pick a closer restaurant.`,
        400
      );
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
      : undefined,
    { includeWeatherBuffer: true, server: input.server }
  );

  // 7. Place order (if timing === 'now', else queue for auto-place)
  let swiggyOrderId: string | undefined;
  let status: OrderStatus = 'pending';

  const mealHint = mealPrimingForInterceptEta(customerETA, input.server);
  const haltGate = evaluateHaltGate({
    dwellSeconds: intercept.estimatedDwellTime ?? customerETA,
    prepSeconds: prepTime,
    riderTravelSeconds: timing.riderTravel,
    safetyBufferSeconds: timing.safetyBuffer,
    trafficBufferSeconds: timing.trafficBuffer,
    weatherBufferSeconds: timing.weatherBuffer,
    transportMode,
  });

  if (input.timing === 'auto' && !haltGate.ok && transportMode === 'train') {
    throw new RouteBiteError(
      'VALIDATION_ERROR',
      `${haltGate.message} ${haltGate.recommendation ?? ''}`.trim(),
      400
    );
  }

  if (input.timing === 'now') {
    if (!haltGate.ok) {
      throw new RouteBiteError(
        'VALIDATION_ERROR',
        `${haltGate.message} ${haltGate.recommendation ?? ''}`.trim(),
        400
      );
    }
    const orderRes =
      input.server === 'food'
        ? await client.placeFoodOrder({
            addressId,
            paymentMethod: input.paymentMethod ?? 'COD',
          })
        : await client.placeInstamartOrder({
            addressId,
            paymentMethod: input.paymentMethod ?? 'COD',
          });

    if (!orderRes.success || !orderRes.data) {
      throw new RouteBiteError(
        'ORDER_NON_IDEMPOTENT',
        orderRes.error?.message ?? 'Order placement failed',
        502
      );
    }

    const data = orderRes.data as { orderId?: string };
    swiggyOrderId = data.orderId;
    status = 'confirmed';
  }

  const deferredPayload =
    input.timing === 'auto'
      ? JSON.stringify({
          server: input.server,
          addressId,
          restaurantId: input.restaurantId,
          restaurantLocation: input.restaurantLocation,
          foodItems: input.foodItems,
          productItems: input.productItems,
          paymentMethod: input.paymentMethod,
          couponCode: input.couponCode,
          dwellSeconds: intercept.estimatedDwellTime ?? customerETA,
          customerEtaSeconds: customerETA,
        } satisfies DeferredPayload)
      : null;

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
    totalAmount: 0,
    timingType: input.timing,
    placedAt: input.timing === 'now' ? new Date() : undefined,
    autoPlaceAt: input.timing === 'auto' ? timing.autoPlaceAt : undefined,
    deferredPayloadJson: deferredPayload,
    placeAttempts: 0,
    swiggyAddressId: addressId,
    mealQueryHint: mealHint.primaryQuery,
    haltGateJson: JSON.stringify(haltGate),
    notes: `Delivery to: ${address.formatted}\n\nRider brief: ${riderBrief}\nMeal: ${mealHint.hint}`,
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
    mealHint,
    haltGate,
  };
}
