export function mountNavigationHarness(): Promise<{
  click(label: string): Promise<void>;
  input(label: string, value: string): Promise<void>;
  amount(): string | undefined;
  hasSelection(): boolean;
  text(): string;
  savedMeals(): Array<{ mealSlot: string; date: string; foodId: string; amount: number }>;
  failWrites(value: boolean): void;
  dispose(): void;
}>;
