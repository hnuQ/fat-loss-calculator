export function readFileSync(path: string, encoding: "utf8"): string;
export function existsSync(path: string): boolean;

export type PanelControls = {
  flush(): Promise<void>;
  all(): Array<{ type: string; text: string; value: string; props: Record<string, any>; children: unknown[] }>;
  controlLabels(): string[];
  value(label: string): string | undefined;
  input(label: string, value: string): Promise<void>;
  click(label: string): Promise<void>;
  text(): string;
  dispose(): void;
};

export function mountPanel(
  entry: string,
  options?: { runtime?: Record<string, unknown>; props?: Record<string, unknown>; uni?: Record<string, unknown>; stubs?: Record<string, unknown> },
): Promise<PanelControls>;
