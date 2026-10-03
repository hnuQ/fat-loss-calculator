import { decodeUtf8, encodeUtf8 } from "../application/diaryBackup";

interface WechatFiles {
  getRandomValues?: (options: { length: number; success: (result: { randomValues: ArrayBuffer }) => void; fail: () => void }) => void;
  env: { USER_DATA_PATH: string };
  getFileSystemManager(): {
    writeFile(options: { filePath: string; data: string; encoding: string; success: () => void; fail: (error: unknown) => void }): void;
    readFile(options: { filePath: string; encoding: string; success: (result: { data: string | ArrayBuffer }) => void; fail: (error: unknown) => void }): void;
  };
  chooseMessageFile(options: { count: number; type: string; extension: string[]; success: (result: { tempFiles: Array<{ path: string }> }) => void; fail: (error: unknown) => void }): void;
  shareFileMessage(options: { filePath: string }): void;
}
function wechat(): WechatFiles { return (globalThis as unknown as { wx: WechatFiles }).wx; }

export async function secureRandomBytes(length: number): Promise<Uint8Array> {
  // #ifdef APP-PLUS
  if (typeof plus !== "undefined" && plus.os.name === "Android") {
    const random = plus.android.newObject("java.security.SecureRandom");
    const bytes = plus.android.invoke(random, "generateSeed", length) as number[];
    const result = Uint8Array.from(bytes, (value) => (value + 256) % 256);
    if (result.length !== length) throw new Error("Android 安全随机源返回长度错误");
    return result;
  }
  // #endif
  // #ifdef MP-WEIXIN
  const wxRandom = wechat();
  if (typeof wxRandom.getRandomValues === "function") {
    return new Promise((resolve, reject) => wxRandom.getRandomValues!({ length, success: (result) => resolve(new Uint8Array(result.randomValues)), fail: () => reject(new Error("微信安全随机源调用失败")) }));
  }
  // #endif
  if (typeof globalThis.crypto?.getRandomValues === "function") return globalThis.crypto.getRandomValues(new Uint8Array(length));
  throw new Error("当前平台没有安全随机源，无法创建密码备份；请使用 Android App 或安全浏览器");
}

export async function saveBackupFile(name: string, content: string): Promise<string> {
  // #ifdef H5
  const blob = new Blob([encodeUtf8(content)], { type: name.endsWith(".csv") ? "text/csv;charset=utf-8" : "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "文件已下载";
  // #endif
  // #ifdef APP-PLUS
  return new Promise((resolve, reject) => plus.io.requestFileSystem(plus.io.PRIVATE_DOC, (filesystem) => {
    if (!filesystem.root) return reject(new Error("本地文件目录不可用"));
    filesystem.root.getDirectory("backups", { create: true }, (directory) => directory.getFile(name, { create: true }, (entry) => entry.createWriter((writer) => {
      writer.onerror = () => reject(new Error("写入备份文件失败"));
      writer.onwrite = () => resolve(entry.toLocalURL());
      writer.write(content);
    }, reject), reject), reject);
  }, reject));
  // #endif
  // #ifdef MP-WEIXIN
  const path = `${wechat().env.USER_DATA_PATH}/${name}`;
  await new Promise<void>((resolve, reject) => wechat().getFileSystemManager().writeFile({ filePath: path, data: content, encoding: "utf8", success: () => resolve(), fail: reject }));
  return path;
  // #endif
  throw new Error("当前平台不支持文件导出");
}

export async function readBackupFile(): Promise<string> {
  // #ifdef H5
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
    input.oncancel = () => reject(new Error("已取消选择"));
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || file.size > 20 * 1024 * 1024) return reject(new Error("请选择小于 20 MB 的完整备份"));
      try { resolve(decodeUtf8(new Uint8Array(await file.arrayBuffer()))); } catch { reject(new Error("文件不是有效 UTF-8")); }
    }; input.click();
  });
  // #endif
  // #ifdef MP-WEIXIN
  const path = await new Promise<string>((resolve, reject) => wechat().chooseMessageFile({ count: 1, type: "file", extension: ["json"], success: (result) => resolve(result.tempFiles[0].path), fail: reject }));
  return new Promise((resolve, reject) => wechat().getFileSystemManager().readFile({ filePath: path, encoding: "utf8", success: (result) => resolve(result.data as string), fail: reject }));
  // #endif
  throw new Error("请在下方填写 Android 导出文件路径或粘贴完整备份内容");
}

export async function readNativeBackupPath(path: string): Promise<string> {
  // #ifdef APP-PLUS
  if (!path.trim()) throw new Error("请填写备份文件路径");
  return new Promise((resolve, reject) => plus.io.resolveLocalFileSystemURL(path.trim(), (entry) => {
    const fileEntry = entry as unknown as { file: (success: (file: PlusIoFile) => void, fail: (error: unknown) => void) => void };
    if (typeof fileEntry.file !== "function") return reject(new Error("请选择备份文件，不能选择目录"));
    fileEntry.file((file) => {
    if (file.size === undefined || file.size > 20 * 1024 * 1024) return reject(new Error("备份文件大小未知或超过 20 MB"));
    const reader = new plus.io.FileReader();
    reader.onloadend = (event) => resolve(String((event as unknown as { target: { result: string } }).target.result));
    reader.onerror = () => reject(new Error("读取备份文件失败"));
    reader.readAsText(file, "utf-8");
  }, reject); }, reject));
  // #endif
  throw new Error("文件路径导入仅用于 Android App");
}

export function shareBackupFile(path: string): void {
  // #ifdef APP-PLUS
  try {
    const invoke = plus.android.invoke as unknown as (target: unknown, method: string, ...args: unknown[]) => unknown;
    const activity = plus.android.runtimeMainActivity();
    const file = plus.android.newObject("java.io.File", plus.io.convertLocalFileSystemURL(path));
    const packageName = invoke(activity, "getPackageName") as string;
    const uri = invoke("io.dcloud.common.util.DCloud_FileProvider", "getUriForFile", activity, `${packageName}.dc.fileprovider`, file);
    const intent = plus.android.newObject("android.content.Intent", "android.intent.action.SEND");
    invoke(intent, "setType", path.endsWith(".csv") ? "text/csv" : "application/json");
    invoke(intent, "putExtra", "android.intent.extra.STREAM", uri);
    invoke(intent, "addFlags", 1); // FLAG_GRANT_READ_URI_PERMISSION
    const chooser = invoke("android.content.Intent", "createChooser", intent, "分享备份文件");
    invoke(activity, "startActivity", chooser);
  } catch { uni.showToast({ title: "文件分享未启动，文件仍已保存", icon: "none" }); }
  return;
  // #endif
  // #ifdef MP-WEIXIN
  wechat().shareFileMessage({ filePath: path });
  return;
  // #endif
  uni.showToast({ title: "请分享已下载的文件", icon: "none" });
}
