import { Router } from "express";
import { env } from "../config/env.js";

export const foodsRouter = Router();

function cleanBrand(val: unknown): string | null {
  const s = val ? String(val).trim() : "";
  return s && s !== "undefined" && s !== "null" ? s : null;
}

function mapUsdaFood(f: Record<string, unknown>) {
  const nutrients: Record<string, number> = {};
  const fnuts = (f.foodNutrients as Record<string, unknown>[] | undefined) ?? [];
  for (const n of fnuts) {
    const name = String(n.nutrientName ?? "");
    const val = Number(n.value ?? 0);
    if (name.includes("Energy")) nutrients.calories = val;
    else if (name.includes("Protein")) nutrients.proteinG = val;
    else if (name.includes("Carbohydrate")) nutrients.carbsG = val;
    else if (name.includes("Total lipid")) nutrients.fatG = val;
    else if (name.includes("Fiber")) nutrients.fiberG = val;
    else if (name.includes("Sugars")) nutrients.sugarG = val;
    else if (name.includes("Sodium")) nutrients.sodiumMg = val;
    else if (name.includes("Vitamin C")) nutrients.vitaminCMg = val;
    else if (name.includes("Vitamin D")) nutrients.vitaminDMcg = val;
    else if (name.includes("Vitamin B-12")) nutrients.vitaminB12Mcg = val;
    else if (name.includes("Iron")) nutrients.ironMg = val;
    else if (name.includes("Calcium")) nutrients.calciumMg = val;
    else if (name.includes("Potassium")) nutrients.potassiumMg = val;
    else if (name.includes("Magnesium")) nutrients.magnesiumMg = val;
    else if (name.includes("Zinc")) nutrients.zincMg = val;
    else if (name.includes("Folate")) nutrients.folateMcg = val;
    else if (name.includes("Vitamin A")) nutrients.vitaminAMcg = val;
    else if (name.includes("Vitamin K")) nutrients.vitaminKMcg = val;
    else if (name.includes("Cholesterol")) nutrients.cholesterolMg = val;
    else if (name.includes("Saturated")) nutrients.saturatedFatG = val;
  }
  return {
    id: `usda-${f.fdcId}`,
    fdcId: f.fdcId,
    name: f.description,
    brand: cleanBrand(f.brandOwner) ?? cleanBrand(f.brandName),
    category: f.foodCategory ?? null,
    dataType: f.dataType ?? null,
    source: "usda",
    servingSize: "100g",
    nutrients,
  };
}

foodsRouter.get("/search", async (req, res, next) => {
  try {
    const query = String(req.query.q ?? "");
    const pageSize = Number(req.query.limit ?? 20);
    const source = String(req.query.source ?? "all");
    if (!query.trim()) return res.json({ foods: [] });

    const results: object[] = [];
    const key = env.usdaApiKey || "DEMO_KEY";

    // ── Wger (free, no key, open nutrition database) ─────────────────────────
    if (source === "wger" || source === "all") {
      try {
        const wgerUrl = `https://wger.de/api/v2/ingredient/?format=json&name=${encodeURIComponent(query)}&language=2&limit=${pageSize}`;
        const wgerRes = await fetch(wgerUrl, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "NutriCore-App/1.0" } });
        if (wgerRes.ok) {
          const wgerData = await wgerRes.json() as { results?: Record<string, unknown>[] };
          const mapped = (wgerData.results ?? [])
            .filter(f => f.energy && Number(f.energy) > 0)
            .map(f => ({
              id: `wger-${f.id}`,
              name: String(f.name ?? ""),
              brand: null,
              category: "Whole Food",
              source: "wger",
              servingSize: "100g",
              imageUrl: null,
              nutrients: {
                calories: Number(f.energy ?? 0),
                proteinG: Number(f.protein ?? 0),
                carbsG: Number(f.carbohydrates ?? 0),
                fatG: Number(f.fat ?? 0),
                fiberG: Number(f.fiber ?? 0),
                sugarG: Number(f.carbohydrates_sugar ?? 0),
                sodiumMg: Number(f.sodium ?? 0) * 1000,
                saturatedFatG: Number(f.fat_saturated ?? 0),
              },
            }));
          results.push(...mapped);
        }
      } catch { /* Wger failed */ }
    }

    // USDA: Foundation + SR Legacy first (raw whole foods), then Branded
    if (source === "usda" || source === "all") {
      try {
        const rawUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&pageSize=${pageSize}&api_key=${key}`;
        const rawRes = await fetch(rawUrl, { signal: AbortSignal.timeout(9000) });
        if (rawRes.ok) {
          const rawData = await rawRes.json() as { foods?: Record<string, unknown>[]; error?: unknown };
          if (!rawData.error && Array.isArray(rawData.foods)) {
            results.push(...rawData.foods.map(mapUsdaFood));
          }
        }
        if (results.length < 8) {
          const brandedUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=Branded&pageSize=${Math.max(8, pageSize - results.length)}&api_key=${key}`;
          const brandedRes = await fetch(brandedUrl, { signal: AbortSignal.timeout(9000) });
          if (brandedRes.ok) {
            const bd = await brandedRes.json() as { foods?: Record<string, unknown>[]; error?: unknown };
            if (!bd.error && Array.isArray(bd.foods)) results.push(...bd.foods.map(mapUsdaFood));
          }
        }
      } catch { /* USDA failed */ }
    }

    // Open Food Facts (packaged / international foods)
    if (source === "off" || source === "all") {
      try {
        const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=id,product_name,brands,categories,nutriments,serving_size,image_url`;
        const offRes = await fetch(offUrl, { signal: AbortSignal.timeout(9000), headers: { "User-Agent": "NutriCore-App/1.0" } });
        if (offRes.ok) {
          const data = await offRes.json() as { products?: Record<string, unknown>[] };
          const mapped = (data.products ?? []).filter((p) => p.product_name).map((p) => {
            const n = (p.nutriments as Record<string, number>) ?? {};
            return {
              id: `off-${p.id ?? p.code}`,
              name: p.product_name,
              brand: cleanBrand(p.brands),
              category: p.categories ?? null,
              source: "openfoodfacts",
              servingSize: p.serving_size ?? "100g",
              imageUrl: p.image_url ?? null,
              nutrients: {
                calories: n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0,
                proteinG: n.proteins_100g ?? 0,
                carbsG: n.carbohydrates_100g ?? 0,
                fatG: n.fat_100g ?? 0,
                fiberG: n.fiber_100g ?? 0,
                sugarG: n.sugars_100g ?? 0,
                sodiumMg: (n.sodium_100g ?? 0) * 1000,
                saturatedFatG: n["saturated-fat_100g"] ?? 0,
                potassiumMg: n.potassium_100g ?? 0,
              },
            };
          });
          results.push(...mapped);
        }
      } catch { /* OFF failed */ }
    }

    res.json({ foods: results });
  } catch (error) { next(error); }
});

foodsRouter.get("/barcode/:code", async (req, res, next) => {
  try {
    const code = req.params.code;
    const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,brands,categories,nutriments,serving_size,image_url`, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "NutriCore-App/1.0" } });
    if (!offRes.ok) return res.status(404).json({ message: "Product not found" });
    const data = await offRes.json() as { status: number; product?: Record<string, unknown> };
    if (data.status === 0 || !data.product) return res.status(404).json({ message: "Product not found" });
    const p = data.product;
    const n = (p.nutriments as Record<string, number>) ?? {};
    res.json({ food: { id: `off-${code}`, name: p.product_name, brand: cleanBrand(p.brands), category: p.categories ?? null, source: "openfoodfacts", servingSize: p.serving_size ?? "100g", imageUrl: p.image_url ?? null, nutrients: { calories: n["energy-kcal_100g"] ?? 0, proteinG: n.proteins_100g ?? 0, carbsG: n.carbohydrates_100g ?? 0, fatG: n.fat_100g ?? 0, fiberG: n.fiber_100g ?? 0, sugarG: n.sugars_100g ?? 0, sodiumMg: (n.sodium_100g ?? 0) * 1000 } } });
  } catch (error) { next(error); }
});

foodsRouter.get("/articles", async (_req, res, next) => {
  try {
    const articles: object[] = [];
    try {
      const response = await fetch("https://www.healthline.com/nutrition/feed", { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "NutriCore-App/1.0" } });
      if (response.ok) {
        const xml = await response.text();
        const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
        for (const item of items.slice(0, 8)) {
          const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ?? item.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
          const link = item.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
          const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ?? "";
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
          if (title && link) articles.push({ title: title.replace(/&amp;/g, "&"), url: link.trim(), summary: desc.replace(/<[^>]+>/g, "").slice(0, 200).trim(), publishedAt: pubDate, imageUrl: null, source: "healthline.com" });
        }
      }
    } catch { /* feed failed */ }

    if (articles.length === 0) {
      articles.push(
        { title: "10 Evidence-Based Health Benefits of Eating Less Sugar", url: "https://www.healthline.com/nutrition/10-disturbing-reasons-why-sugar-is-bad", summary: "High sugar intake is linked to obesity, heart disease, and diabetes.", source: "healthline.com", imageUrl: null, publishedAt: "" },
        { title: "How Much Protein Do You Need Per Day?", url: "https://www.healthline.com/nutrition/how-much-protein-per-day", summary: "Protein requirements depend on your body weight, activity level, age, and health goals.", source: "healthline.com", imageUrl: null, publishedAt: "" },
        { title: "The 20 Most Weight-Loss-Friendly Foods", url: "https://www.healthline.com/nutrition/20-most-weight-loss-friendly-foods", summary: "Certain foods can help you lose weight by keeping you full and boosting metabolism.", source: "healthline.com", imageUrl: null, publishedAt: "" },
        { title: "Fiber: The Carb That Helps You Manage Diabetes", url: "https://www.healthline.com/nutrition/fiber-and-diabetes", summary: "Dietary fiber slows glucose absorption and can help manage blood sugar levels.", source: "healthline.com", imageUrl: null, publishedAt: "" },
        { title: "13 Foods That Are Good for Your Heart", url: "https://www.healthline.com/nutrition/heart-healthy-foods", summary: "Eating heart-healthy foods rich in fruits and vegetables lowers heart disease risk.", source: "healthline.com", imageUrl: null, publishedAt: "" },
        { title: "Omega-3 Fatty Acids: An Essential Contribution", url: "https://www.healthline.com/nutrition/omega-3-fatty-acids-guide", summary: "Omega-3s from fish, flaxseed, and walnuts are vital for brain and heart health.", source: "healthline.com", imageUrl: null, publishedAt: "" },
      );
    }
    res.json({ articles });
  } catch (error) { next(error); }
});
