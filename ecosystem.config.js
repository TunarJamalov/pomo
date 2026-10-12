module.exports = {
  apps: [
    {
      name: "pomobot",
      script: "index.js",
      cwd: "./apps/bot",
      exp_backoff_restart_delay: 5000,   // Start with 5s delay, doubles each crash (max ~16min)
      max_restarts: 10,                  // Stop restarting after 10 consecutive failures
      restart_delay: 3000,               // Minimum 3s between any restart
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "pomofocus-web",
      script: "npm",
      args: "start",
      cwd: "./apps/web",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
