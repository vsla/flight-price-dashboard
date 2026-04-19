module.exports = {
  apps: [
    {
      name: 'flightsearch-backend',
      cwd: '/opt/flightsearch/backend',
      script: 'dist/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
    {
      name: 'flightsearch-frontend',
      cwd: '/opt/flightsearch/frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
}
