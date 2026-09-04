import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const action = process.argv[2]
const serviceName = 'toolsbot'
const envFilePath = '.env.prod'
const envKeys = [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'TRACKERAI_CLOUD_AI_ENDPOINT',
  'TRACKERAI_CLOUD_AI_API_KEY',
  'TRACKERAI_CLOUD_REASONING_MODEL',
  'TRACKERAI_CLOUD_FALLBACK_REASONING_MODEL',
  'APPWRITE_ENDPOINT',
  'APPWRITE_PROJECT_ID',
  'APPWRITE_API_KEY',
  'APPWRITE_CLOUD_DATABASE_ID',
  'APPWRITE_SETTINGS_DATABASE_ID',
  'APPWRITE_SETTINGS_COLLECTION_ID',
  'APPWRITE_MODULES_COLLECTION_ID',
  'APPWRITE_LABS_COLLECTION_ID',
  'APPWRITE_BOTS_COLLECTION_ID',
  'APPWRITE_WORKSHOP_COLLECTION_ID',
  'APPWRITE_CHART_COLLECTION_ID',
  'APPWRITE_STONE_COLLECTION_ID',
  'APPWRITE_THORNS_COLLECTION_ID',
  'APPWRITE_REMIND_COLLECTION_ID',
  'APPWRITE_CHECKLIST_COLLECTION_ID',
  'TRACKERAI_KB_STORAGE_BUCKET_ID',
  'TRACKERAI_KB_VERSION_FILE_ID',
  'TRACKERAI_KB_METADATA_FILE_ID',
  'TRACKERAI_KB_CHUNKS_FILE_ID',
  'TRACKERAI_KB_INDEX_FILE_ID',
]
const platformRegistry = getEnv('TMRXJD_PLATFORM_REGISTRY', 'https://npm.pkg.github.com')

function getEnv(name, fallback = '') {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : fallback
}

function run(command, options = {}) {
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
    ...options,
  })
}

function writeEnvFile() {
  const lines = [
    'NODE_ENV=production',
    'DEPLOYMENT_MODE=prod',
    `SERVICE_NAME=${getEnv('SERVICE_NAME', serviceName)}`,
  ]
  const platformVersion = getEnv('PLATFORM_VERSION')
  if (platformVersion) {
    lines.push(`PLATFORM_VERSION=${platformVersion}`)
  }
  for (const key of envKeys) {
    const value = getEnv(key)
    if (value) {
      lines.push(`${key}=${value}`)
    }
  }
  writeFileSync(envFilePath, `${lines.join('\n')}\n`, 'utf8')
}

function activateService() {
  try {
    execSync(`pm2 describe ${serviceName}`, { stdio: 'ignore', env: process.env })
    run(`pm2 restart ${serviceName} --update-env`)
  } catch {
    run('pm2 start ecosystem.config.cjs --env production')
  }
}

function updatePlatformDependency() {
  const version = getEnv('PLATFORM_VERSION')
  if (!version) {
    throw new Error('PLATFORM_VERSION is required')
  }
  run(`pnpm add @tmrxjd/platform@${version} --save-exact`)
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (major !== 22) {
    throw new Error(`Expected Node 22.x, received ${process.versions.node}`)
  }
}

function checkPnpmVersion() {
  const version = execSync('pnpm --version', { encoding: 'utf8', env: process.env }).trim()
  if (version !== '10.8.1') {
    throw new Error(`Expected pnpm 10.8.1, received ${version}`)
  }
}

function checkPm2() {
  execSync('pm2 --version', { stdio: 'ignore', env: process.env })
}

function checkPackageAccess() {
  // Do NOT swallow the error: a registry-auth failure here previously surfaced
  // only as "Command failed", which hid why the runner could not read the
  // package. Capture stdout/stderr and re-throw with the real diagnostic.
  try {
    execSync(`pnpm view @tmrxjd/platform version --registry ${platformRegistry} --json`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      encoding: 'utf8',
    })
  } catch (error) {
    const detail = [error?.stdout, error?.stderr].filter(Boolean).join('\n').trim()
    throw new Error(
      `Cannot read @tmrxjd/platform from ${platformRegistry}. `
      + `Ensure the runner has a GitHub Packages read token (NODE_AUTH_TOKEN / .npmrc).`
      + (detail ? `\n\nRegistry output:\n${detail}` : ''),
    )
  }
}

async function warnOnGlobalCommands() {
  return
}

async function preflight() {
  checkNodeVersion()
  checkPnpmVersion()
  checkPm2()
  checkPackageAccess()
  await warnOnGlobalCommands()
}

function report() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const platformVersion = packageJson.dependencies?.['@tmrxjd/platform'] ?? packageJson.devDependencies?.['@tmrxjd/platform'] ?? 'n/a'
  const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8', env: process.env }).trim()
  process.stdout.write(`service=${serviceName}\n`)
  process.stdout.write(`node=${process.versions.node}\n`)
  process.stdout.write(`pnpm=${pnpmVersion}\n`)
  process.stdout.write(`platform=${platformVersion}\n`)
  try {
    run(`pm2 status ${serviceName}`)
  } catch {
    process.stdout.write(`pm2_status=unavailable:${serviceName}\n`)
  }
}

switch (action) {
  case 'preflight':
    await preflight()
    break
  case 'write-env':
    writeEnvFile()
    break
  case 'activate':
    activateService()
    break
  case 'update-platform':
    updatePlatformDependency()
    break
  case 'report':
    report()
    break
  default:
    throw new Error(`Unsupported deploy action: ${action ?? '<missing>'}`)
}