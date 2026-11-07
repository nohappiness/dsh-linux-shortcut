/**
 * dsh-linux-shortcut 宿主半：在首页 `<head>` 首部注入一行平台映射脚本。
 *
 * 为什么是这一条缝（判据来自 core 源码，不是推测）：
 * - `packages/client/shortcuts/src/client/dom.ts:18` 的 `detectEnvironment()` 在网页端用
 *   `navigator.platform` 判平台，Linux → `'linux'`；
 * - 产品里所有功能命令只登记 `web:macos` / `web:windows`，`resolveShortcutDefault()` 严格按
 *   `${runtime}:${platform}` 取值，取不到即未绑定；
 * - `isWebBindingAllowed()` 对 linux 只放行 `Ctrl+/`、`Ctrl+Shift+,`、`Ctrl+Shift+.`，
 *   `bindingIssue()` 因此把其余组合判成 `unsupported-browser`（编辑器不落盘）。
 *
 * 于是**只要让浏览器在 shortcuts 服务构造之前把自己认成 Windows**，整套 keymap 就按
 * `web:windows` 解析：默认键位、设置页键帽、改键持久化、菜单里的快捷键提示全部回到同一事实源，
 * 不需要插件自己维护第二份键位表，也不去碰 core 的私有字段。
 *
 * 注入位置为什么够早：`renderIndex()` 的顺序是「先渲染 `webserver/index-inject` 结构化行，
 * 再跑 taps」。taps 是字符串替换，贴在 `<head>` 起始就排在 `window.__ModuleLoader__` 队列脚本
 * 与 bootstrap `<script src>` 之前 —— 而 `webserver/index-inject` 只能追加到表尾，太晚。
 */

/** cordis 插件名：与 npm 包名、cordis.patch.yml 的 row name 一致。 */
export const name = 'dsh-linux-shortcut'

/** 需要一个能改写首页 HTML 的 Web 服务器服务。 */
export const inject = ['webServer']

/** 脚本标记：既是幂等标记，也便于在 DevTools 的 Elements 面板里确认注入点。 */
const MARKER = 'data-dsh-linux-shortcut'

/**
 * 平台映射脚本。
 *
 * 只在 Linux 上生效，且排除 Android（Android 的 `navigator.platform` 也是 `Linux ...`，
 * 但那边没有 Ctrl 语义）。先尝试在 navigator 实例上遮蔽，失败再退到 Navigator.prototype。
 */
const PLATFORM_SCRIPT = [
  '<script ' + MARKER + '="platform">',
  '!function(){try{',
  'var p=navigator.platform||"";',
  'if(!/^Linux/i.test(p))return;',
  'if(/Android/i.test(navigator.userAgent||""))return;',
  'try{Object.defineProperty(navigator,"platform",{configurable:true,get:function(){return "Win32"}})}',
  'catch(e){try{Object.defineProperty(Navigator.prototype,"platform",{configurable:true,get:function(){return "Win32"}})}catch(e2){}}',
  '}catch(e){}}();',
  '</script>',
].join('')

/**
 * 把平台映射脚本插到 `<head>` 首部；没有 `<head>` 时原样返回（不猜结构）。
 * @param {string} html - 首页 HTML。
 * @returns {string} 注入后的 HTML；重复调用不会重复插入。
 */
export function injectPlatformMapping(html) {
  if (typeof html !== 'string' || html === '') return html
  if (html.indexOf(MARKER) >= 0) return html
  if (html.indexOf('<head>') >= 0) return html.replace('<head>', '<head>' + PLATFORM_SCRIPT)
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (tag) => tag + PLATFORM_SCRIPT)
  return html
}

/**
 * 挂一个 index 改写；卸载时由 tapIndex 返回的 disposer 撤掉。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.tapIndex(injectPlatformMapping), 'dsh-linux-shortcut: platform mapping')
}
