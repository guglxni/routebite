// ─────────────────────────────────────────────────────────────────────────────
// RouteBite Shared Types
// Used by both frontend (apps/web) and backend (apps/api)
// ─────────────────────────────────────────────────────────────────────────────

export type TransportMode = 'bus' | 'train' | 'car' | 'bike' | 'metro' | 'walk';

export type InterceptType = 'traffic_light' | 'stop' | 'petrol_pump' | 'toll_plaza' | 'dynamic';

export type ServerType = 'food' | 'instamart';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export type AlignmentLevel = 'excellent' | 'good' | 'fair' | 'poor';

export type TimingType = 'now' | 'auto';

export type JourneyStatus = 'active' | 'completed' | 'cancelled';

// ─── Geo ─────────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Address {
  formatted: string;
  landmark?: string;
  lat: number;
  lng: number;
}

export interface GPSPosition extends LatLng {
  accuracy?: number;
  timestamp: number;
}

// ─── Vehicle ─────────────────────────────────────────────────────────────────

export interface VehicleDetails {
  plateNumber?: string;
  color?: string;
  description: string;
}

// ─── Journey ─────────────────────────────────────────────────────────────────

export interface JourneyInput {
  origin: string;
  destination: string;
  transportMode: TransportMode;
  vehicleDetails: VehicleDetails;
}

export interface Journey {
  id: string;
  userId?: number;
  origin: Address;
  destination: Address;
  transportMode: TransportMode;
  vehicleDetails: VehicleDetails;
  routePolyline: string;
  status: JourneyStatus;
  createdAt: string;
}

// ─── Route Analysis ──────────────────────────────────────────────────────────

export interface RouteAnalysis {
  journeyId: string;
  routePolyline: LatLng[];
  intercepts: InterceptPoint[];
  estimatedDuration: number; // seconds
}

// ─── Intercept Point ─────────────────────────────────────────────────────────

export interface InterceptPoint {
  id: string;
  journeyId: string;
  lat: number;
  lng: number;
  type: InterceptType;
  score: number;
  estimatedDwellTime: number; // seconds
  restaurantCount?: number;
  safetyRating?: number;
  name?: string;
}

// ─── Restaurant / Food ───────────────────────────────────────────────────────

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string[];
  rating: number;
  etaFromIntercept: number; // minutes
  distance: number; // meters
  imageUrl?: string;
  isOpen: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // paise
  imageUrl?: string;
  variants: ItemVariant[];
  addons: Addon[];
  isVeg: boolean;
  category: 'recommended' | 'bestseller' | 'regular';
}

export interface ItemVariant {
  id: string;
  name: string;
  price: number; // paise (delta or absolute)
}

export interface Addon {
  id: string;
  name: string;
  price: number; // paise
}

export interface FoodCart {
  restaurantId: string;
  restaurantName: string;
  items: FoodCartItem[];
  total: number; // paise
}

export interface FoodCartItem {
  menuItemId: string;
  name: string;
  variantId?: string;
  variantName?: string;
  addonIds: string[];
  quantity: number;
  unitPrice: number; // paise
  subtotal: number; // paise
}

// ─── Instamart ───────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number; // paise
  sizeVariants: SizeVariant[];
  imageUrl?: string;
  inStock: boolean;
  labels: ('veg' | 'organic' | 'gluten_free')[];
}

export interface SizeVariant {
  id: string;
  size: string;
  price: number; // paise
}

export interface InstamartCart {
  items: InstamartCartItem[];
  total: number; // paise
}

export interface InstamartCartItem {
  productId: string;
  name: string;
  variantId: string;
  variantSize: string;
  quantity: number;
  unitPrice: number; // paise
  subtotal: number; // paise
}

// ─── Order ───────────────────────────────────────────────────────────────────

export interface OrderInput {
  interceptId: string;
  foodCart?: FoodCart;
  instamartCart?: InstamartCart;
  timing: TimingType;
}

export interface OrderResult {
  orderId: string;
  swiggyOrderId?: string;
  status: OrderStatus;
  server: ServerType;
  estimatedInterceptTime: string; // ISO timestamp
  totalAmount: number; // paise
}

export interface Order {
  id: string;
  userId?: number;
  journeyId?: string;
  interceptId?: string;
  swiggyOrderId?: string;
  server: ServerType;
  status: OrderStatus;
  totalAmount: number; // paise
  timingType: TimingType;
  placedAt?: string;
  createdAt: string;
}

// ─── Tracking ────────────────────────────────────────────────────────────────

export interface TrackingUpdate {
  customerETA: number; // seconds
  riderETA: number; // seconds
  orderStatus: OrderStatus;
  alignmentStatus: AlignmentStatus;
}

export interface AlignmentStatus {
  status: AlignmentLevel;
  color: string;
  customerETA: number; // seconds
  riderETA: number; // seconds
  orderReadyTime: number; // seconds
  recommendation?: string;
}

export interface RiderPosition {
  riderId: string;
  lat: number;
  lng: number;
  lastUpdated: number;
}

// ─── Swiggy MCP OAuth ────────────────────────────────────────────────────────

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

// ─── API Response Wrapper ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
