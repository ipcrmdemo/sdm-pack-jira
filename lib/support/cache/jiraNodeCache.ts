import NodeCache = require("node-cache");
import {JiraCache, JiraCacheStats} from "./jiraCache";

export class JiraNodeCache implements JiraCache {
    private readonly cache: NodeCache;
    constructor(options: NodeCache.Options) {
        this.cache = new NodeCache(options);
    }

    public get<T>(key: string | number): T | undefined {
        return this.cache.get(key);
    }

    public set<T>(key: string | number, value: T, ttl?: number | string): boolean {
        return this.cache.set(key, value, ttl);
    }

    public del(key: string | number): number {
        return this.cache.del(key);
    }

    public flushAll(): void {
        return this.cache.flushAll();
    }

    public getStats(): JiraCacheStats {
        return this.cache.getStats();
    }

}
