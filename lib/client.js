// dsh-linux-shortcut · 浏览器半：只做「映射有没有生效」的可见性，不接管按键。
//
// 键位本身由宿主半（lib/index.js）在首页 <head> 首部注入的平台映射解决：浏览器把自己报告成
// Windows，于是 `@deepseek-ai/dsh-client-shortcuts` 按 `${runtime}:${platform}` 取到
// `web:windows` 那套默认值 —— 默认键位、设置页键帽、改键持久化、菜单里的快捷键提示全部回到
// core 的同一事实源。
//
// 这里刻意不复制键位表、不读 ShortcutRegistry 的私有字段：一旦插件自己维护第二份 keymap，
// 设置页就会与真实行为不一致（catalog 仍按 effectiveShortcuts 计算，Linux 行是「未绑定」）。
//
// 唯一判断依据：navigator.userAgent 里还是 Linux，而 navigator.platform 已变成 Win32 ——
// 这两者同时成立就只可能是我们注入的映射生效了。

window.__ModuleLoader__.load({
  id: 'dsh-linux-shortcut',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var h = React.createElement

    /**
     * 判定当前环境与映射状态。
     * @param {Window|null} win
     * @returns {{tone: 'ok'|'warn'|'muted', text: string}}
     */
    function describeEnvironment(win) {
      var nav = win && win.navigator ? win.navigator : {}
      var platform = typeof nav.platform === 'string' ? nav.platform : ''
      var agent = typeof nav.userAgent === 'string' ? nav.userAgent : ''
      var root = win && win.document ? win.document.documentElement : null
      var dataset = root && root.dataset ? root.dataset : null
      var shell = dataset && dataset.platform !== undefined ? 'desktop' : 'web'

      if (shell === 'desktop') {
        return {
          tone: 'muted',
          text: '当前是桌面客户端（navigator.platform = ' + (platform || '未知') + '）。桌面端的键位由原生菜单接管，本插件只处理网页端。',
        }
      }
      if (/^Linux/i.test(platform) && /Android/i.test(agent)) {
        return { tone: 'muted', text: '当前是 Android，本插件跳过平台映射。' }
      }
      if (/^Linux/i.test(platform)) {
        return {
          tone: 'warn',
          text: '平台映射没有生效：浏览器仍把自己报告为 Linux，快捷键会继续缺失。'
            + '确认 dsh-linux-shortcut 已装进 profile 的 bundles，并在重启 dsh 后强刷页面。',
        }
      }
      if (/Linux/i.test(agent) && /^Win32/i.test(platform)) {
        return {
          tone: 'ok',
          text: '已把 Linux 映射为 Windows 键位：默认键位、设置页键帽与改键都按 web:windows 生效。'
            + 'Ctrl+/ 打开快捷键面板，或在 设置 → 快捷键 里逐条改键。',
        }
      }
      return {
        tone: 'muted',
        text: '当前设备报告为 ' + (platform || '未知') + '，本来就有默认键位，本插件不介入。',
      }
    }

    var STYLE_TEXT = [
      '.dls-row{display:flex;flex-direction:column;gap:4px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.dls-text{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.dls-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.dls-desc{margin:0;font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dls-row[data-tone="ok"] .dls-desc{color:var(--dsw-alias-label-secondary)}',
      '.dls-row[data-tone="warn"] .dls-desc{color:var(--dsw-alias-label-error)}',
    ].join('')

    function ensureStyle(doc) {
      if (!doc || !doc.head || typeof doc.createElement !== 'function') return
      try {
        if (doc.querySelector('style[data-plugin="dsh-linux-shortcut"]') !== null) return
        var tag = doc.createElement('style')
        tag.setAttribute('data-plugin', 'dsh-linux-shortcut')
        tag.textContent = STYLE_TEXT
        doc.head.appendChild(tag)
      } catch (error) {
        /* 样式失败不影响结论 */
      }
    }

    /** 设置 → 通用 里的一行状态。 */
    function PlatformRow() {
      var win = typeof window === 'undefined' ? null : window
      var status = describeEnvironment(win)
      return h('div', { className: 'dls-row', 'data-plugin': 'dsh-linux-shortcut', 'data-tone': status.tone },
        h('div', { className: 'dls-text' },
          h('div', { className: 'dls-title' }, 'Linux 快捷键'),
          h('p', { className: 'dls-desc' }, status.text)))
    }

    function apply(ctx) {
      var win = typeof window === 'undefined' ? null : window
      var doc = win ? win.document : (typeof document === 'undefined' ? null : document)
      ensureStyle(doc)
      if (ctx && typeof ctx.inject === 'function') {
        ctx.inject(['slots'], function (slotCtx) {
          var slots = slotCtx && slotCtx.slots
          if (!slots || typeof slots.inject !== 'function') return undefined
          return slots.inject('settings.general.item', function () {
            return slots.register(
              { name: 'settings.general.item', id: 'linux-shortcuts', order: 17 },
              PlatformRow,
            )
          })
        })
      }
    }

    module.exports = {
      name: 'dsh-linux-shortcut',
      apply: apply,
      // 仅供 test/ 直取纯函数。
      __internals: { describeEnvironment: describeEnvironment, PlatformRow: PlatformRow },
    }
    return module.exports
  },
})
