/**
 * Swiggy agent guidance: meal-time cuisine priming.
 * Fused with intercept arrival clock (journey ETA → local hour).
 */
export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'late_night';

const SLOT_QUERIES: Record<MealSlot, { food: string[]; instamart: string[]; label: string }> = {
  breakfast: {
    label: 'Breakfast',
    food: ['idli', 'dosa', 'paratha', 'filter coffee'],
    instamart: ['milk', 'bread', 'bananas', 'eggs'],
  },
  lunch: {
    label: 'Lunch',
    food: ['thali', 'biryani', 'rice bowl', 'meals'],
    instamart: ['water', 'curd', 'fruit'],
  },
  snack: {
    label: 'Snack',
    food: ['rolls', 'momos', 'sandwich', 'chai'],
    instamart: ['chips', 'juice', 'biscuits'],
  },
  dinner: {
    label: 'Dinner',
    food: ['biryani', 'north indian', 'chinese', 'pizza'],
    instamart: ['water', 'dessert', 'oral rehydration'],
  },
  late_night: {
    label: 'Late night',
    food: ['pizza', 'burger', 'shawarma', 'noodles'],
    instamart: ['energy drink', 'chocolates', 'instant noodles'],
  },
};

export function mealSlotFromHour(hour: number): MealSlot {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'late_night';
}

/** Arrive-at-intercept local hour from now + etaSeconds. */
export function mealPrimingForInterceptEta(
  etaSeconds: number,
  server: 'food' | 'instamart' = 'food',
  now = new Date()
) {
  const arrive = new Date(now.getTime() + Math.max(0, etaSeconds) * 1000);
  const hour = arrive.getHours();
  const slot = mealSlotFromHour(hour);
  const pack = SLOT_QUERIES[slot];
  const queries = server === 'food' ? pack.food : pack.instamart;
  return {
    slot,
    label: pack.label,
    arriveAt: arrive.toISOString(),
    localHour: hour,
    primaryQuery: queries[0]!,
    queries,
    hint: `You'll arrive around ${arrive.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    })} — try ${queries.slice(0, 2).join(' / ')}.`,
  };
}
