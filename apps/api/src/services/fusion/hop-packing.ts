import {
  FOOD_CART_CAP_RUPEES,
  INSTAMART_MIN_RUPEES,
} from '../order/swiggy-address';

export interface HopCartLine {
  id: string;
  name: string;
  priceRupees: number;
  quantity: number;
  server: 'food' | 'instamart';
}

export interface HopPackPlan {
  foodCapRupees: number;
  instamartMinRupees: number;
  foodHops: Array<{
    hopIndex: number;
    lines: HopCartLine[];
    subtotalRupees: number;
    note: string;
  }>;
  instamartHops: Array<{
    hopIndex: number;
    lines: HopCartLine[];
    subtotalRupees: number;
    note: string;
  }>;
  warnings: string[];
}

/** Split lines across hops when Food ₹1000 / Instamart ₹99 constraints apply. */
export function planHopPacking(lines: HopCartLine[]): HopPackPlan {
  const food = lines.filter((l) => l.server === 'food');
  const im = lines.filter((l) => l.server === 'instamart');
  const warnings: string[] = [];

  const foodHops: HopPackPlan['foodHops'] = [];
  let bucket: HopCartLine[] = [];
  let sub = 0;
  let hop = 0;
  for (const line of food) {
    const lineTotal = line.priceRupees * line.quantity;
    if (lineTotal >= FOOD_CART_CAP_RUPEES) {
      warnings.push(`${line.name} alone is ≥ ₹${FOOD_CART_CAP_RUPEES} — reduce qty.`);
    }
    if (sub + lineTotal >= FOOD_CART_CAP_RUPEES && bucket.length) {
      foodHops.push({
        hopIndex: hop++,
        lines: bucket,
        subtotalRupees: sub,
        note: `Place at intercept hop ${hop} (under ₹${FOOD_CART_CAP_RUPEES} Food cap)`,
      });
      bucket = [];
      sub = 0;
    }
    bucket.push(line);
    sub += lineTotal;
  }
  if (bucket.length) {
    foodHops.push({
      hopIndex: hop,
      lines: bucket,
      subtotalRupees: sub,
      note: `Final Food hop (₹${sub.toFixed(0)} / ₹${FOOD_CART_CAP_RUPEES})`,
    });
  }

  const instamartHops: HopPackPlan['instamartHops'] = [];
  if (im.length) {
    const imSub = im.reduce((s, l) => s + l.priceRupees * l.quantity, 0);
    if (imSub > 0 && imSub < INSTAMART_MIN_RUPEES) {
      warnings.push(`Instamart cart ₹${imSub.toFixed(0)} is under ₹${INSTAMART_MIN_RUPEES} minimum.`);
    }
    if (imSub >= FOOD_CART_CAP_RUPEES) {
      // split IM similarly using food cap as soft ceiling from docs testing cap
      let b: HopCartLine[] = [];
      let s = 0;
      let h = 0;
      for (const line of im) {
        const t = line.priceRupees * line.quantity;
        if (s + t >= FOOD_CART_CAP_RUPEES && b.length) {
          instamartHops.push({
            hopIndex: h++,
            lines: b,
            subtotalRupees: s,
            note: `Instamart hop ${h}`,
          });
          b = [];
          s = 0;
        }
        b.push(line);
        s += t;
      }
      if (b.length) {
        instamartHops.push({
          hopIndex: h,
          lines: b,
          subtotalRupees: s,
          note: `Instamart hop ${h + 1}`,
        });
      }
    } else {
      instamartHops.push({
        hopIndex: 0,
        lines: im,
        subtotalRupees: imSub,
        note: `Instamart essentials (≥ ₹${INSTAMART_MIN_RUPEES})`,
      });
    }
  }

  if (foodHops.length > 1) {
    warnings.push(
      `Food cart needs ${foodHops.length} intercept hops under the ₹${FOOD_CART_CAP_RUPEES} cap.`
    );
  }

  return {
    foodCapRupees: FOOD_CART_CAP_RUPEES,
    instamartMinRupees: INSTAMART_MIN_RUPEES,
    foodHops,
    instamartHops,
    warnings,
  };
}
