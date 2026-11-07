# 设计取舍：Linux 网页端快捷键的三条路

结论：**走 C（宿主 `tapIndex` 注入平台映射）**。A 不可行，B 能跑但不该交付。

## A. 只用公开 API 的客户端插件 —— 不可行

插件能拿到的 `Shortcuts` 接口只有 `register / registerFixed / edit / describeBinding / catalog / config`，而：

- `ShortcutRegistry.register()` 对每个 `runtime × platform` 组合校验默认值，`web:linux` + `Ctrl+Alt+N` 直接 `throw new Error('Unsupported Web shortcut: …')`；
- `edit()` 走 `effectiveShortcuts()` 复算，该行 `issue = 'unsupported-browser'` → 返回冲突且不落盘。

所以插件最多只能申明 Linux 上本来就允许的三组键，补齐「一整套」在公开 API 层面做不到。

## B. 客户端插件摸内部状态 —— 可行，但带来三个结构性缺陷

`ShortcutRegistry` 没被导出，只能从服务实例上取（TS `private` 只是编译期：`this.registry`、`registry.commands`、`registry.bindings`），然后在 `refreshLabels()` 之后把 `control+alt+KeyN → command` 塞回 `bindings`。

代价：

1. **界面与行为不一致**：catalog 仍由 `effectiveShortcuts()` 生成，设置页继续显示「暂无快捷键」，改键产出的 `localStorage` 文档还会被复算成冲突；
2. **键帽不出现**：菜单、tooltip、`aria-keyshortcuts` 全部读 catalog；
3. **第二份键位表**：默认值、冲突检测、持久化都要自己再实现一遍，与 core 的两套数据只能靠约定同步。

## C. 宿主 `tapIndex` + `<head>` 首部平台映射 —— 走这条

`webServer.tapIndex(transform)` 是公开方法（`packages/host/webserver/src/index.ts:380`，仓库自己的测试 `webserver.spec.ts:407` 就是这么用的），在 `renderIndex()` 里于结构化注入行之后、返回响应之前跑字符串替换。

注入 `if (/^Linux/i.test(navigator.platform)) navigator.platform = 'Win32'` 之所以够干净：

- 全仓只有 `shortcuts/src/client/dom.ts:18` 读 `navigator.platform`，其余平台分支都读它派生出的 `platform`；
- 服务构造发生在 bootstrap 之后，而脚本贴在 `<head>` 起始，早于所有 bootstrap `<script src>`；
- 全部 9 个注册点的 `web:windows` 默认值自动生效，设置页键帽、改键、冲突检测、持久化全部回到 core 唯一事实源；
- 卸载插件 = 撤掉 tap，不需要改 dsh 安装树里的任何产物（相对改产品包的最大好处：升级 dsh 不丢）。

已知代价：键帽按 Windows 风格渲染（`Ctrl`，与 Linux 文案一致，Mac 不受影响因为脚本按 `/^Linux/` 判定）；`tapIndex` 属官方 "escape hatch"，非承诺 API，升级后需核对方法名。
