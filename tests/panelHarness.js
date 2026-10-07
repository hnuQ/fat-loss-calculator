import { readFileSync } from "node:fs";
export { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { parse, compileScript } from "vue/compiler-sfc";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Vue = require("vue");

/** Resolves a relative import specifier to a repository-relative path. */
function resolvePath(fromRelative, specifier) {
  if (!specifier.startsWith(".")) throw new Error("Unexpected test import: " + specifier);
  const parts = fromRelative.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const path = parts.join("/");
  return path.endsWith(".vue") || path.endsWith(".ts") ? path : `${path}.ts`;
}

/**
 * Renders a real single-file component against injected dependencies, so panel copy and controls are
 * observable in the same headless host the page harness uses.
 */
export async function mountPanel(entry, options = {}) {
  const { runtime = {}, props = {}, uni: uniExtra = {}, stubs = {} } = options;
  const cache = new Map();
  const vueModule = {
    ...Vue,
    // The host models native input values instead of browser DOM events.
    vModelText: { mounted: (el, binding) => { el.value = binding.value; }, beforeUpdate: (el, binding) => { el.value = binding.value; } },
  };

  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const file = new URL("../" + relative, import.meta.url);
    const source = readFileSync(file, "utf8");
    const code = relative.endsWith(".vue")
      ? compileScript(parse(source, { filename: file.pathname }).descriptor, { id: relative, inlineTemplate: true }).content
      : source;
    const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod = { exports: {} };
    cache.set(relative, mod.exports);
    const localRequire = (specifier) => {
      if (specifier === "vue") return vueModule;
      const path = resolvePath(relative, specifier);
      const moduleName = path.endsWith(".ts") ? path.slice(0, -3) : path;
      if (moduleName in stubs) return stubs[moduleName];
      if (path in stubs) return stubs[path];
      if (moduleName === "src/application/runtime") return runtime;
      return load(path);
    };
    new Function("require", "module", "exports", compiled)(localRequire, mod, mod.exports);
    cache.set(relative, mod.exports);
    return mod.exports;
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
  globalThis.uni = { onAppShow() {}, offAppShow() {}, pageScrollTo() {}, showToast() {}, showModal() {}, ...uniExtra };

  const previousWarn = console.warn;
  console.warn = () => {};
  const app = renderer.createApp({ render: () => Vue.h(load(entry).default, props) });
  app.config.warnHandler = () => {};
  app.mount(root);
  const flush = async () => { await Vue.nextTick(); await new Promise((resolve) => setTimeout(resolve, 0)); await Vue.nextTick(); };
  await flush();
  console.warn = previousWarn;

  const all = (el = root) => [el, ...el.children.flatMap((child) => all(child))];
  const content = (el) => el.text + el.children.map(content).join("");
  return {
    flush,
    all,
    /** aria-labels of every native input and switch control, in render order. */
    controlLabels: () => all().filter((el) => ["input", "textarea", "switch"].includes(el.type) && el.props["aria-label"]).map((el) => el.props["aria-label"]),
    value: (label) => all().find((el) => el.type === "input" && el.props["aria-label"] === label)?.value,
    input: async (label, value) => { const el = all().find((e) => e.type === "input" && e.props["aria-label"] === label); if (!el) throw new Error("Missing input " + label); el.props["onUpdate:modelValue"](value); await flush(); },
    async click(label) { const el = all().find((e) => e.type === "button" && (e.props["aria-label"] || content(e).trim()) === label); if (!el) throw new Error("Missing button " + label); el.props.onClick(); await flush(); },
    text: () => content(root),
    dispose: () => { app.unmount(); delete globalThis.uni; },
  };
}
