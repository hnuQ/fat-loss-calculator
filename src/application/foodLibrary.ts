import type { CustomFood, DiaryRepository, Food, FoodLibraryState } from "../domain/diary";
import { builtInFoods } from "../domain/foods";
import {
  libraryState, recordFoodUse, scaleFoodNutrients, validateCustomFood,
  type CustomFoodInput,
} from "../domain/foodLibrary";

// MVP 只有一位本地用户；稳定所有者标识留给后续同步适配器映射。
const localOwnerId = "local-user";

export function availableFoods(library: FoodLibraryState): Food[] {
  return [...builtInFoods, ...library.customFoods.filter((food) => food.ownerId === localOwnerId && !food.deletedAt)];
}

export function createFoodLibrary(dependencies: {
  repository: DiaryRepository;
  now?: () => string;
  createId?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? (() => `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  async function read() {
    const state = await dependencies.repository.read() ?? { meals: [], weights: [] };
    state.foodLibrary = libraryState(state.foodLibrary);
    return state;
  }

  function ownedFood(library: FoodLibraryState, id: string): CustomFood {
    if (builtInFoods.some((food) => food.id === id)) throw new Error("内置食材只读，不能编辑或删除");
    const food = library.customFoods.find((candidate) => candidate.id === id && candidate.ownerId === localOwnerId && !candidate.deletedAt);
    if (!food) throw new Error("未找到自己的自定义食材");
    return food;
  }

  return {
    async browse(query = "", filter: "all" | "recent" | "favorites" | "custom" = "all") {
      const state = await read();
      const library = state.foodLibrary!;
      const all = availableFoods(library);
      const ids = filter === "recent" ? library.recentIds : library.favoriteIds;
      const foods = filter === "all" ? all : filter === "custom"
        ? all.filter((food) => library.customFoods.some((custom) => custom.id === food.id))
        : ids.map((id) => all.find((food) => food.id === id)).filter((food): food is Food => !!food);
      const normalized = query.trim().toLocaleLowerCase();
      return {
        foods: foods.filter((food) => food.name.toLocaleLowerCase().includes(normalized)),
        favoriteIds: [...library.favoriteIds],
      };
    },

    async saveCustomFood(input: CustomFoodInput, id?: string): Promise<CustomFood> {
      const validated = validateCustomFood(input);
      const state = await read();
      const library = state.foodLibrary!;
      const timestamp = now();
      const existing = id ? ownedFood(library, id) : undefined;
      const nextId = existing?.id ?? createId();
      if (!existing && (builtInFoods.some((food) => food.id === nextId) || library.customFoods.some((food) => food.id === nextId))) throw new Error("食材标识重复，请重试");
      const food: CustomFood = {
        ...validated, id: nextId, ownerId: localOwnerId,
        createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
        revision: (existing?.revision ?? 0) + 1, syncState: "local",
      };
      if (existing) library.customFoods[library.customFoods.indexOf(existing)] = food;
      else library.customFoods.push(food);
      await dependencies.repository.write(state);
      return food;
    },

    async deleteCustomFood(id: string): Promise<void> {
      const state = await read();
      const library = state.foodLibrary!;
      const food = ownedFood(library, id);
      food.deletedAt = now();
      food.updatedAt = food.deletedAt;
      food.revision += 1;
      library.favoriteIds = library.favoriteIds.filter((candidate) => candidate !== id);
      library.recentIds = library.recentIds.filter((candidate) => candidate !== id);
      await dependencies.repository.write(state);
    },

    async toggleFavorite(id: string): Promise<void> {
      const state = await read();
      const library = state.foodLibrary!;
      if (!availableFoods(library).some((food) => food.id === id)) throw new Error("未找到食材");
      library.favoriteIds = library.favoriteIds.includes(id)
        ? library.favoriteIds.filter((candidate) => candidate !== id) : [...library.favoriteIds, id];
      await dependencies.repository.write(state);
    },

    async preview(id: string, amount: number) {
      const state = await read();
      const library = state.foodLibrary!;
      const food = availableFoods(library).find((candidate) => candidate.id === id);
      if (!food) throw new Error("未找到食材");
      const nutrients = scaleFoodNutrients(food, amount);
      recordFoodUse(library, id);
      await dependencies.repository.write(state);
      return nutrients;
    },
  };
}
