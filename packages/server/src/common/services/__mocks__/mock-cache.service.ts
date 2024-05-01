export class MockCacheService {
  cache: Object;

  constructor() {
    this.cache = {};
  }

  get(key: string) {
    return this.cache[key];
  }

  set(key: string, value: string) {
    this.cache[key] = value;
  }

  del(key: string) {
    delete this.cache[key];
  }
}
