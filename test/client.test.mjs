// node --test：浏览器半只做状态判定与设置行注册 —— 不接管按键、不复制键位表。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function loadBundle() {
  const registrations = []
  const window = {
    document: {
      head: { appendChild() {} },
      querySelector: () => null,
      createElement: () => ({ setAttribute() {}, textContent: '' }),
      documentElement: { dataset: {} },
    },
    navigator: { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
  }
  window.__ModuleLoader__ = { load: (registration) => { registrations.push(registration) } }

  const sandbox = { window, document: window.document, navigator: window.navigator, console, Map, Set, Object, Array, String, RegExp, Symbol }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)

  assert.equal(registrations.length, 1)
  const registration = registrations[0]
  assert.equal(registration.id, 'dsh-linux-shortcut')
  const module = registration.factory((specifier) => {
    assert.equal(specifier, 'react')
    return {
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
      useState: () => [0, () => {}],
      useEffect: () => undefined,
    }
  })
  return { module, window }
}

function env(patch) {
  const dataset = patch.desktop === true ? { platform: 'linux' } : {}
  return {
    navigator: { platform: patch.platform, userAgent: patch.userAgent },
    document: { documentElement: { dataset } },
  }
}

test('bundle 注册且只依赖 react', () => {
  const { module } = loadBundle()
  assert.equal(module.name, 'dsh-linux-shortcut')
  assert.equal(typeof module.apply, 'function')
})

test('映射生效：UA 仍是 Linux、platform 已是 Win32 → ok', () => {
  const { module } = loadBundle()
  const status = module.__internals.describeEnvironment(env({
    platform: 'Win32',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  }))
  assert.equal(status.tone, 'ok')
  assert.match(status.text, /web:windows|Windows 键位/)
})

test('映射未生效：仍报告 Linux → warn，并给出排查方向', () => {
  const { module } = loadBundle()
  const status = module.__internals.describeEnvironment(env({
    platform: 'Linux x86_64',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126',
  }))
  assert.equal(status.tone, 'warn')
  assert.match(status.text, /bundles/)
})

test('Android 不参与判定', () => {
  const { module } = loadBundle()
  const status = module.__internals.describeEnvironment(env({
    platform: 'Linux armv8l',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126',
  }))
  assert.equal(status.tone, 'muted')
  assert.match(status.text, /Android/)
})

test('真正的 Windows 设备不归本插件管', () => {
  const { module } = loadBundle()
  const status = module.__internals.describeEnvironment(env({
    platform: 'Win32',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126',
  }))
  assert.equal(status.tone, 'muted')
  assert.match(status.text, /不介入/)
})

test('桌面客户端（html 带 data-platform）不参与', () => {
  const { module } = loadBundle()
  const status = module.__internals.describeEnvironment(env({
    platform: 'Linux x86_64',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    desktop: true,
  }))
  assert.equal(status.tone, 'muted')
  assert.match(status.text, /桌面客户端/)
})

test('设置行渲染出标题与状态文案', () => {
  const { module } = loadBundle()
  const tree = module.__internals.PlatformRow()
  assert.equal(tree.props['data-plugin'], 'dsh-linux-shortcut')
  const [text] = tree.children
  const title = text.children[0]
  const desc = text.children[1]
  assert.equal(title.children[0], 'Linux 快捷键')
  assert.equal(typeof desc.props.className, 'string')
})

test('apply 把这一行注册进 settings.general.item', () => {
  const { module } = loadBundle()
  const registered = []
  const ctx = {
    inject(deps, callback) {
      assert.deepEqual([...deps], ['slots'])
      return callback({
        slots: {
          inject(name, factory) {
            assert.equal(name, 'settings.general.item')
            return factory()
          },
          register(options, component) {
            registered.push({ options, component })
            return () => {}
          },
        },
      })
    },
  }
  module.apply(ctx)

  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.id, 'linux-shortcuts')
  assert.equal(registered[0].options.order, 17)
  assert.equal(typeof registered[0].component, 'function')
})
