import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Stock images by category
const IMAGES: Record<string, string[]> = {
  cafe: [
    "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop",
  ],
  restaurant: [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1550966871-3ed3cdb51f3a?w=400&h=300&fit=crop",
  ],
  bar: [
    "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=400&h=300&fit=crop",
  ],
  fast_food: [
    "https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&h=300&fit=crop",
  ],
  default: [
    "https://images.unsplash.com/photo-1579027989536-b7b1f875659b?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&h=300&fit=crop",
  ],
};

function getImage(amenity: string, index: number): string {
  const pool = IMAGES[amenity] || IMAGES.default;
  return pool[index % pool.length];
}

function getType(tags: any): { type: string; category: string } {
  const amenity = tags.amenity || "";
  const cuisine = tags.cuisine || "";

  if (amenity === "cafe") return { type: "Cafe", category: "Cafes" };
  if (amenity === "bar" || amenity === "pub") return { type: "Bar", category: "Bars" };
  if (amenity === "fast_food") return { type: "Fast Food", category: "Restaurants" };
  if (amenity === "restaurant") {
    if (cuisine) {
      const c = cuisine.split(";")[0].trim();
      return { type: `${c.charAt(0).toUpperCase() + c.slice(1)} Restaurant`, category: "Restaurants" };
    }
    return { type: "Restaurant", category: "Restaurants" };
  }
  return { type: "Eatery", category: "Restaurants" };
}

function getTags(tags: any): string[] {
  const result: string[] = [];
  if (tags.cuisine) result.push(tags.cuisine.split(";")[0].trim());
  if (tags.outdoor_seating === "yes") result.push("Outdoor Seating");
  if (tags.takeaway === "yes") result.push("Takeaway");
  if (tags.delivery === "yes") result.push("Delivery");
  if (tags.wheelchair === "yes") result.push("Accessible");
  if (tags.internet_access === "wlan" || tags.internet_access === "yes") result.push("WiFi");
  if (result.length === 0) {
    if (tags.amenity === "cafe") result.push("Coffee", "Pastries");
    if (tags.amenity === "bar") result.push("Cocktails", "Drinks");
    if (tags.amenity === "restaurant") result.push("Dine-in");
  }
  return result.slice(0, 2);
}

function getPrice(tags: any): string {
  // Guess from cuisine/amenity
  if (tags.amenity === "fast_food") return "$";
  if (tags.amenity === "cafe") return "$";
  if (tags.amenity === "bar" || tags.amenity === "pub") return "$$";
  return "$$";
}

function getHours(tags: any): string {
  if (tags.opening_hours) {
    // Simplify - just show raw
    const h = tags.opening_hours;
    if (h.length < 30) return h;
    return h.substring(0, 25) + "...";
  }
  return "Hours not listed";
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fakeRating(name: string): { rating: number; reviews: number } {
  // Deterministic fake rating based on name hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  const rating = 3.8 + (hash % 13) / 10; // 3.8 - 5.0
  const reviews = 50 + (hash % 950); // 50 - 999
  return { rating: Math.round(rating * 10) / 10, reviews };
}

export async function GET(request: NextRequest) {
  const lat = parseFloat(request.nextUrl.searchParams.get("lat") || "0");
  const lng = parseFloat(request.nextUrl.searchParams.get("lng") || "0");
  const radius = parseInt(request.nextUrl.searchParams.get("radius") || "2000");

  if (lat === 0 && lng === 0) {
    return Response.json([]);
  }

  // Query Overpass API for nearby food/drink places
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"="restaurant"](around:${radius},${lat},${lng});
      node["amenity"="cafe"](around:${radius},${lat},${lng});
      node["amenity"="bar"](around:${radius},${lat},${lng});
      node["amenity"="pub"](around:${radius},${lat},${lng});
      node["amenity"="fast_food"](around:${radius},${lat},${lng});
    );
    out body;
  `;

  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(15000),
    });

    const data = await r.json();
    const elements = data.elements || [];

    // Filter to named places only, map to our format
    const places = elements
      .filter((e: any) => e.tags?.name)
      .map((e: any, i: number) => {
        const tags = e.tags;
        const { type, category } = getType(tags);
        const dist = haversineKm(lat, lng, e.lat, e.lon);
        const { rating, reviews } = fakeRating(tags.name);

        return {
          name: tags.name,
          type,
          category,
          rating,
          reviews,
          distance: dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`,
          distanceRaw: dist,
          price: getPrice(tags),
          tags: getTags(tags),
          hours: getHours(tags),
          image: getImage(tags.amenity, i),
          address: tags["addr:street"]
            ? `${tags["addr:housenumber"] || ""} ${tags["addr:street"]}`.trim()
            : tags["addr:full"] || "Nearby",
          lat: e.lat,
          lng: e.lon,
        };
      })
      .sort((a: any, b: any) => a.distanceRaw - b.distanceRaw)
      .slice(0, 20);

    return Response.json(places);
  } catch (e) {
    return Response.json([]);
  }
}
