// node --test：宿主半的 index 改写（纯字符串）与 tapIndex 注册/卸载。

import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { apply, inject, injectPlatformMapping, name } from '../lib/index.js'

const FIXTURE = [
  '<!doctype html><html><head><meta charset="utf-8">',
  '<script src="/__dsh/modules.js"></script>',
  '<script src="/__dsh/boot.js"></script>',
  '</head><body><div id="root"></div></body></html>',
].join('')

function fakeCtx() {
  const taps = []
  const disposers = []
  const cleaned = []
  return {
    webServer: {
      tapIndex(transform) {
        taps.push(transform)
        return () => { disposers.push(transform) }
      },
    },
    effect(factory) {
      const dispose = factory()
      cleaned.push(dispose)
      return () => { if (typeof dispose === 'function') dispose() }
    },
    taps,
    disposers,
    cleaned,
  }
}

test('插件名与服务依赖', () => {
  assert.equal(name, 'dsh-linux-shortcut')
  assert.deepEqual(inject, ['webServer'])
})

test('脚本插在 <head> 首部，早于所有 bootstrap 脚本', () => {
  const output = injectPlatformMapping(FIXTURE)
  const head = output.indexOf('<head>')
  const marker = output.indexOf('data-dsh-linux-shortcut')
  const firstScript = output.indexOf('/__dsh/modules.js')

  assert.ok(head >= 0 && marker > head && firstScript > marker, '顺序必须是 <head> → 映射脚本 → bootstrap')
  assert.equal(output.includes('<body'), true, 'body 结构不能被破坏')
})

test('幂等：同一份 HTML 注入两次结果不变', () => {
  const once = injectPlatformMapping(FIXTURE)
  const twice = injectPlatformMapping(once)
  assert.equal(twice, once)
})

test('带属性的 <head> 也能命中', () => {
  const output = injectPlatformMapping('<!doctype html><html><head lang="zh"><title>t</title></head><body></body></html>')
  assert.match(output, /<head lang="zh"><script data-dsh-linux-shortcut="platform">/)
})

test('没有 <head> 时原样返回', () => {
  const html = '<!doctype html><html><body>no head</body></html>'
  assert.equal(injectPlatformMapping(html), html)
})

test('空值与非法输入不抛异常', () => {
  assert.equal(injectPlatformMapping(''), '')
  assert.equal(injectPlatformMapping(undefined), undefined)
  assert.equal(injectPlatformMapping(null), null)
})

test('脚本只改 Linux，排除 Android，目标值是 Win32', () => {
  const script = injectPlatformMapping(FIXTURE)
  assert.match(script, /\^Linux/i, '必须按 navigator.platform 判 Linux')
  assert.match(script, /Android/i, '必须排除 Android')
  assert.match(script, /return "Win32"/)
  assert.match(script, /Navigator\.prototype/, '实例遮蔽失败时要能退到原型')
})

test('脚本行为：Linux 变 Win32，Windows / macOS / Android 不动', () => {
  const html = injectPlatformMapping(FIXTURE)
  const start = html.indexOf('>', html.indexOf('data-dsh-linux-shortcut')) + 1
  const body = html.slice(start, html.indexOf('</script>', start))
  assert.ok(body.length > 0)

  const run = (platform, userAgent) => {
    const navigator = { platform, userAgent }
    const sandbox = { navigator, Navigator: function Navigator() {}, Object, RegExp, String }
    sandbox.globalThis = sandbox
    vm.createContext(sandbox)
    vm.runInContext(body, sandbox)
    return navigator.platform
  }

  assert.equal(run('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126'), 'Win32')
  assert.equal(run('Linux armv8l', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126'), 'Linux armv8l')
  assert.equal(run('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126'), 'Win32')
  assert.equal(run('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605'), 'MacIntel')
})

test('apply 注册一个 tapIndex 改写，并在 effect 清理时撤销', () => {
  const ctx = fakeCtx()
  apply(ctx)

  assert.equal(ctx.taps.length, 1)
  const tap = ctx.taps[0]
  assert.match(tap(FIXTURE), /data-dsh-linux-shortcut="platform"/)

  assert.equal(ctx.cleaned.length, 1)
  assert.equal(typeof ctx.cleaned[0], 'function')
  ctx.cleaned[0]()
  assert.equal(ctx.disposers.length, 1)
})
