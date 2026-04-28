import { parseAllergens, validateAllergenInput, EU_ALLERGENS } from "../../src/services/allergenService";
import { Allergen } from "@prisma/client";

describe("AllergenService — EU 14 allergen parser", () => {
  describe("EU_ALLERGENS enum coverage", () => {
    it("should have exactly 14 EU allergens", () => {
      expect(EU_ALLERGENS).toHaveLength(14);
    });

    it("should include all mandatory EU allergens", () => {
      const required = [
        "GLUTEN", "CRUSTACEANS", "EGGS", "FISH", "PEANUTS",
        "SOY", "DAIRY", "NUTS", "CELERY", "MUSTARD",
        "SESAME", "SULPHITES", "LUPIN", "MOLLUSCS",
      ];
      required.forEach((a) => expect(EU_ALLERGENS).toContain(a));
    });
  });

  describe("parseAllergens()", () => {
    it("detects GLUTEN from wheat-based ingredients", () => {
      const result = parseAllergens({
        ingredients: ["wheat flour", "water", "salt"],
        userAllergens: [],
      });
      expect(result.detectedAllergens).toContain(Allergen.GLUTEN);
    });

    it("detects DAIRY from cheese and butter", () => {
      const result = parseAllergens({
        ingredients: ["cheese", "butter", "tomato"],
        userAllergens: [],
      });
      expect(result.detectedAllergens).toContain(Allergen.DAIRY);
    });

    it("detects multiple allergens in one dish", () => {
      const result = parseAllergens({
        ingredients: ["egg", "wheat flour", "milk", "shrimp"],
        userAllergens: [],
      });
      expect(result.detectedAllergens).toContain(Allergen.EGGS);
      expect(result.detectedAllergens).toContain(Allergen.GLUTEN);
      expect(result.detectedAllergens).toContain(Allergen.DAIRY);
      expect(result.detectedAllergens).toContain(Allergen.CRUSTACEANS);
    });

    it("returns safeForUser=true when no conflicts with user allergens", () => {
      const result = parseAllergens({
        ingredients: ["tomato", "olive oil", "basil"],
        userAllergens: [Allergen.GLUTEN, Allergen.DAIRY],
      });
      expect(result.safeForUser).toBe(true);
      expect(result.conflictingAllergens).toHaveLength(0);
    });

    it("returns safeForUser=false when ingredient conflicts with user allergy", () => {
      const result = parseAllergens({
        ingredients: ["pasta", "tomato sauce"],
        userAllergens: [Allergen.GLUTEN],
      });
      expect(result.safeForUser).toBe(false);
      expect(result.conflictingAllergens).toContain(Allergen.GLUTEN);
    });

    it("returns empty detectedAllergens for allergen-free ingredients", () => {
      const result = parseAllergens({
        ingredients: ["apple", "sugar", "water"],
        userAllergens: [],
      });
      expect(result.detectedAllergens).toHaveLength(0);
      expect(result.safeForUser).toBe(true);
    });

    it("provides per-ingredient breakdown", () => {
      const result = parseAllergens({
        ingredients: ["egg", "tomato"],
        userAllergens: [],
      });
      const eggEntry = result.ingredientBreakdown.find((b) => b.ingredient === "egg");
      expect(eggEntry).toBeDefined();
      expect(eggEntry!.allergens).toContain(Allergen.EGGS);
    });
  });

  describe("validateAllergenInput()", () => {
    it("throws BadRequestError on empty ingredients", () => {
      expect(() => validateAllergenInput({ ingredients: [] })).toThrow();
    });

    it("throws BadRequestError on invalid allergen enum value", () => {
      expect(() =>
        validateAllergenInput({
          ingredients: ["wheat"],
          userAllergens: ["INVALID_ALLERGEN"],
        })
      ).toThrow();
    });

    it("accepts valid input with optional userAllergens", () => {
      const result = validateAllergenInput({
        ingredients: ["wheat", "egg"],
        userAllergens: ["GLUTEN"],
      });
      expect(result.ingredients).toEqual(["wheat", "egg"]);
      expect(result.userAllergens).toContain(Allergen.GLUTEN);
    });

    it("defaults userAllergens to empty array if omitted", () => {
      const result = validateAllergenInput({ ingredients: ["tomato"] });
      expect(result.userAllergens).toEqual([]);
    });
  });
});
