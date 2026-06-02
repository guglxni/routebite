import crypto from "crypto";

export const restaurants = [
  { id: "res_1", name: "Biryani Blues", cuisine: ["Biryani", "North Indian"], rating: 4.3, ratingCount: 2300, costForTwo: 400, availabilityStatus: "OPEN", deliveryTime: "30-40 min", address: "Sector 18, Noida" },
  { id: "res_2", name: "Pizza Hut", cuisine: ["Pizza", "Fast Food"], rating: 4.1, ratingCount: 5400, costForTwo: 500, availabilityStatus: "OPEN", deliveryTime: "25-35 min", address: "DLF Mall, Noida" },
  { id: "res_3", name: "Haldiram's", cuisine: ["North Indian", "South Indian", "Street Food"], rating: 4.5, ratingCount: 8900, costForTwo: 350, availabilityStatus: "OPEN", deliveryTime: "20-30 min", address: "Connaught Place, Delhi" },
  { id: "res_4", name: "Subway", cuisine: ["Healthy Food", "Fast Food"], rating: 3.9, ratingCount: 1200, costForTwo: 300, availabilityStatus: "OPEN", deliveryTime: "15-25 min", address: "Rajiv Chowk Metro, Delhi" },
  { id: "res_5", name: "Sagar Ratna", cuisine: ["South Indian"], rating: 4.4, ratingCount: 3100, costForTwo: 450, availabilityStatus: "OPEN", deliveryTime: "30-40 min", address: "Karol Bagh, Delhi" },
  { id: "res_6", name: "Karim's", cuisine: ["Mughlai", "North Indian"], rating: 4.6, ratingCount: 6700, costForTwo: 600, availabilityStatus: "OPEN", deliveryTime: "40-50 min", address: "Jama Masjid, Delhi" },
  { id: "res_7", name: "Wow! Momo", cuisine: ["Momos", "Chinese"], rating: 4.2, ratingCount: 4200, costForTwo: 250, availabilityStatus: "OPEN", deliveryTime: "20-30 min", address: "Lajpat Nagar, Delhi" },
  { id: "res_8", name: "KFC", cuisine: ["Burger", "Fast Food"], rating: 4.0, ratingCount: 7800, costForTwo: 450, availabilityStatus: "CLOSED", deliveryTime: "25-35 min", address: "Ambience Mall, Gurgaon" },
];

export const menuItems: Record<string, any[]> = {
  res_1: [
    { id: "item_1_1", name: "Hyderabadi Biryani", price: 320, description: "Aromatic basmati rice with tender chicken, slow-cooked in Hyderabadi spices", category: "Biryani", variants: [{ id: "v_1", name: "Half", price: 220 }, { id: "v_2", name: "Full", price: 320 }], addOns: [{ id: "a_1", name: "Extra Raita", price: 40 }, { id: "a_2", name: "Double Meat", price: 120 }] },
    { id: "item_1_2", name: "Paneer Biryani", price: 280, description: "Fragrant rice with cottage cheese and garden-fresh vegetables", category: "Biryani", variants: [{ id: "v_1", name: "Half", price: 190 }, { id: "v_2", name: "Full", price: 280 }], addOns: [{ id: "a_1", name: "Extra Raita", price: 40 }] },
    { id: "item_1_3", name: "Butter Chicken", price: 360, description: "Creamy tomato-based curry with succulent chicken tikka", category: "Curries", variants: [], addOns: [{ id: "a_2", name: "Extra Butter", price: 50 }, { id: "a_3", name: "Garlic Naan", price: 60 }] },
  ],
  res_2: [
    { id: "item_2_1", name: "Margherita Pizza", price: 249, description: "Classic tomato sauce, mozzarella, and fresh basil", category: "Pizza", variants: [{ id: "v_1", name: "Regular", price: 249 }, { id: "v_2", name: "Large", price: 449 }], addOns: [{ id: "a_1", name: "Extra Cheese", price: 80 }, { id: "a_2", name: "Stuffed Crust", price: 100 }] },
    { id: "item_2_2", name: "Pepperoni Feast", price: 399, description: "Loaded with pepperoni, mozzarella, and Italian herbs", category: "Pizza", variants: [{ id: "v_1", name: "Regular", price: 399 }, { id: "v_2", name: "Large", price: 599 }], addOns: [{ id: "a_1", name: "Extra Cheese", price: 80 }, { id: "a_2", name: "Jalapenos", price: 50 }] },
    { id: "item_2_3", name: "Garlic Breadsticks", price: 149, description: "Freshly baked with garlic butter and herbs", category: "Sides", variants: [], addOns: [{ id: "a_1", name: "Cheesy Dip", price: 49 }] },
  ],
  res_3: [
    { id: "item_3_1", name: "Chole Bhature", price: 180, description: "Puffed bhaturas with spiced chickpea curry", category: "North Indian", variants: [{ id: "v_1", name: "2 Pcs", price: 180 }, { id: "v_2", name: "4 Pcs", price: 330 }], addOns: [{ id: "a_1", name: "Lassi", price: 60 }, { id: "a_2", name: "Pickle", price: 20 }] },
    { id: "item_3_2", name: "Masala Dosa", price: 150, description: "Crispy rice crepe with spiced potato filling", category: "South Indian", variants: [{ id: "v_1", name: "Plain", price: 120 }, { id: "v_2", name: "Masala", price: 150 }], addOns: [{ id: "a_1", name: "Extra Sambhar", price: 40 }, { id: "a_2", name: "Coconut Chutney", price: 30 }] },
    { id: "item_3_3", name: "Raj Kachori", price: 120, description: "Crispy shell filled with tangy chutneys and yogurt", category: "Street Food", variants: [], addOns: [{ id: "a_1", name: "Extra Sev", price: 25 }] },
  ],
  res_4: [
    { id: "item_4_1", name: "Veggie Delight Sub", price: 199, description: "Loaded with fresh veggies and choice of sauces", category: "Subs", variants: [{ id: "v_1", name: "6-inch", price: 199 }, { id: "v_2", name: "Footlong", price: 349 }], addOns: [{ id: "a_1", name: "Extra Cheese", price: 50 }, { id: "a_2", name: "Avocado", price: 80 }] },
    { id: "item_4_2", name: "Chicken Teriyaki", price: 249, description: "Savory chicken with sweet teriyaki sauce", category: "Subs", variants: [{ id: "v_1", name: "6-inch", price: 249 }, { id: "v_2", name: "Footlong", price: 449 }], addOns: [{ id: "a_1", name: "Extra Cheese", price: 50 }] },
  ],
  res_5: [
    { id: "item_5_1", name: "Idli Sambhar", price: 120, description: "Soft steamed rice cakes with lentil soup", category: "Breakfast", variants: [{ id: "v_1", name: "2 Pcs", price: 120 }, { id: "v_2", name: "4 Pcs", price: 220 }], addOns: [{ id: "a_1", name: "Extra Sambhar", price: 40 }, { id: "a_2", name: "Coconut Chutney", price: 30 }] },
    { id: "item_5_2", name: "Filter Coffee", price: 60, description: "Traditional South Indian filter coffee", category: "Beverages", variants: [], addOns: [] },
  ],
  res_6: [
    { id: "item_6_1", name: "Mutton Seekh Kebab", price: 380, description: "Minced mutton kebabs char-grilled to perfection", category: "Kebabs", variants: [{ id: "v_1", name: "Half Plate", price: 240 }, { id: "v_2", name: "Full Plate", price: 380 }], addOns: [{ id: "a_1", name: "Mint Chutney", price: 40 }, { id: "a_2", name: "Rumali Roti", price: 30 }] },
    { id: "item_6_2", name: "Mutton Korma", price: 480, description: "Rich, creamy mutton curry with aromatic spices", category: "Curries", variants: [], addOns: [{ id: "a_1", name: "Tandoori Roti", price: 20 }, { id: "a_2", name: "Naan", price: 40 }] },
  ],
  res_7: [
    { id: "item_7_1", name: "Chicken Fried Momo", price: 160, description: "Crispy fried momos with juicy chicken filling", category: "Momos", variants: [{ id: "v_1", name: "6 Pcs", price: 160 }, { id: "v_2", name: "10 Pcs", price: 260 }], addOns: [{ id: "a_1", name: "Peri Peri Dip", price: 30 }, { id: "a_2", name: "Cheese Dip", price: 40 }] },
    { id: "item_7_2", name: "Veg Steamed Momo", price: 130, description: "Classic steamed momos with mixed vegetable filling", category: "Momos", variants: [{ id: "v_1", name: "6 Pcs", price: 130 }, { id: "v_2", name: "10 Pcs", price: 210 }], addOns: [{ id: "a_1", name: "Spicy Red Chutney", price: 20 }] },
  ],
  res_8: [
    { id: "item_8_1", name: "Zinger Burger", price: 229, description: "Crispy chicken fillet with zesty mayo", category: "Burgers", variants: [{ id: "v_1", name: "Regular", price: 229 }, { id: "v_2", name: "Meal", price: 349 }], addOns: [{ id: "a_1", name: "Extra Cheese", price: 40 }] },
  ],
};

export const instamartProducts = [
  { id: "prod_1", name: "Amul Fresh Milk", variant: "500ml", price: 28, category: "Dairy & Breakfast" },
  { id: "prod_2", name: "Amul Fresh Milk", variant: "1L", price: 54, category: "Dairy & Breakfast" },
  { id: "prod_3", name: "Britannia Bread", variant: "400g", price: 40, category: "Dairy & Breakfast" },
  { id: "prod_4", name: "Kellogg's Corn Flakes", variant: "500g", price: 180, category: "Dairy & Breakfast" },
  { id: "prod_5", name: "Lays Classic", variant: "52g", price: 20, category: "Snacks" },
  { id: "prod_6", name: "Lays Classic", variant: "100g", price: 35, category: "Snacks" },
  { id: "prod_7", name: "Bingo Mad Angles", variant: "80g", price: 30, category: "Snacks" },
  { id: "prod_8", name: "Coca-Cola", variant: "500ml", price: 40, category: "Beverages" },
  { id: "prod_9", name: "Coca-Cola", variant: "1L", price: 65, category: "Beverages" },
  { id: "prod_10", name: "Bisleri Water", variant: "1L", price: 20, category: "Beverages" },
  { id: "prod_11", name: "Bisleri Water", variant: "2L", price: 35, category: "Beverages" },
  { id: "prod_12", name: "Parle-G Biscuits", variant: "200g", price: 25, category: "Snacks" },
  { id: "prod_13", name: "Maggi Noodles", variant: "70g", price: 14, category: "Instant Food" },
  { id: "prod_14", name: "Maggi Noodles", variant: "140g", price: 28, category: "Instant Food" },
  { id: "prod_15", name: "Tropicana Orange Juice", variant: "1L", price: 95, category: "Beverages" },
  { id: "prod_16", name: "Gillette Razor", variant: "Pack of 4", price: 120, category: "Personal Care" },
  { id: "prod_17", name: "Savlon Handwash", variant: "200ml", price: 55, category: "Personal Care" },
  { id: "prod_18", name: "Paper Boat Aamras", variant: "200ml", price: 45, category: "Beverages" },
];

// Per-session in-memory stores
export const carts = new Map<string, { restaurantId?: string; items: any[] }>();
export const imCarts = new Map<string, { items: any[] }>();
export const orders = new Map<string, any[]>();
export const addresses = new Map<string, any[]>();

export function ensureCart(sessionId: string) {
  if (!carts.has(sessionId)) carts.set(sessionId, { items: [] });
  return carts.get(sessionId)!;
}

export function ensureImCart(sessionId: string) {
  if (!imCarts.has(sessionId)) imCarts.set(sessionId, { items: [] });
  return imCarts.get(sessionId)!;
}

export function ensureAddresses(sessionId: string) {
  if (!addresses.has(sessionId)) {
    addresses.set(sessionId, [
      { id: "addr_1", label: "Home", address: "12/B, Krishna Nagar, Delhi - 110051", landmark: "Near Metro Gate 2" },
      { id: "addr_2", label: "Work", address: "Block 4, Sector 62, Noida - 201301", landmark: "Next to HCL Tower" },
    ]);
  }
  return addresses.get(sessionId)!;
}

export function generateOrderId() {
  return `ORDER-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export function ensureOrders(sessionId: string) {
  if (!orders.has(sessionId)) orders.set(sessionId, []);
  return orders.get(sessionId)!;
}
