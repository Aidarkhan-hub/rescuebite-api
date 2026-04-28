import { Allergen } from "@prisma/client";
import { z, ZodError } from "zod";
import { BadRequestError } from "../utils/errors";

export const EU_ALLERGENS = Object.values(Allergen);

export const allergenParseSchema = z.object({
  ingredients: z.array(z.string().min(1)).min(1, "At least one ingredient required"),
  userAllergens: z.array(z.nativeEnum(Allergen)).optional().default([]),
});

export type AllergenParseInput = z.infer<typeof allergenParseSchema>;

const INGREDIENT_ALLERGEN_MAP: Record<string, Allergen[]> = {
  wheat: [Allergen.GLUTEN], barley: [Allergen.GLUTEN], rye: [Allergen.GLUTEN],
  oats: [Allergen.GLUTEN], flour: [Allergen.GLUTEN], bread: [Allergen.GLUTEN],
  pasta: [Allergen.GLUTEN], noodle: [Allergen.GLUTEN],
  shrimp: [Allergen.CRUSTACEANS], crab: [Allergen.CRUSTACEANS],
  lobster: [Allergen.CRUSTACEANS], prawn: [Allergen.CRUSTACEANS],
  egg: [Allergen.EGGS], eggs: [Allergen.EGGS], mayonnaise: [Allergen.EGGS],
  salmon: [Allergen.FISH], tuna: [Allergen.FISH], cod: [Allergen.FISH],
  fish: [Allergen.FISH], anchovy: [Allergen.FISH],
  peanut: [Allergen.PEANUTS], groundnut: [Allergen.PEANUTS],
  soy: [Allergen.SOY], soya: [Allergen.SOY], tofu: [Allergen.SOY], edamame: [Allergen.SOY],
  milk: [Allergen.DAIRY], cheese: [Allergen.DAIRY], butter: [Allergen.DAIRY],
  cream: [Allergen.DAIRY], yogurt: [Allergen.DAIRY], lactose: [Allergen.DAIRY],
  almond: [Allergen.NUTS], walnut: [Allergen.NUTS], cashew: [Allergen.NUTS],
  pistachio: [Allergen.NUTS], hazelnut: [Allergen.NUTS], pecan: [Allergen.NUTS],
  celery: [Allergen.CELERY], celeriac: [Allergen.CELERY],
  mustard: [Allergen.MUSTARD],
  sesame: [Allergen.SESAME], tahini: [Allergen.SESAME],
  sulphite: [Allergen.SULPHITES], sulfite: [Allergen.SULPHITES],
  wine: [Allergen.SULPHITES], vinegar: [Allergen.SULPHITES],
  lupin: [Allergen.LUPIN], lupine: [Allergen.LUPIN],
  oyster: [Allergen.MOLLUSCS], mussel: [Allergen.MOLLUSCS],
  squid: [Allergen.MOLLUSCS], octopus: [Allergen.MOLLUSCS], clam: [Allergen.MOLLUSCS],
};

export interface AllergenParseResult {
  detectedAllergens: Allergen[];
  safeForUser: boolean;
  conflictingAllergens: Allergen[];
  ingredientBreakdown: Array<{ ingredient: string; allergens: Allergen[] }>;
}

export function parseAllergens(input: AllergenParseInput): AllergenParseResult {
  const detectedSet = new Set<Allergen>();
  const ingredientBreakdown: Array<{ ingredient: string; allergens: Allergen[] }> = [];

  for (const ingredient of input.ingredients) {
    const lower = ingredient.toLowerCase().trim();
    const found: Allergen[] = [];
    for (const [keyword, allergens] of Object.entries(INGREDIENT_ALLERGEN_MAP)) {
      if (lower.includes(keyword)) {
        allergens.forEach((a) => {
          detectedSet.add(a);
          if (!found.includes(a)) found.push(a);
        });
      }
    }
    ingredientBreakdown.push({ ingredient, allergens: found });
  }

  const detectedAllergens = Array.from(detectedSet);
  const conflictingAllergens = detectedAllergens.filter((a) =>
    input.userAllergens.includes(a)
  );

  return {
    detectedAllergens,
    safeForUser: conflictingAllergens.length === 0,
    conflictingAllergens,
    ingredientBreakdown,
  };
}

export function validateAllergenInput(raw: unknown): AllergenParseInput {
  const result = allergenParseSchema.safeParse(raw);
  if (!result.success) {
    // ZodError-дің issues массивін қолданамыз (errors емес)
    const messages = result.error.issues.map((i) => i.message).join("; ");
    throw new BadRequestError(messages);
  }
  return result.data;
}
