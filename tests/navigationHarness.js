import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parse, compileScript } from "vue/compiler-sfc";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Vue = require("vue");

// Render the real page and food form; other panels are outside these journeys.
export async function mountNavigationHarness() {
  const nutrients = { carbohydrateGrams: 0, proteinGrams: 0, fatGrams: 0, energyKcal: 0 };
  const cycle = { id: "active", startDate: "2026-10-03", endDate: "2026-12-31", status: "active" };
  const groups = ["breakfast", "morning-snack", "lunch", "evening-snack", "dinner", "post-workout"];
  const names = ["早餐", "午加餐", "午餐", "晚加餐", "晚餐", "练后餐"];
  let snapshot = {
    profile: { nickname: "测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false },
    today: "2026-10-05", selectedDate: "2026-10-05", selectedCycle: cycle, activeCycle: cycle, cycles: [cycle],
    dateStrip: [], bmi: 22.9, actual: nutrients, baseline: { ...nutrients, energyKcal: 1715 },
    mealGroups: groups.map((id, i) => ({ id, name: names[i], hidden: false, meals: [], actual: nutrients })),
    mealCorrections: [], originalMeals: [], isBlankDate: false,
  };
  const savedMeals = [];
  let writeFailure = false;
  const food = { id: "egg", name: "全蛋（按个）", unit: "item", baseAmount: 1, nutrients: { ...nutrients, energyKcal: 72 } };
  const runtime = {
    fatLossDiary: {
      getPlatformCapabilities: () => ({}),
      openDiary: async () => snapshot,
      saveMeal: async (input) => {
        if (writeFailure) throw new Error("测试保存失败");
        savedMeals.push(input);
        snapshot = { ...snapshot, actual: { ...nutrients, energyKcal: input.amount * 72 } };
        return snapshot;
      },
    },
    foodLibrary: { browse: async () => ({ foods: [food], favoriteIds: [] }), preview: async () => food.nutrients },
  };
  const cache = new Map();
  function component(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const file = new URL("../" + relative, import.meta.url);
    const { descriptor } = parse(readFileSync(file, "utf8"), { filename: file.pathname });
    const script = compileScript(descriptor, { id: relative, inlineTemplate: true });
    const compiled = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod = { exports: {} };
    const localRequire = (name) => {
      // The host models native input values instead of browser DOM events.
      if (name === "vue") return { ...Vue, vModelText: { mounted: (el, binding) => { el.value = binding.value; }, beforeUpdate: (el, binding) => { el.value = binding.value; } } };
      if (name.endsWith("application/runtime")) return runtime;
      if (name.endsWith("FoodLibrary.vue")) return { default: component("src/components/FoodLibrary.vue") };
      if (name.endsWith("foodLibrary")) return { parseFoodNumber: (value) => { const n = Number(value); if (!(n > 0)) throw new Error("食用量必须大于 0"); return n; } };
      if (name.endsWith("trainingImages")) return { trainingImage: () => "" };
      if (name.endsWith(".vue")) return { default: { render: () => null } };
      throw new Error("Unexpected test import: " + name);
    };
    new Function("require", "module", "exports", compiled)(localRequire, mod, mod.exports);
    cache.set(relative, mod.exports.default);
    return mod.exports.default;
  }
  function node(type, text = "") { return { type, text: typeof text === "string" ? text : "", value: "", props: {}, children: [], parent: undefined }; }
  const root = node("root");
  const renderer = Vue.createRenderer({
    createElement: node, createText: (text) => node("text", text), createComment: () => node("comment"),
    setText: (el, text) => { el.text = text; }, setElementText: (el, text) => { el.text = text; el.children = []; },
    patchProp: (el, key, _old, value) => { el.props[key] = value; },
    insert: (el, parent, anchor) => { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(i < 0 ? parent.children.length : i, 0, el); },
    remove: (el) => { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); },
    parentNode: (el) => el.parent, nextSibling: (el) => el.parent?.children[el.parent.children.indexOf(el) + 1],
  });
  globalThis.uni = { pageScrollTo() {} };

  const app = renderer.createApp(component("src/pages/index/index.vue"));
  app.config.warnHandler = () => {};
  app.mount(root);
  const flush = async () => { await Vue.nextTick(); await new Promise((resolve) => setTimeout(resolve, 0)); await Vue.nextTick(); };
  await flush();
  const all = (el = root) => [el, ...el.children.flatMap((child) => all(child))];
  const content = (el) => el.text + el.children.map(content).join("");
  return {
    async click(label) { const el = all().find((e) => e.type === "button" && (e.props["aria-label"] || content(e).trim()) === label); if (!el) throw new Error("Missing button " + label); el.props.onClick(); await flush(); },
    async input(label, value) { const el = all().find((e) => e.type === "input" && e.props["aria-label"] === label); if (!el) throw new Error("Missing input " + label); el.props["onUpdate:modelValue"](value); await flush(); },
    amount: () => all().find((e) => e.type === "input" && e.props["aria-label"] === "食用量（个）")?.value,
    hasSelection: () => all().some((e) => e.props.class === "selection"),
    text: () => content(root),
    savedMeals: () => savedMeals,
    failWrites: (value) => { writeFailure = value; },
    dispose: () => { app.unmount(); delete globalThis.uni; },
  };
}
