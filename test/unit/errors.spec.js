const proxyquire = require('proxyquire').noCallThru()
const { test, expect } = require('@playwright/test')

const electronMock = {
  app: {
    getVersion: () => '0.49.0',
    relaunch: () => {},
    exit: () => {},
    getPath: () => '/tmp'
  },
  shell: {
    openExternal: () => {},
    openPath: () => {}
  }
}

const i18nMock = { t: (key) => key }

const { generateErrorIssueUrl } = proxyquire('../../src/dialogs/errors', {
  electron: electronMock,
  i18next: i18nMock,
  './dialog': () => 0
})

const MAX_URL_LENGTH = 8000

function decodeBody (url) {
  const match = url.match(/[?&]body=([^&]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function decodeTitle (url) {
  const match = url.match(/[?&]title=([^&]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

test.describe('generateErrorIssueUrl', () => {
  test('returns FAQ link for known error patterns instead of a new-issue URL', () => {
    const e = { stack: 'Error: repo.lock is held by another process' }
    const url = generateErrorIssueUrl(e)
    expect(url).toBe('https://github.com/ipfs/ipfs-desktop?tab=readme-ov-file#i-got-a-repolock-error-how-do-i-resolve-this')
  })

  test.describe('known error routing', () => {
    const cases = [
      ['missing repo config on Unix', 'SyntaxError: Unexpected end of JSON input: Error: open /home/u/.ipfs/config: no such file or directory\n    at Daemon._getConfig (ipfsd-daemon.js:368:21)', 'https://github.com/ipfs/ipfs-desktop/issues/2259#issuecomment-1239275950'],
      ['missing repo config on Windows', 'SyntaxError: Unexpected end of JSON input: Error: open C:\\Users\\u\\.ipfs\\config: The system cannot find the file specified.\n    at Daemon._getConfig (ipfsd-daemon.js:368:21)', 'https://github.com/ipfs/ipfs-desktop/issues/2259#issuecomment-1239275950'],
      ['corrupted repo config', 'SyntaxError: C:\\Users\\u\\.ipfs\\config: Unexpected end of JSON input\n    at Object.readFileSync (jsonfile/index.js:52:17)\n    at readConfigFile (src/daemon/config.js:68:13)', 'https://github.com/ipfs/ipfs-desktop/issues/2849#issuecomment-2344641734'],
      ['kubo config key removed', 'Error: Initializing daemon...\nFATAL\tcmd/ipfs\tExperimental.StrategicProviding was removed. Remove it from your config.', 'https://github.com/ipfs/ipfs-desktop/issues/2937#issuecomment-2761563438'],
      ['kubo config decode failure', 'Error: Initializing daemon...\nError: failure to decode config: json: unknown field', 'https://github.com/ipfs/ipfs-desktop/issues/2937#issuecomment-2761563438'],
      ['hostname in an /ip4/ multiaddr', 'Error: invalid ip address\n    at ip2bytes (multiaddr/src/convert.js:106:11)', 'https://github.com/ipfs/ipfs-desktop/issues/2767#issuecomment-2163279665'],
      ['corrupted MFS root block', 'Error: error loading filesroot from dagservice: proto: invalid field number', 'https://github.com/ipfs/ipfs-desktop/issues/2882#issuecomment-2658038042'],
      ['windows refusing to run the bundled binary', 'Error: Command failed with EFTYPE: ipfs.exe daemon\nspawn EFTYPE\n    at ChildProcess.spawn (node:internal/child_process:421:11)', 'https://github.com/ipfs/ipfs-desktop/issues/3130#issuecomment-4391915927'],
      ['missing tray icon asset', "Error: Failed to load image from path '/opt/IPFS Desktop/resources/app.asar/assets/icons/tray/others/off-large.png'", 'https://github.com/ipfs/ipfs-desktop/issues/2471#issuecomment-1532503722'],
      ['macOS VPN breaking the go resolver', 'fatal error: invalid return from write: got 33554436, want 4', 'https://github.com/ipfs/ipfs-desktop/issues/2996#issuecomment-3352281827'],
      ['disk full on Unix', 'Error: ENOSPC: no space left on device, write', 'https://github.com/ipfs/ipfs-desktop/issues/3136#issuecomment-4106711346'],
      ['disk full on Windows', 'Error: write C:\\Users\\u\\.ipfs\\datastore\\000235.ldb: There is not enough space on the disk.', 'https://github.com/ipfs/ipfs-desktop/issues/3136#issuecomment-4106711346'],
      ['kubo binary never downloaded', 'Error: kubo binary not found, it may not be installed', 'https://github.com/ipfs/ipfs-desktop/issues/3031#issuecomment-4826112152']
    ]

    for (const [name, stack, url] of cases) {
      test(name, () => {
        expect(generateErrorIssueUrl({ stack })).toBe(url)
      })
    }

    test('the specific missing-block answer still wins over the general MFS root failure', () => {
      const stack = 'Error: error loading filesroot from dagservice: block was not found locally (offline): ipld: could not find QmFoo'
      expect(generateErrorIssueUrl({ stack })).toBe('https://github.com/ipfs/ipfs-desktop/issues/2882#issuecomment-2658038042')
    })

    test('the specific AcceleratedDHTClient answer still wins over the general decode failure', () => {
      const stack = 'Error: failure to decode config: The Experimental.AcceleratedDHTClient key has been moved to Routing.AcceleratedDHTClient'
      expect(generateErrorIssueUrl({ stack })).toBe('https://github.com/ipfs/ipfs-desktop/issues/2961#issuecomment-3083916364')
    })

    test('a readConfigFile frame without a SyntaxError is not treated as a corrupt config', () => {
      const stack = "Error: EACCES: permission denied, open '/home/u/.ipfs/config'\n    at readConfigFile (src/daemon/config.js:68:13)"
      expect(generateErrorIssueUrl({ stack })).toContain('https://github.com/ipfs/ipfs-desktop/issues/new')
    })
  })

  test('produces a new-issue URL for unknown errors', () => {
    const e = { stack: 'Error: something we have not seen before\n    at fn (file.js:1:1)' }
    const url = generateErrorIssueUrl(e)
    expect(url).toContain('https://github.com/ipfs/ipfs-desktop/issues/new')
    expect(url).toContain('title=')
    expect(url).toContain('body=')
  })

  test('keeps URL within the 8000-char safety limit even for very long stacks', () => {
    const longStack = 'Error: kaboom\n' + Array(2000).fill('    at someFunction (/very/long/path/to/file.js:123:45)').join('\n')
    const url = generateErrorIssueUrl({ stack: longStack })
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH)
  })

  test('preserves the last lines of the stack when truncating (where daemon errors live)', () => {
    const lastLine = 'Error: fs-repo-12-to-13/verify-repo-version: failed to verify repo'
    const longStack = [
      'Error: Initializing daemon...',
      ...Array(2000).fill('Fetching with HTTP: https://trustless-gateway.link/ipfs/Qm...'),
      lastLine
    ].join('\n')
    const url = generateErrorIssueUrl({ stack: longStack })
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH)
    expect(decodeBody(url)).toContain(lastLine)
  })

  test('includes a marker indicating omitted lines when truncated', () => {
    const longStack = 'Error: kaboom\n' + Array(2000).fill('    at fn (file.js:1:1)').join('\n')
    const url = generateErrorIssueUrl({ stack: longStack })
    expect(decodeBody(url)).toMatch(/\.\.\. \d+ lines omitted \.\.\./)
  })

  test('does not truncate stacks small enough to fit', () => {
    const stack = 'Error: small\n    at fn (file.js:1:1)\n    at fn2 (file.js:2:2)'
    const url = generateErrorIssueUrl({ stack })
    expect(decodeBody(url)).toContain(stack)
    expect(decodeBody(url)).not.toMatch(/lines omitted/)
  })

  test('issueTitle handles stacks without a newline', () => {
    const url = generateErrorIssueUrl({ stack: 'short error message no newlines' })
    expect(decodeTitle(url)).toBe('[gui error report] short error message no newlines')
  })

  test('issueTitle truncates very long single-line errors to 72 chars', () => {
    const longLine = 'Error: ' + 'a'.repeat(200)
    const url = generateErrorIssueUrl({ stack: longLine })
    const title = decodeTitle(url)
    expect(title.length).toBe('[gui error report] '.length + 72)
  })

  test('issueTitle handles missing stack gracefully', () => {
    const url = generateErrorIssueUrl({})
    expect(decodeTitle(url)).toBe('[gui error report] unknown error, no stacktrace')
  })

  test('properly encodes ampersand and other reserved chars in stack', () => {
    const e = { stack: 'Error: foo & bar = baz # qux\n    at fn (file.js:1:1)' }
    const url = generateErrorIssueUrl(e)
    // Query string must have exactly four params: labels, template, title, body.
    // An unencoded & in the body would inflate this count.
    const queryStart = url.indexOf('?')
    const params = url.slice(queryStart + 1).split('&')
    expect(params.length).toBe(4)
    // The literal & should be percent-encoded inside body.
    expect(url).toContain('%26')
    // Decoded body should still contain the original chars.
    expect(decodeBody(url)).toContain('foo & bar = baz # qux')
  })
})
