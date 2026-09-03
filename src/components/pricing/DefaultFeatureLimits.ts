export const DefaultFeatureLimits = {
  free: { machine: 1, workflow: 3, private_model: false },
  pro: { machine: 5, workflow: 10, private_model: true },
  creator: { machine: 10, workflow: 30, private_model: true },
  business: { machine: 20, workflow: 100, private_model: true },
  enterprise: { machine: 100, workflow: 300, private_model: true },
} as const;
