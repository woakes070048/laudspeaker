import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export class CacheServiceInvalidValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

@Injectable()
export class CacheService {
  @Inject(CACHE_MANAGER) private cacheManager: Cache;
  constructor() {}

  /**
   * Fetches data from the cache, using the given key. If there is data in the cache with the given key, then that data is returned.
   * If there is no such data in the cache (a cache miss), then null will be returned. However, if a callbackFn has been passed, the return value of the callbackFn will be written to the cache under the given cache key, and that return value will be returned.
   * let nextStep1 = await this.cacheService.get(Step, step.id, async () => {
   *  return await this.stepsService.lazyFindByID(step.id);
   * }, 10000);
   * let nextStep2 = await this.cacheService.get(Step, step.id);
   */
  async get(
    klass: any,
    id: string,
    callbackFn?: () => any,
    expiry?: number
  ): Promise<any> {
    const cacheKey = this.getCacheKey(klass, id);

    const result = await this.getRaw(cacheKey, callbackFn, expiry);

    return result;
  }

  async getIgnoreError(
    klass: any,
    id: string,
    callbackFn?: () => any,
    expiry?: number
  ): Promise<any> {
    let cacheKey: string;

    try {
      cacheKey = this.getCacheKey(klass, id);
    } catch (err) {
      if (err instanceof CacheServiceInvalidValueError) {
        return undefined;
      } else throw err;
    }

    const result = await this.getRaw(cacheKey, callbackFn, expiry);

    return result;
  }

  /**
   * let value = await this.cacheService.getRaw("some-cache-key", async () => {
   *  return await this.ApiService.client.getJsonValue("/index?limit=1");
   * });
   * let value = await this.cacheService.getRaw("some-cache-key");
   */
  async getRaw(
    cacheKey: string,
    callbackFn?: () => any,
    expiry?: number
  ): Promise<any> {
    this.assertValue(cacheKey);

    const cachedValue: string = await this.cacheManager.get(cacheKey);

    if (!this.isBlank(cachedValue)) return cachedValue;

    if (callbackFn) {
      const result = await callbackFn();

      await this.setRaw(
        cacheKey,
        async () => {
          return result;
        },
        expiry
      );

      return result;
    }
  }

  /**
   * await this.cacheService.set(Step, step.id, async () => {
   *  return await this.stepsService.lazyFindByID(step.id);
   * }, 10000);
   */
  async set(klass: any, id: string, callbackFn: () => any, expiry?: number) {
    const cacheKey = this.getCacheKey(klass, id);

    await this.setRaw(cacheKey, callbackFn, expiry);
  }

  /**
   * await this.cacheService.setRaw("some-cache-key", async () => {
   *  return "hello-there";
   * });
   */
  async setRaw(cacheKey: string, callbackFn: () => any, expiry?: number) {
    this.assertValue(cacheKey);

    const result = await callbackFn();

    await this.cacheManager.set(cacheKey, result, expiry);
  }

  /**
   */
  async delete(klass: any, id: string) {
    const cacheKey = this.getCacheKey(klass, id);

    return await this.deleteRaw(cacheKey);
  }

  /**
   */
  async deleteRaw(cacheKey: string) {
    this.assertValue(cacheKey);

    return await this.cacheManager.del(cacheKey);
  }

  private getCacheKey(klass: any, id: string): string {
    this.assertValue(id);

    return this.generateCacheKey(klass, id);
  }

  private generateCacheKey(klass: any, id: string): string {
    const key: string = `${this.getKlassName(klass)}:${id}`;

    return key;
  }

  private getKlassName(klass: any): string {
    let klassName: string;

    if (typeof klass === 'string' || klass instanceof String)
      klassName = klass.toString();
    else klassName = klass.name ?? klass.constructor?.name;

    this.assertValue(klassName);

    return klassName;
  }

  private assertValue(str: string) {
    if (this.isBlank(str))
      throw new CacheServiceInvalidValueError(
        `${this.constructor.name} cannot access cache with empty value`
      );
  }

  private isBlank(str: string) {
    return str === undefined || str === null || str === '';
  }
}
