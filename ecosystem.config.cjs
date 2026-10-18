module.exports = {
  apps: [
    {
      name: 'toolsbot',
      script: 'dist/bot.js',
      cwd: __dirname,
      interpreter: 'node',
      exec_mode: 'fork',
      watch: false,
      // Containment for the Oct 3 heap incident; this is an RSS guard, not a leak fix.
      max_memory_restart: '1500M',
      // Let the existing 10-second shutdown deadline release Discord and instance locks.
      kill_timeout: 15_000,
      env: {
        NODE_ENV: 'development',
        DEPLOYMENT_MODE: 'dev',
      },
      env_production: {
        DEPLOYED_GIT_SHA: process.env.DEPLOYED_GIT_SHA,
        NODE_ENV: 'production',
        DEPLOYMENT_MODE: 'prod',
      },
    },
  ],
}