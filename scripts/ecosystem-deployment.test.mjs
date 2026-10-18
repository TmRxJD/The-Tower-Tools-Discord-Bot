import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
test('PM2 ecosystem explicitly passes the pushed revision into the production process', () => {
  const previous = process.env.DEPLOYED_GIT_SHA
  try {
    process.env.DEPLOYED_GIT_SHA = 'a'.repeat(40)
    const config = require('../ecosystem.config.cjs')
    assert.equal(config.apps[0].env_production.DEPLOYED_GIT_SHA, process.env.DEPLOYED_GIT_SHA)
  } finally {
    if (previous === undefined) delete process.env.DEPLOYED_GIT_SHA
    else process.env.DEPLOYED_GIT_SHA = previous
  }
})
