import { AnalyticsRepo } from './analytics-repo';

export interface Persistence {
  analytics: AnalyticsRepo;
}

export function createPersistence(): Persistence {
  return {
    analytics: new AnalyticsRepo(),
  };
}